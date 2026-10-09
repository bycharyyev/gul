import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import type IORedis from "ioredis";
import { createRedis } from "../queue/redis-connection";

/**
 * Groups of public data that are invalidated together. One admin edit drops its whole group:
 * groups are small and edits are rare, so precision here would buy nothing but bugs.
 */
export type CacheGroup = "catalog" | "gallery" | "content";
const CACHE_GROUPS: CacheGroup[] = ["catalog", "gallery", "content"];

export type CacheOutcome = "hit" | "miss" | "error";

/** Per-group counters since this process started; Redis keeps the cross-node daily totals. */
export interface CacheGroupStats {
  hit: number;
  miss: number;
  error: number;
  /** Time spent answering, in ms, summed per outcome -- divide by the count for an average. */
  hitMs: number;
  missMs: number;
  errorMs: number;
}

const PREFIX = "pcache:v1";
/** Daily counters, kept a week so the admin panel can show 7 days. */
const STATS_TTL_SECONDS = 8 * 24 * 60 * 60;
/** Upper bound on any entry's life even if nothing ever invalidates it. */
const MAX_TTL_MS = 10 * 60 * 1000;

/**
 * Writes the entry only if the group's generation is still the one read before loading. An admin
 * edit bumps the generation and drops the group, so a load that started before the edit can never
 * put the old answer back afterwards -- the race that plain "DEL on write" leaves open.
 * Run with Redis EVAL: a constant script, never built from input; keys and values are arguments.
 */
const SET_IF_GENERATION = `
local gen = redis.call('GET', KEYS[2]) or '0'
if gen ~= ARGV[1] then return 0 end
redis.call('HSET', KEYS[1], ARGV[2], ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[4])
return 1
`;

/**
 * Redis cache for public, rarely-changing reads (catalog, gallery listings, storefront content).
 *
 * Never a source of truth and never in the way:
 *
 * - **Only public data.** Nothing per-user, no balances, orders, payments or chats is ever passed
 *   through here; callers cache whole public responses keyed by every parameter that shapes them.
 * - **Redis down means the database answers.** This uses its own connection, not the shared one:
 *   that one is configured for BullMQ (`maxRetriesPerRequest: null`, offline queue on), which
 *   would make a cache read wait for Redis forever. Here commands fail fast (no offline queue,
 *   200 ms timeout) and the loader runs instead.
 * - **One load per key at a time per process.** Concurrent misses share the same promise, so an
 *   expiring popular key costs one query per node rather than one per request (cache stampede).
 * - **Orders never read from it.** Prices are snapshotted from the database at order creation, so
 *   a cached price can at worst be shown for a few seconds after an edit; it is never charged.
 */
