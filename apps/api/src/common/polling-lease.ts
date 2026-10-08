import type { Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { randomUUID } from "node:crypto";
import * as os from "node:os";

/**
 * Telegram allows one getUpdates long-poller per bot token; a second one is killed with 409. It
 * used to be "the primary polls" via a TELEGRAM_*_POLLING flag in one node's .env -- which made
 * every bot go deaf whenever the primary was down, and made both nodes poll (409 on both) the day
 * a copied .env carried the flag to the secondary (2026-10-08).
 *
 * Now the flag only makes a process *eligible*; among eligible processes, the one holding a Redis
 * lease polls. The lease lives TTL ms and is renewed every TTL/3, so a dead holder is replaced
 * within one TTL. Losing the lease (taken over, or Redis unreachable for longer than it could
 * still be ours) stops polling before anyone else can start, which is what keeps it to one.
 */
export interface LeasedRunner {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

const RENEW = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

export class PollingLease {
  readonly owner = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private held = false;
  private lastConfirmed = 0;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly redis: Pick<Redis, "set" | "eval">,
    readonly key: string,
    private readonly runner: LeasedRunner,
    private readonly logger: Pick<Logger, "log" | "warn">,
    private readonly ttlMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  begin() {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), Math.floor(this.ttlMs / 3));
    this.timer.unref?.();
  }

  isHeld() {
    return this.held;
  }

  async tick() {
    try {
      if (this.held) {
        const ok = await this.redis.eval(RENEW, 1, this.key, this.owner, String(this.ttlMs));
        if (ok !== 1) return this.lose("taken over");
        this.lastConfirmed = this.now();
        // Held but not polling: the poller died (a 409 during a handover, a network error).
        if (!this.runner.isRunning()) this.runner.start();
        return;
      }
      const ok = await this.redis.set(this.key, this.owner, "PX", this.ttlMs, "NX");
      if (ok === "OK") {
        this.held = true;
        this.lastConfirmed = this.now();
        this.logger.log(`${this.key}: lease acquired, polling here`);
        this.runner.start();
      }
    } catch (err) {
      // Not proven lost yet. Keep polling only while the lease cannot have expired: past that,
      // another node may already hold it.
      if (this.held && this.now() - this.lastConfirmed > this.ttlMs - Math.floor(this.ttlMs / 3)) {
        this.lose(`cannot renew: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  async end() {
    if (this.timer) clearInterval(this.timer);
    if (!this.held) return;
    this.held = false;
    this.runner.stop();
    try {
      await this.redis.eval(RELEASE, 1, this.key, this.owner);
    } catch {
      // Expires on its own.
    }
  }

  private lose(why: string) {
    this.held = false;
    this.logger.warn(`${this.key}: lease lost (${why}), polling stopped here`);
    this.runner.stop();
  }
}

/** Runner for a Telegraf bot: launch() resolves only when polling ends, so track it ourselves. */
export function telegrafRunner(
  bot: { launch(onLaunch?: () => void): Promise<void>; stop(reason?: string): void },
  logger: Pick<Logger, "log" | "error">,
  label: string,
): LeasedRunner {
  let running = false;
  // A stop() followed quickly by start(): the first launch's promise settles late and must not
  // mark the second one as stopped.
  let generation = 0;
  return {
    start() {
      if (running) return;
      running = true;
      const mine = ++generation;
      bot
        .launch(() => logger.log(`${label} started (long polling)`))
        .catch((err) => logger.error(`${label} stopped unexpectedly`, err))
        .finally(() => {
          if (generation === mine) running = false;
        });
    },
    stop() {
      if (!running) return;
      running = false;
      generation++;
      try {
        bot.stop("lease");
      } catch {
        // Already stopped.
      }
    },
    isRunning: () => running,
  };
}
