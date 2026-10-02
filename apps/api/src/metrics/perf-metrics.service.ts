import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import IORedis from "ioredis";
import * as os from "node:os";
import { appRole } from "../common/app-role";

/** Latency histogram bucket upper bounds, ms. The last bucket is everything slower. */
export const LATENCY_BUCKETS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000] as const;

export type PerfPeriod = "5m" | "1h" | "24h" | "7d";
export const PERF_PERIODS: PerfPeriod[] = ["5m", "1h", "24h", "7d"];

const MINUTE_TTL_S = 2 * 60 * 60; // minute buckets only serve the 5 m and 1 h views
const HOUR_TTL_S = 8 * 24 * 60 * 60; // hour buckets serve 24 h and 7 d
const NODE_TTL_S = 60; // a node that stopped reporting disappears within a minute
const HEARTBEAT_MS = 15_000;

export interface PerfBucket {
  /** Bucket start, ISO. */
  t: string;
  requests: number;
  rps: number;
  avgMs: number;
  p95Ms: number;
  errors5xx: number;
}

export interface PerfTotals {
  requests: number;
  rps: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  status2xx: number;
  status3xx: number;
  status4xx: number;
  status5xx: number;
  status429: number;
}

export interface NodeReport {
  label: string;
  role: string;
  cpuPercent: number;
  memUsedMb: number;
  memTotalMb: number;
  load1: number;
  processRssMb: number;
  uptimeS: number;
  reportedAt: string;
}

/**
 * Aggregate request performance and node health, for the admin "Performance" page.
 *
 * Everything is aggregated: counters per minute and per hour, a latency histogram, and a
 * HyperLogLog of user ids for "active users" (it stores a cardinality sketch, from which no id can be
 * read back). No route, IP, token or payload is recorded.
 *
 * Its own fail-fast Redis connection (no offline queue, 200 ms timeout): with Redis down the request
 * is never delayed and the sample is simply lost.
 */
