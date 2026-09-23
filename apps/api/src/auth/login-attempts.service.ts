import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../queue/queue.module";

/**
 * Slows down password guessing against a single account, without ever locking anyone out.
 *
 * The per-IP throttle in front of this cannot do the job on its own. Turkmenistan has effectively
 * one mobile operator and thousands of subscribers leave through a handful of public addresses,
 * so an address is a city rather than a person: a limit of ten logins a minute per address is ten
 * logins a minute for everybody behind it, and it would bite hardest on the day the app takes off.
 * The per-IP limit is therefore set generously, to catch one machine spraying many numbers, and
 * the tight limit lives here, keyed on the thing an attacker is actually attacking -- one account.
 *
 * Two properties are deliberate:
 *
 * **Only failures count, and a success erases them.** Somebody who types their password correctly
 * is never delayed, however often they sign in. The previous scheme spent the same budget on
 * people getting it right.
 *
 * **The penalty is a growing wait, never a lock.** "Account locked after five attempts" is itself
 * an attack: type a wrong password at somebody's number five times and they cannot get in. A delay
 * that doubles gives the same protection to the account and hands nobody a weapon against its
 * owner -- five wrong guesses cost a second, twenty cost five minutes, and the real owner waits
 * and gets in.
 */

/** Failures that cost nothing. Four is room to fumble a password without noticing this exists. */
const FREE_ATTEMPTS = 4;

const BASE_PENALTY_SECONDS = 1;

/** Ceiling on the wait. Beyond this the attacker is beaten and the owner is only being punished. */
const MAX_PENALTY_SECONDS = 300;

/** Quiet for this long and the count is forgotten -- yesterday's typo should not cost anything. */
const WINDOW_SECONDS = 15 * 60;

export interface AttemptVerdict {
  allowed: boolean;
  /** Seconds the caller must wait. Only meaningful when `allowed` is false. */
  retryAfterSeconds: number;
}

@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);

  constructor(@Inject(REDIS_CLIENT) private redis: Redis) {}

  /**
   * Identifiers are hashed before they become keys. The phone number is already in the database,
   * so this is hygiene rather than secrecy -- but a key space full of customer phone numbers is
   * an avoidable thing to leave lying in a cache, and hashing also bounds the key length.
   */
  private key(kind: string, identifier: string): string {
    const digest = createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex");
    return `login:${kind}:${digest.slice(0, 32)}`;
  }

  private penaltyFor(failures: number): number {
    if (failures <= FREE_ATTEMPTS) return 0;
    const doublings = failures - FREE_ATTEMPTS - 1;
    return Math.min(BASE_PENALTY_SECONDS * 2 ** doublings, MAX_PENALTY_SECONDS);
  }

  /**
   * Fails **open**. If Redis is unreachable the answer is "allowed", not "everybody waits": the
   * cost of being wrong the other way is that nobody in the country can sign in because a cache is
   * down, while the per-IP throttle in front is still standing. A brief window of weaker
   * brute-force resistance is the smaller harm, and it is logged rather than swallowed.
   */
  async check(identifier: string): Promise<AttemptVerdict> {
    try {
      const ttl = await this.redis.ttl(this.key("block", identifier));
      if (ttl > 0) return { allowed: false, retryAfterSeconds: ttl };
      return { allowed: true, retryAfterSeconds: 0 };
    } catch (err) {
      this.logger.warn(`Could not read login attempts, allowing: ${err instanceof Error ? err.message : err}`);
      return { allowed: true, retryAfterSeconds: 0 };
    }
  }

  /** Returns the wait now imposed, in seconds; 0 while the attempt is still within the free ones. */
  async recordFailure(identifier: string): Promise<number> {
    try {
      const failKey = this.key("fail", identifier);
      const failures = await this.redis.incr(failKey);
      // Only on the first failure, so a burst does not keep pushing the window out and make the
      // count immortal.
      if (failures === 1) await this.redis.expire(failKey, WINDOW_SECONDS);

      const penalty = this.penaltyFor(failures);
      if (penalty > 0) {
        await this.redis.set(this.key("block", identifier), String(failures), "EX", penalty);
      }
      return penalty;
    } catch (err) {
      this.logger.warn(`Could not record a failed login: ${err instanceof Error ? err.message : err}`);
      return 0;
    }
  }

  /** A correct password wipes the history. */
  async clear(identifier: string): Promise<void> {
    try {
      await this.redis.del(this.key("fail", identifier), this.key("block", identifier));
    } catch (err) {
      this.logger.warn(`Could not clear login attempts: ${err instanceof Error ? err.message : err}`);
    }
  }
}
