import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../queue/queue.module";

/** Who made the call. The four trust boundaries the API already has, now named. */
export type CallerTier = "public" | "customer" | "staff" | "partner";

export type RecordedCall = {
  tier: CallerTier;
  /** The route *template* -- `/orders/:id`, never `/orders/cmt0b0y02...`. See the interceptor. */
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  /** Set only for partner calls, so per-key volume is answerable. */
  apiKeyId?: string;
};

/** Retention. Long enough to compare a month against the one before it. */
const TTL_SECONDS = 35 * 24 * 60 * 60;

/**
 * Counts every request, in Redis.
 *
 * Redis rather than Postgres because this is a write on *every* request: a row per call would put
 * the API's own traffic into the database it is meant to protect. Redis is already deployed for
 * BullMQ, so this adds no component to operate -- which matters on a two-VPS setup.
 *
 * One hash per day per dimension, HINCRBY-ed:
 *
 *   apiusage:day:2026-09-01       field "<tier>|<method> <route>|<class>"  -> count
 *   apiusage:latency:2026-09-01   field "<method> <route>|sum" and "|n"    -> ms, calls
 *   apiusage:key:2026-09-01       field "<apiKeyId>|<class>"               -> count
 *
 * `<class>` is 2xx / 4xx / 5xx rather than the exact status: the question is "how many failed",
 * and three buckets instead of forty keeps a day's hash small enough to read in one round trip.
 */
@Injectable()
export class ApiMetricsService {
  private readonly logger = new Logger(ApiMetricsService.name);

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  /**
   * Never throws, and never makes the request wait.
   *
   * Metrics are diagnostics. If Redis is unreachable the API must keep serving customers -- an
   * observability layer that can take the product down is worse than no observability at all.
   */
  record(call: RecordedCall): void {
    void this.write(call).catch((error) => {
      this.logger.debug(`metrics write skipped: ${(error as Error).message}`);
    });
  }

  private async write(call: RecordedCall): Promise<void> {
    const day = dayKey(new Date());
    const cls = statusClass(call.statusCode);
    const endpoint = `${call.method} ${call.route}`;

    const pipeline = this.redis.pipeline();

    const dayHash = `apiusage:day:${day}`;
    pipeline.hincrby(dayHash, `${call.tier}|${endpoint}|${cls}`, 1);
    pipeline.expire(dayHash, TTL_SECONDS);

    // Sum and count rather than a histogram: an average plus a call count answers "is this
    // endpoint slow" without storing a bucket array per endpoint per day.
    const latencyHash = `apiusage:latency:${day}`;
    pipeline.hincrby(latencyHash, `${endpoint}|sum`, Math.round(call.durationMs));
    pipeline.hincrby(latencyHash, `${endpoint}|n`, 1);
    pipeline.expire(latencyHash, TTL_SECONDS);

    if (call.apiKeyId) {
      const keyHash = `apiusage:key:${day}`;
      pipeline.hincrby(keyHash, `${call.apiKeyId}|${cls}`, 1);
      pipeline.expire(keyHash, TTL_SECONDS);
    }

    await pipeline.exec();
  }

  /** Everything the admin screen shows, for the last `days` days including today. */
  async summary(days = 7): Promise<UsageSummary> {
    const dayKeys = lastDays(days);

    const [dayHashes, latencyHashes, keyHashes] = await Promise.all([
      this.readAll(dayKeys.map((d) => `apiusage:day:${d}`)),
      this.readAll(dayKeys.map((d) => `apiusage:latency:${d}`)),
      this.readAll(dayKeys.map((d) => `apiusage:key:${d}`)),
    ]);

    return {
      days: dayKeys,
      totals: totalsFrom(dayHashes),
      byDay: byDayFrom(dayKeys, dayHashes),
      byTier: byTierFrom(dayHashes),
      endpoints: endpointsFrom(dayHashes, latencyHashes),
      byApiKey: byApiKeyFrom(keyHashes),
    };
  }

  private async readAll(keys: string[]): Promise<Record<string, string>[]> {
    const pipeline = this.redis.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    const results = await pipeline.exec();
    return (results ?? []).map(([, value]) => (value as Record<string, string>) ?? {});
  }
}

export type StatusClass = "2xx" | "4xx" | "5xx";

export type UsageTotals = { total: number; ok: number; clientError: number; serverError: number };

export type UsageSummary = {
  days: string[];
  totals: UsageTotals;
  byDay: { day: string; total: number; clientError: number; serverError: number }[];
  byTier: { tier: string; total: number; clientError: number; serverError: number }[];
  endpoints: {
    endpoint: string;
    total: number;
    clientError: number;
    serverError: number;
    avgMs: number | null;
  }[];
  byApiKey: { apiKeyId: string; total: number; clientError: number; serverError: number }[];
};

