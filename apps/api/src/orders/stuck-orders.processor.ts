import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";

/**
 * Finds paid orders that never got processed, and puts them back in the queue.
 *
 * Confirming a payment is three writes that are not one transaction: the order is claimed
 * PENDING_PAYMENT -> PAID, a TopupJob row is created, and a queue message is added. A process
 * that dies between any two of them leaves an order that is paid for and will never be delivered,
 * and nothing looked for those. On top of that, each node keeps its own queue in its own Redis,
 * so a node lost while holding messages takes them with it.
 *
 * Every one of those states is safe to retry, because nothing has been sent to the operator yet:
 * `processTopup` claims the job QUEUED -> SENT atomically, and BullMQ refuses a second message
 * with the same jobId. Re-queueing an order that is already moving is a no-op, not a double
 * top-up -- which is why this sweeper is allowed to be blunt.
 *
 * What it must never touch is the other stuck state: PROCESSING with the job already SENT. There
 * the request may have reached the operator, and retrying could charge a customer twice. Those
 * are counted and reported for a person to settle (see EmailAlertService) and left exactly where
 * they are.
 */

/** How long an order may sit at PAID before we assume its handoff was lost rather than slow. */
const PAID_GRACE_MS = 10 * 60_000;

const SWEEP_INTERVAL_MS = 5 * 60_000;

/** Long enough that migrations and the first deploy health check are done. */
const STARTUP_DELAY_MS = 2 * 60_000;

/** A cap, so one bad day cannot turn a sweep into a thousand queue writes in a tight loop. */
const BATCH = 50;

@Injectable()
export class StuckOrdersProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StuckOrdersProcessor.name);
  private timer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    @Inject(TOPUP_QUEUE) private topupQueue: Queue,
  ) {}

  onModuleInit() {
    this.startupTimer = setTimeout(() => {
      this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
      this.timer.unref();
      void this.sweep();
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref();
  }

  /**
   * Returns how many orders were re-queued.
   *
   * Both nodes run this loop, and that is fine: the re-queue is idempotent at two independent
   * layers, so the worst a race produces is the same order being offered twice and accepted once.
   */
  async sweep(): Promise<number> {
    try {
      const stranded = await this.prisma.order.findMany({
        where: { status: "PAID", paidAt: { lt: new Date(Date.now() - PAID_GRACE_MS) } },
        select: { id: true },
        orderBy: { paidAt: "asc" },
        take: BATCH,
      });
      if (stranded.length === 0) return 0;

      let requeued = 0;
      for (const { id } of stranded) {
        try {
          // The row may be missing (died before creating it) or already there (died before
          // enqueuing). Create it only in the first case; a unique orderId means the second is a
          // P2002 rather than a duplicate, and a duplicate is not an error here.
          await this.prisma.topupJob.create({ data: { orderId: id, status: "QUEUED" } });
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
        }

        await this.topupQueue.add(
          "process-topup",
          { orderId: id },
          { jobId: id, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
        );
        requeued++;
      }

      // Deliberately a warning, not an info line: every entry here is an order somebody paid for
      // that would otherwise have sat there indefinitely. It should be visible in the logs even
      // when the recovery worked, because the recovery is not the interesting part -- the fact
      // that something needed recovering is.
      this.logger.warn(`Re-queued ${requeued} paid order(s) that had no live top-up job`);
      return requeued;
    } catch (err) {
      this.logger.error(`Stuck-order sweep failed: ${err instanceof Error ? err.message : err}`);
      return 0;
    }
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }
}