@Injectable()
export class PublicCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublicCacheService.name);
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly counters = new Map<CacheGroup, CacheGroupStats>();
  private lastErrorLog = 0;
  /** Daily counter increments waiting for the next flush (field -> delta). */
  private pendingStats = new Map<string, number>();
  private flushTimer?: NodeJS.Timeout;

  /** Built by PublicCacheModule's factory (or a test) -- never resolved by type injection. */
  constructor(private readonly redis: IORedis) {}

  static connect(): IORedis {
    const client = createRedis({
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      commandTimeout: 200,
      connectTimeout: 2000,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    });
    // Without a listener ioredis logs every failed reconnect as an unhandled error event.
    client.on("error", () => undefined);
    return client;
  }

  onModuleInit() {
    this.flushTimer = setInterval(() => void this.flushStats(), 5_000);
    this.flushTimer.unref();
  }

  async onModuleDestroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flushStats();
    this.redis.disconnect();
  }

  /** Writes the accumulated daily counters in one pipeline; a failed write drops the batch. */
  async flushStats(): Promise<void> {
    if (this.pendingStats.size === 0) return;
    const batch = this.pendingStats;
    this.pendingStats = new Map();
    const key = statsKey(dayKey(new Date()));
    const p = this.redis.pipeline();
    for (const [field, n] of batch) p.hincrby(key, field, n);
    p.expire(key, STATS_TTL_SECONDS);
    await p.exec().catch(() => undefined);
  }

  /**
   * Returns the cached answer for (group, name, params), or loads, stores and returns it.
   * `params` must contain every input that changes the response (filters, ids, language...).
   */
  async wrap<T>(
    group: CacheGroup,
    name: string,
    params: Record<string, unknown>,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    const field = `${name}|${stableParams(params)}`;
    const flightKey = `${group}|${field}`;
    const pending = this.inflight.get(flightKey);
    if (pending) return pending as Promise<T>;

    const started = Date.now();
    const promise = this.read<T>(group, field, ttlSeconds, load)
      .then(({ value, outcome }) => {
        this.count(group, outcome, Date.now() - started);
        return value;
      })
      .finally(() => this.inflight.delete(flightKey));
    this.inflight.set(flightKey, promise);
    return promise;
  }

  /** Drops a whole group, on every node (the cache lives in the shared Redis). Never throws. */
  async invalidate(...groups: CacheGroup[]): Promise<void> {
    for (const group of groups) {
      try {
        await this.redis.multi().incr(genKey(group)).del(hashKey(group)).exec();
      } catch (error) {
        // An edit must still succeed with Redis down. The entry then lives out its short TTL --
        // and the generation check means nothing can be written back over a newer one.
        this.logError(`invalidate ${group}`, error);
      }
    }
  }

  /** Counters for this process since start. */
  localStats(): Record<CacheGroup, CacheGroupStats> {
    return Object.fromEntries(CACHE_GROUPS.map((g) => [g, { ...this.statsFor(g) }])) as Record<
      CacheGroup,
      CacheGroupStats
    >;
  }

  /** Cross-node totals per day for the last `days` days (today included), from Redis. */
  async dailyStats(days: number): Promise<Array<{ day: string; groups: Record<string, Record<string, number>> }>> {
    const result: Array<{ day: string; groups: Record<string, Record<string, number>> }> = [];
    for (let i = 0; i < days; i++) {
      const day = dayKey(new Date(Date.now() - i * 86_400_000));
      const raw = await this.redis.hgetall(statsKey(day)).catch(() => ({}) as Record<string, string>);
      const groups: Record<string, Record<string, number>> = {};
      for (const [field, value] of Object.entries(raw)) {
        const [group, metric] = field.split("|");
        (groups[group] ??= {})[metric] = Number(value);
      }
      result.push({ day, groups });
    }
    return result;
  }

  private async read<T>(
    group: CacheGroup,
    field: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<{ value: T; outcome: CacheOutcome }> {
    let generation: string;
    try {
      const [[genErr, gen], [getErr, cached]] = (await this.redis
        .pipeline()
        .get(genKey(group))
        .hget(hashKey(group), field)
        .exec()) as [[Error | null, string | null], [Error | null, string | null]];
      if (genErr || getErr) throw genErr ?? getErr;
      generation = gen ?? "0";
      if (cached) {
        const entry = JSON.parse(cached) as { e: number; v: T };
        if (entry.e > Date.now()) return { value: entry.v, outcome: "hit" };
      }
    } catch (error) {
      this.logError(`read ${group}`, error);
      return { value: await load(), outcome: "error" };
    }

    const value = await load();
    // Stored as the client will receive it: the JSON form is what the controller would have sent
    // anyway (Decimal and Date already serialise to strings), so a hit and a miss answer alike.
    const entry = JSON.stringify({ e: Date.now() + ttlSeconds * 1000, v: value });
    this.redis
      .eval(SET_IF_GENERATION, 2, hashKey(group), genKey(group), generation, field, entry, String(MAX_TTL_MS))
      .catch((error) => this.logError(`write ${group}`, error));
    return { value: JSON.parse(entry).v as T, outcome: "miss" };
  }

  private statsFor(group: CacheGroup): CacheGroupStats {
    let stats = this.counters.get(group);
    if (!stats) {
      stats = { hit: 0, miss: 0, error: 0, hitMs: 0, missMs: 0, errorMs: 0 };
      this.counters.set(group, stats);
    }
    return stats;
  }

  private count(group: CacheGroup, outcome: CacheOutcome, ms: number) {
    const stats = this.statsFor(group);
    stats[outcome] += 1;
    stats[`${outcome}Ms`] += ms;
    if (outcome === "error") return; // Redis is the thing that just failed.
    // Accumulated and flushed every 5 s rather than written per request: a cache hit must cost
    // one Redis round trip, not two.
    const add = (field: string, n: number) => this.pendingStats.set(field, (this.pendingStats.get(field) ?? 0) + n);
    add(`${group}|${outcome}`, 1);
    add(`${group}|${outcome}Ms`, Math.round(ms));
  }

  /** At most one warning a minute: with Redis down every request would otherwise log one. */
  private logError(what: string, error: unknown) {
    const now = Date.now();
    if (now - this.lastErrorLog < 60_000) return;
    this.lastErrorLog = now;
    this.logger.warn(`public cache ${what} failed, serving from the database: ${(error as Error)?.message ?? error}`);
  }
}

function hashKey(group: CacheGroup) {
  return `${PREFIX}:${group}`;
}
function genKey(group: CacheGroup) {
  return `${PREFIX}:${group}:gen`;
}
function statsKey(day: string) {
  return `${PREFIX}:stats:${day}`;
}
function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Same params in any order give the same key; undefined and empty values are dropped. */
export function stableParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${encodeURIComponent(String(params[k]))}`)
    .join("&");
}