export function statusClass(status: number): StatusClass {
  if (status >= 500) return "5xx";
  if (status >= 400) return "4xx";
  return "2xx";
}

/** UTC, so a day boundary means the same thing wherever the server and the reader are. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function lastDays(days: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(dayKey(d));
  }
  return out;
}

// ---- Aggregation. Pure functions, so they are testable without Redis. ----

function emptyTotals(): UsageTotals {
  return { total: 0, ok: 0, clientError: 0, serverError: 0 };
}

function addTo(totals: UsageTotals, cls: string, count: number): void {
  totals.total += count;
  if (cls === "5xx") totals.serverError += count;
  else if (cls === "4xx") totals.clientError += count;
  else totals.ok += count;
}

/** `<tier>|<method> <route>|<class>` -- a route template contains no `|`, so this is safe. */
function splitDayField(field: string): { tier: string; endpoint: string; cls: string } | null {
  const parts = field.split("|");
  if (parts.length !== 3) return null;
  return { tier: parts[0], endpoint: parts[1], cls: parts[2] };
}

export function totalsFrom(hashes: Record<string, string>[]): UsageTotals {
  const totals = emptyTotals();
  for (const hash of hashes) {
    for (const [field, value] of Object.entries(hash)) {
      const parsed = splitDayField(field);
      if (parsed) addTo(totals, parsed.cls, Number(value) || 0);
    }
  }
  return totals;
}

export function byDayFrom(days: string[], hashes: Record<string, string>[]) {
  return days.map((day, i) => {
    const totals = totalsFrom([hashes[i] ?? {}]);
    return {
      day,
      total: totals.total,
      clientError: totals.clientError,
      serverError: totals.serverError,
    };
  });
}

export function byTierFrom(hashes: Record<string, string>[]) {
  const byTier = new Map<string, UsageTotals>();
  for (const hash of hashes) {
    for (const [field, value] of Object.entries(hash)) {
      const parsed = splitDayField(field);
      if (!parsed) continue;
      const totals = byTier.get(parsed.tier) ?? emptyTotals();
      addTo(totals, parsed.cls, Number(value) || 0);
      byTier.set(parsed.tier, totals);
    }
  }
  return [...byTier.entries()]
    .map(([tier, t]) => ({
      tier,
      total: t.total,
      clientError: t.clientError,
      serverError: t.serverError,
    }))
    .sort((a, b) => b.total - a.total);
}

export function endpointsFrom(
  dayHashes: Record<string, string>[],
  latencyHashes: Record<string, string>[],
) {
  const byEndpoint = new Map<string, UsageTotals>();
  for (const hash of dayHashes) {
    for (const [field, value] of Object.entries(hash)) {
      const parsed = splitDayField(field);
      if (!parsed) continue;
      const totals = byEndpoint.get(parsed.endpoint) ?? emptyTotals();
      addTo(totals, parsed.cls, Number(value) || 0);
      byEndpoint.set(parsed.endpoint, totals);
    }
  }

  const latency = new Map<string, { sum: number; n: number }>();
  for (const hash of latencyHashes) {
    for (const [field, value] of Object.entries(hash)) {
      const cut = field.lastIndexOf("|");
      if (cut < 0) continue;
      const endpoint = field.slice(0, cut);
      const part = field.slice(cut + 1);
      const entry = latency.get(endpoint) ?? { sum: 0, n: 0 };
      if (part === "sum") entry.sum += Number(value) || 0;
      else if (part === "n") entry.n += Number(value) || 0;
      latency.set(endpoint, entry);
    }
  }

  return [...byEndpoint.entries()]
    .map(([endpoint, t]) => {
      const l = latency.get(endpoint);
      return {
        endpoint,
        total: t.total,
        clientError: t.clientError,
        serverError: t.serverError,
        avgMs: l && l.n > 0 ? Math.round(l.sum / l.n) : null,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export function byApiKeyFrom(hashes: Record<string, string>[]) {
  const byKey = new Map<string, UsageTotals>();
  for (const hash of hashes) {
    for (const [field, value] of Object.entries(hash)) {
      const cut = field.lastIndexOf("|");
      if (cut < 0) continue;
      const apiKeyId = field.slice(0, cut);
      const totals = byKey.get(apiKeyId) ?? emptyTotals();
      addTo(totals, field.slice(cut + 1), Number(value) || 0);
      byKey.set(apiKeyId, totals);
    }
  }
  return [...byKey.entries()]
    .map(([apiKeyId, t]) => ({
      apiKeyId,
      total: t.total,
      clientError: t.clientError,
      serverError: t.serverError,
    }))
    .sort((a, b) => b.total - a.total);
}