@Injectable()
export class PerfMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PerfMetricsService.name);
  private timer?: NodeJS.Timeout;
  private lastCpu = cpuTotals();

  constructor(private readonly redis: IORedis) {}

  static connect(): IORedis {
    const client = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 200,
      connectTimeout: 2000,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    client.on("error", () => undefined);
    return client;
  }

  onModuleInit() {
    this.timer = setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    this.timer.unref();
    void this.heartbeat();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.redis.disconnect();
  }

  /** One finished response. Never throws, never awaited by the request. */
  record(statusCode: number, durationMs: number, userId?: string | null, now = new Date()): void {
    const minute = minuteKey(now);
    const hour = hourKey(now);
    const bucket = bucketIndex(durationMs);
    const cls = `s${Math.floor(statusCode / 100)}`;
    const p = this.redis.pipeline();
    for (const [key, ttl] of [
      [`perf:m:${minute}`, MINUTE_TTL_S],
      [`perf:h:${hour}`, HOUR_TTL_S],
    ] as const) {
      p.hincrby(key, "n", 1);
      p.hincrby(key, "sum", Math.round(durationMs));
      p.hincrby(key, cls, 1);
      if (statusCode === 429) p.hincrby(key, "s429", 1);
      p.hincrby(key, `b${bucket}`, 1);
      p.expire(key, ttl);
    }
    if (userId) {
      p.pfadd(`perf:um:${minute}`, userId);
      p.expire(`perf:um:${minute}`, MINUTE_TTL_S);
      p.pfadd(`perf:uh:${hour}`, userId);
      p.expire(`perf:uh:${hour}`, HOUR_TTL_S);
    }
    p.exec().catch(() => undefined);
  }

  /** Request totals and a time series for the period, across both nodes. */
  async snapshot(period: PerfPeriod, now = new Date()) {
    const { keys, starts, bucketSeconds } = windowKeys(period, now);
    const p = this.redis.pipeline();
    for (const k of keys) p.hgetall(k);
    const rows = ((await p.exec()) ?? []).map(([, v]) => (v ?? {}) as Record<string, string>);

    const series: PerfBucket[] = rows.map((row, i) => {
      const requests = num(row.n);
      return {
        t: starts[i].toISOString(),
        requests,
        rps: round(requests / bucketSeconds, 2),
        avgMs: requests ? round(num(row.sum) / requests, 1) : 0,
        p95Ms: percentile(row, 0.95),
        errors5xx: num(row.s5),
      };
    });
    const merged: Record<string, number> = {};
    for (const row of rows) for (const [f, v] of Object.entries(row)) merged[f] = (merged[f] ?? 0) + num(v);
    const requests = merged.n ?? 0;
    const totals: PerfTotals = {
      requests,
      rps: round(requests / (keys.length * bucketSeconds), 2),
      avgMs: requests ? round((merged.sum ?? 0) / requests, 1) : 0,
      p95Ms: percentile(merged, 0.95),
      p99Ms: percentile(merged, 0.99),
      status2xx: merged.s2 ?? 0,
      status3xx: merged.s3 ?? 0,
      status4xx: merged.s4 ?? 0,
      status5xx: merged.s5 ?? 0,
      status429: merged.s429 ?? 0,
    };
    return { period, bucketSeconds, totals, series };
  }

  /** Distinct signed-in users: online (5 min), last hour, last 24 h. Estimates (HyperLogLog). */
  async activeUsers(now = new Date()) {
    const minutes = (n: number) => Array.from({ length: n }, (_, i) => `perf:um:${minuteKey(new Date(now.getTime() - i * 60_000))}`);
    const hours = Array.from({ length: 24 }, (_, i) => `perf:uh:${hourKey(new Date(now.getTime() - i * 3_600_000))}`);
    const [online, hour, day] = await Promise.all([
      this.redis.pfcount(...minutes(5)),
      this.redis.pfcount(...minutes(60)),
      this.redis.pfcount(...hours),
    ]);
    return { online5m: online, active1h: hour, active24h: day };
  }

  /** The latest report of every node that reported in the last minute. */
  async nodes(): Promise<NodeReport[]> {
    const labels = await this.redis.smembers("perf:nodes");
    const p = this.redis.pipeline();
    for (const l of labels) p.hgetall(`perf:node:${l}`);
    const rows = ((await p.exec()) ?? []).map(([, v]) => (v ?? {}) as Record<string, string>);
    return rows
      .filter((r) => r.label)
      .map((r) => ({
        label: r.label,
        role: r.role,
        cpuPercent: num(r.cpuPercent),
        memUsedMb: num(r.memUsedMb),
        memTotalMb: num(r.memTotalMb),
        load1: num(r.load1),
        processRssMb: num(r.processRssMb),
        uptimeS: num(r.uptimeS),
        reportedAt: r.reportedAt,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  private async heartbeat() {
    const cpu = cpuTotals();
    const idle = cpu.idle - this.lastCpu.idle;
    const total = cpu.total - this.lastCpu.total;
    this.lastCpu = cpu;
    const label = nodeLabel();
    const report: Record<string, string> = {
      label,
      role: appRole(),
      cpuPercent: String(total > 0 ? round(100 * (1 - idle / total), 1) : 0),
      memUsedMb: String(Math.round((os.totalmem() - os.freemem()) / 1048576)),
      memTotalMb: String(Math.round(os.totalmem() / 1048576)),
      load1: String(round(os.loadavg()[0], 2)),
      processRssMb: String(Math.round(process.memoryUsage().rss / 1048576)),
      uptimeS: String(Math.round(process.uptime())),
      reportedAt: new Date().toISOString(),
    };
    try {
      await this.redis
        .multi()
        .hset(`perf:node:${label}`, report)
        .expire(`perf:node:${label}`, NODE_TTL_S)
        .sadd("perf:nodes", label)
        .exec();
    } catch {
      // Redis down: the node simply drops off the page until it is back.
    }
  }
}

/** Which server and process this is, for the page. Set NODE_LABEL in compose; host name otherwise. */
export function nodeLabel(): string {
  const base = (process.env.NODE_LABEL ?? "").trim() || os.hostname();
  const port = process.env.PORT ?? "4000";
  return `${base}:${port}`;
}

function cpuTotals() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}

function bucketIndex(ms: number): number {
  const i = LATENCY_BUCKETS_MS.findIndex((b) => ms <= b);
  return i === -1 ? LATENCY_BUCKETS_MS.length : i;
}

/**
 * Percentile from the histogram, interpolated linearly inside the bucket it falls in. An estimate
 * by construction (bucketed), labelled as such on the page.
 */
export function percentile(row: Record<string, string | number>, q: number): number {
  const counts = Array.from({ length: LATENCY_BUCKETS_MS.length + 1 }, (_, i) => num(row[`b${i}`]));
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const target = q * total;
  let seen = 0;
  for (let i = 0; i < counts.length; i++) {
    if (seen + counts[i] >= target) {
      const lo = i === 0 ? 0 : LATENCY_BUCKETS_MS[i - 1];
      const hi = i < LATENCY_BUCKETS_MS.length ? LATENCY_BUCKETS_MS[i] : LATENCY_BUCKETS_MS[i - 1] * 2;
      const within = counts[i] ? (target - seen) / counts[i] : 1;
      return Math.round(lo + (hi - lo) * within);
    }
    seen += counts[i];
  }
  return LATENCY_BUCKETS_MS[LATENCY_BUCKETS_MS.length - 1];
}

export function windowKeys(period: PerfPeriod, now: Date) {
  const spec = { "5m": [5, 60, "m"], "1h": [60, 60, "m"], "24h": [24, 3600, "h"], "7d": [168, 3600, "h"] } as const;
  const [count, bucketSeconds, kind] = spec[period];
  const starts: Date[] = [];
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * bucketSeconds * 1000);
    if (kind === "m") {
      d.setUTCSeconds(0, 0);
      keys.push(`perf:m:${minuteKey(d)}`);
    } else {
      d.setUTCMinutes(0, 0, 0);
      keys.push(`perf:h:${hourKey(d)}`);
    }
    starts.push(d);
  }
  return { keys, starts, bucketSeconds };
}

function minuteKey(d: Date) {
  return d.toISOString().slice(0, 16).replace(/[-:T]/g, "");
}
function hourKey(d: Date) {
  return d.toISOString().slice(0, 13).replace(/[-:T]/g, "");
}
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
