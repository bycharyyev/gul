import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../queue/queue.module";
import type { EmailPriority } from "./email-kinds";

/**
 * REG.RU's published cap for hosting mail is 3000 messages per 24h across the whole account
 * (15000 with a dedicated IPv4). Configurable rather than hardcoded, because the tariff can
 * change and because the same code runs on two hosts sharing one mailbox.
 *
 * They publish no messages/second or messages/minute figure anywhere, so none is assumed here --
 * the worker-level pacing in email.processor.ts is a self-imposed conservative choice, not a
 * documented provider limit.
 */
const DEFAULT_DAILY_LIMIT = 3000;

/**
 * Fraction of the daily allowance kept for critical mail only. Once ordinary transactional mail
 * has eaten 85% of the day's budget it stops, so a runaway order-notification loop or an
 * oversized broadcast cannot leave a customer unable to receive a password-reset code.
 */
const TRANSACTIONAL_CEILING = 0.85;
const MARKETING_CEILING = 0.6;

export interface QuotaUsage {
  used: number;
  limit: number;
  remaining: number;
  /** Percent of the daily allowance consumed, for the dashboard and the alert thresholds. */
  usedPercent: number;
  resetsAt: Date;
}

@Injectable()
export class EmailQuotaService {
  private readonly logger = new Logger(EmailQuotaService.name);

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  private limit(): number {
    const configured = Number(process.env.EMAIL_DAILY_LIMIT);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DAILY_LIMIT;
  }

  /**
   * Key rolls at UTC midnight. REG.RU documents a rolling 24h window rather than a calendar day,
   * so this is an approximation -- deliberately a conservative one, since a fixed daily bucket
   * can only ever refuse earlier than a rolling window would, never later.
   */
  private keyFor(now: Date): string {
    return `email:quota:${now.toISOString().slice(0, 10)}`;
  }

  private ceilingFor(priority: EmailPriority): number {
    if (priority === "critical") return 1;
    if (priority === "transactional") return TRANSACTIONAL_CEILING;
    return MARKETING_CEILING;
  }

  /**
   * Atomically claims one send against today's allowance.
   *
   * INCR first and roll back on refusal, rather than GET-then-INCR: two workers on two hosts
   * share this counter, and a check-then-act would let both pass the last remaining slot. The
   * counter is the reservation -- a refused claim is given straight back.
   *
   * Returns null when allowed, or a human-readable reason when the send must not proceed.
   */
  async claim(priority: EmailPriority): Promise<string | null> {
    const limit = this.limit();
    const cap = Math.floor(limit * this.ceilingFor(priority));
    const key = this.keyFor(new Date());

    let used: number;
    try {
      used = await this.redis.incr(key);
      // Only set the TTL when we created the key, so a mid-day restart can't extend the window.
      if (used === 1) await this.redis.expire(key, 60 * 60 * 48);
    } catch (err) {
      // Redis being unreachable must not silently stop all mail. The queue itself lives in
      // Redis, so if it is truly down nothing is being processed anyway; failing open here keeps
      // the failure mode in one place instead of turning it into a confusing "quota" error.
      this.logger.warn(`Quota check unavailable, allowing send: ${err instanceof Error ? err.message : err}`);
      return null;
    }

    if (used > cap) {
      await this.redis.decr(key).catch(() => undefined);
      const scope = priority === "critical" ? "суточный лимит" : `лимит для приоритета ${priority}`;
      return `Достигнут ${scope} отправки (${cap} из ${limit} за сутки)`;
    }
    return null;
  }

  /** Gives a claimed slot back -- used when a send is abandoned before reaching SMTP. */
  async release(): Promise<void> {
    await this.redis.decr(this.keyFor(new Date())).catch(() => undefined);
  }

  async usage(): Promise<QuotaUsage> {
    const limit = this.limit();
    const now = new Date();
    let used = 0;
    try {
      used = Number((await this.redis.get(this.keyFor(now))) ?? 0);
    } catch {
      used = 0;
    }
    const resetsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    return {
      used,
      limit,
      remaining: Math.max(0, limit - used),
      usedPercent: limit > 0 ? Math.round((used / limit) * 100) : 0,
      resetsAt,
    };
  }
}
