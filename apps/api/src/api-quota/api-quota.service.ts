import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../queue/queue.module";
import { PrismaService } from "../prisma/prisma.service";
import type { CallerTier } from "../metrics/api-metrics.service";

/**
 * Requests per minute, per identity, per tier.
 *
 * The numbers are ceilings on *one caller*, not on the service. They are deliberately generous:
 * the job here is to stop one client from consuming everyone else's capacity, not to meter usage.
 *
 * Staff is highest because the admin dashboard polls; public is high because it is cacheable
 * catalogue data hit by every anonymous visitor; partner is lowest because a partner is a program,
 * and a program with a bug is the thing most likely to hammer an endpoint by accident.
 */
export const DEFAULT_TIER_LIMITS: Record<CallerTier, number> = {
  public: 300,
  customer: 120,
  staff: 600,
  partner: 60,
};

export function tierLimitsFromEnv(env: NodeJS.ProcessEnv = process.env): Record<CallerTier, number> {
  const read = (name: string, fallback: number) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  };
  return {
    public: read("QUOTA_PUBLIC_PER_MIN", DEFAULT_TIER_LIMITS.public),
    customer: read("QUOTA_CUSTOMER_PER_MIN", DEFAULT_TIER_LIMITS.customer),
    staff: read("QUOTA_STAFF_PER_MIN", DEFAULT_TIER_LIMITS.staff),
    partner: read("QUOTA_PARTNER_PER_MIN", DEFAULT_TIER_LIMITS.partner),
  };
}

export type QuotaVerdict = {
  allowed: boolean;
  limit: number;
  used: number;
  /** Seconds until the current window resets. Sent as Retry-After on a rejection. */
  resetInSeconds: number;
};

/**
 * A fixed one-minute window, counted in Redis.
 *
 * Fixed rather than sliding: a sliding window needs a sorted set per identity and a trim on every
 * request. A fixed window is one INCR and one EXPIRE, and its worst case -- a caller spending its
 * whole allowance in the last second of one window and again in the first second of the next --
 * is a burst of 2x for one second. For a quota whose purpose is "no single client eats the
 * service", that is an acceptable edge and a large saving.
 */
@Injectable()
export class ApiQuotaService {
  private readonly logger = new Logger(ApiQuotaService.name);
  private readonly tierLimits = tierLimitsFromEnv();

  /**
   * Per-key limits, cached briefly.
   *
   * Without this every partner request would be a database read purely to learn a number that
   * changes about once a quarter. 60 seconds means an admin's change takes effect within a
   * minute, which is far faster than anyone raising a limit needs.
   */
  private keyLimits = new Map<string, { limit: number | null; expiresAt: number }>();
  private static readonly KEY_CACHE_MS = 60_000;

  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
    private prisma: PrismaService,
  ) {}

  /**
   * Consumes one unit of the caller's allowance.
   *
   * **Fails open.** If Redis cannot be reached the request is allowed: a rate limiter that turns
   * a Redis blip into a site-wide outage has done more damage than the abuse it was guarding
   * against.
   */
  async consume(tier: CallerTier, identity: string, apiKeyId?: string): Promise<QuotaVerdict> {
    const limit = await this.limitFor(tier, apiKeyId);
    const window = Math.floor(Date.now() / 60_000);
    const key = `apiquota:${tier}:${identity}:${window}`;

    try {
      const pipeline = this.redis.pipeline();
      pipeline.incr(key);
      // 120s, not 60: the window key is already unique per minute, and the extra margin means a
      // clock skew between nodes cannot expire a window that is still in use.
      pipeline.expire(key, 120);
      const results = await pipeline.exec();
      const used = Number(results?.[0]?.[1] ?? 0);

      return {
        allowed: used <= limit,
        limit,
        used,
        resetInSeconds: 60 - Math.floor((Date.now() % 60_000) / 1000),
      };
    } catch (error) {
      this.logger.debug(`quota check skipped: ${(error as Error).message}`);
      return { allowed: true, limit, used: 0, resetInSeconds: 60 };
    }
  }

  private async limitFor(tier: CallerTier, apiKeyId?: string): Promise<number> {
    if (tier !== "partner" || !apiKeyId) return this.tierLimits[tier];

    const perKey = await this.keyLimit(apiKeyId);
    return perKey ?? this.tierLimits.partner;
  }

  private async keyLimit(apiKeyId: string): Promise<number | null> {
    const cached = this.keyLimits.get(apiKeyId);
    if (cached && cached.expiresAt > Date.now()) return cached.limit;

    let limit: number | null = null;
    try {
      const row = await this.prisma.apiKey.findUnique({
        where: { id: apiKeyId },
        select: { rateLimitPerMin: true },
      });
      limit = row?.rateLimitPerMin ?? null;
    } catch (error) {
      // The deploy pipeline starts the new image *before* running migrations, so for a minute or
      // two this column may not exist yet. Falling back to the tier default keeps partner traffic
      // flowing through that window instead of 500-ing it.
      this.logger.debug(`per-key limit unavailable, using tier default: ${(error as Error).message}`);
    }

    this.keyLimits.set(apiKeyId, {
      limit,
      expiresAt: Date.now() + ApiQuotaService.KEY_CACHE_MS,
    });
    return limit;
  }

  /** Lets an admin's change to a key take effect immediately rather than within the cache TTL. */
  forget(apiKeyId: string): void {
    this.keyLimits.delete(apiKeyId);
  }

  /** Exposed for the admin screen, so the configured ceilings are visible rather than folklore. */
  limits(): Record<CallerTier, number> {
    return { ...this.tierLimits };
  }
}
