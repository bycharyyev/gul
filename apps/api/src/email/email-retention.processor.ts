import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * How long each kind of row is kept.
 *
 * EmailLog holds recipient addresses, so keeping it forever is both a privacy liability and an
 * unbounded table on a small VPS. 180 days is long enough to investigate a deliverability
 * complaint and to see a season of sending patterns.
 *
 * Dispatched outbox rows are pure bookkeeping once the email has gone out; 30 days is well past
 * the point anyone would ask "did this actually send". FAILED rows are never swept -- those are
 * exactly the ones a human still needs to see.
 *
 * Consumed verification codes are hashed and useless after a few days, so they go sooner.
 */
const EMAIL_LOG_RETENTION_DAYS = 180;
const DISPATCHED_OUTBOX_RETENTION_DAYS = 30;
const VERIFICATION_RETENTION_DAYS = 7;

/** Once a day is plenty; the first pass waits so it never competes with startup. */
const SWEEP_INTERVAL_MS = 24 * 60 * 60_000;
const STARTUP_DELAY_MS = 5 * 60_000;

@Injectable()
export class EmailRetentionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailRetentionProcessor.name);
  private timer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.startupTimer = setTimeout(() => {
      this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
      this.timer.unref();
      void this.sweep();
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref();
  }

  private cutoff(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60_000);
  }

  async sweep() {
    try {
      const [logs, outbox, verifications] = await this.prisma.$transaction([
        this.prisma.emailLog.deleteMany({
          where: { createdAt: { lt: this.cutoff(EMAIL_LOG_RETENTION_DAYS) } },
        }),
        this.prisma.emailOutbox.deleteMany({
          where: {
            status: "DISPATCHED",
            createdAt: { lt: this.cutoff(DISPATCHED_OUTBOX_RETENTION_DAYS) },
          },
        }),
        this.prisma.emailVerification.deleteMany({
          where: {
            consumedAt: { not: null },
            createdAt: { lt: this.cutoff(VERIFICATION_RETENTION_DAYS) },
          },
        }),
      ]);

      const total = logs.count + outbox.count + verifications.count;
      if (total > 0) {
        this.logger.log(
          `Retention sweep removed ${logs.count} email log(s), ${outbox.count} dispatched outbox row(s), ${verifications.count} spent verification(s)`,
        );
      }
    } catch (err) {
      // Includes the window on a fresh deploy where a table does not exist yet.
      this.logger.warn(`Retention sweep failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }
}
