import { Inject, Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { PublicCacheService } from "../public-cache/public-cache.service";
import { EMAIL_QUEUE_CRITICAL, EMAIL_QUEUE_MARKETING, EMAIL_QUEUE_TRANSACTIONAL, TOPUP_QUEUE } from "../queue/queue.module";
import { PerfMetricsService, type PerfPeriod } from "./perf-metrics.service";

/** Thresholds for "stuck": the same order of magnitude the stuck-orders alert uses. */
const STUCK_PAID_MIN = 10;
const STUCK_PROCESSING_MIN = 30;

/**
 * Everything the admin Performance page shows, in one read. Aggregates only: no ids, IPs, routes
 * with ids in them, tokens or personal data.
 */
@Injectable()
export class PerformanceService {
  constructor(
    private perf: PerfMetricsService,
    private cache: PublicCacheService,
    private prisma: PrismaService,
    @Inject(TOPUP_QUEUE) private topup: Queue,
    @Inject(EMAIL_QUEUE_CRITICAL) private emailCritical: Queue,
    @Inject(EMAIL_QUEUE_TRANSACTIONAL) private emailTransactional: Queue,
    @Inject(EMAIL_QUEUE_MARKETING) private emailMarketing: Queue,
  ) {}

  async overview(period: PerfPeriod) {
    const [requests, users, nodes, cacheDaily, database, queues, stuckOrders] = await Promise.all([
      this.perf.snapshot(period).catch(() => null),
      this.perf.activeUsers().catch(() => null),
      this.perf.nodes().catch(() => []),
      this.cache.dailyStats(period === "7d" ? 7 : 1).catch(() => []),
      this.database(),
      this.queues(),
      this.stuckOrders(),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      requests,
      users,
      cache: cacheRatio(cacheDaily),
      nodes,
      database,
      queues,
      stuckOrders,
    };
  }

  private async database() {
    try {
      const [[conn], [max], replicas] = await Promise.all([
        this.prisma.$queryRaw<Array<{ total: number; active: number }>>`
          SELECT count(*)::int AS total, count(*) FILTER (WHERE state = 'active')::int AS active
          FROM pg_stat_activity`,
        this.prisma.$queryRaw<Array<{ max: string }>>`SELECT current_setting('max_connections') AS max`,
        // State and lag only -- client_addr is an IP and stays out of the page.
        this.prisma.$queryRaw<Array<{ state: string; lagSeconds: number | null }>>`
          SELECT state, EXTRACT(EPOCH FROM replay_lag)::float AS "lagSeconds" FROM pg_stat_replication`,
      ]);
      return {
        connections: conn.total,
        activeConnections: conn.active,
        maxConnections: Number(max.max),
        replicas: replicas.map((r) => ({ state: r.state, lagSeconds: r.lagSeconds })),
      };
    } catch {
      return null;
    }
  }

  private async queues() {
    const read = async (name: string, q: Queue) => {
      try {
        const c = await q.getJobCounts("waiting", "active", "delayed", "failed");
        return { name, waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0 };
      } catch {
        return { name, waiting: null, active: null, delayed: null, failed: null };
      }
    };
    return Promise.all([
      read("topup", this.topup),
      read("email-critical", this.emailCritical),
      read("email-transactional", this.emailTransactional),
      read("email-marketing", this.emailMarketing),
    ]);
  }

  private async stuckOrders() {
    const now = Date.now();
    const [paid, processing] = await Promise.all([
      this.prisma.order.count({ where: { status: "PAID", updatedAt: { lt: new Date(now - STUCK_PAID_MIN * 60_000) } } }),
      this.prisma.order.count({
        where: { status: "PROCESSING", updatedAt: { lt: new Date(now - STUCK_PROCESSING_MIN * 60_000) } },
      }),
    ]);
    return { paidOver10m: paid, processingOver30m: processing };
  }
}

/** Hit ratio over the given days, all groups together and per group. */
export function cacheRatio(daily: Array<{ day: string; groups: Record<string, Record<string, number>> }>) {
  const groups: Record<string, { hit: number; miss: number; ratio: number | null }> = {};
  let hit = 0;
  let miss = 0;
  for (const d of daily) {
    for (const [g, m] of Object.entries(d.groups)) {
      const row = (groups[g] ??= { hit: 0, miss: 0, ratio: null });
      row.hit += m.hit ?? 0;
      row.miss += m.miss ?? 0;
      hit += m.hit ?? 0;
      miss += m.miss ?? 0;
    }
  }
  for (const row of Object.values(groups)) row.ratio = row.hit + row.miss ? row.hit / (row.hit + row.miss) : null;
  return { days: daily.length, hit, miss, ratio: hit + miss ? hit / (hit + miss) : null, groups };
}
