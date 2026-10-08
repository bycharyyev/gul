import IORedis, { type RedisOptions } from "ioredis";

/**
 * The one place a Redis client is built, so every client finds the master the same way.
 *
 * With REDIS_SENTINELS set ("host:port,host:port,..."), the client asks the Sentinels which node
 * is master (name REDIS_SENTINEL_NAME, default "gul") and asks again after a failover. That is
 * what makes a failover safe: a redis that comes back after being replaced still believes it is
 * master for a few seconds, and anything trusting the node's own word -- the HAProxy router this
 * replaced did -- sends work into a node that is about to be demoted, where it hung the API's
 * readiness check on both servers (2026-10-08 drill). Sentinels only ever name the elected master.
 *
 * The password comes from REDIS_URL either way. Without REDIS_SENTINELS, REDIS_URL is used as
 * before (local development, CI).
 */
export function redisOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): {
  url?: string;
  options: RedisOptions;
} {
  const url = env.REDIS_URL ?? "redis://localhost:6379";
  const sentinels = parseSentinels(env.REDIS_SENTINELS);
  // A command that reaches a node demoted under it gets READONLY; reconnecting re-resolves the
  // master instead of failing every write until the process restarts.
  const reconnectOnError = (err: Error) => (err.message.startsWith("READONLY") ? 2 : false);
  if (sentinels.length === 0) return { url, options: { reconnectOnError } };

  const parsed = new URL(url);
  return {
    options: {
      sentinels,
      name: env.REDIS_SENTINEL_NAME || "gul",
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : undefined,
      reconnectOnError,
      // Keep asking the Sentinels while none answers, rather than giving up for good.
      sentinelRetryStrategy: (times: number) => Math.min(times * 500, 5000),
    },
  };
}

export function parseSentinels(raw: string | undefined): { host: string; port: number }[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.lastIndexOf(":");
      const host = i > 0 ? s.slice(0, i) : s;
      const port = i > 0 ? Number(s.slice(i + 1)) : 26379;
      if (!host || !Number.isInteger(port) || port <= 0) throw new Error(`bad REDIS_SENTINELS entry: ${s}`);
      return { host, port };
    });
}

/** A new client from the environment, with per-use options layered on top. */
export function createRedis(extra: RedisOptions = {}): IORedis {
  const { url, options } = redisOptionsFromEnv();
  const merged = { ...options, ...extra };
  return url ? new IORedis(url, merged) : new IORedis(merged);
}
