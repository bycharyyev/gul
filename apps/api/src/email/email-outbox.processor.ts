import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EmailOutboxService } from "./email-outbox.service";

/**
 * Polling interval. Order mail is not latency-critical to the second, and a short interval on
 * two hosts means two queries per tick against the same table for nothing most of the time.
 */
const POLL_INTERVAL_MS = 5_000;

@Injectable()
export class EmailOutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailOutboxProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private outbox: EmailOutboxService) {}

  onModuleInit() {
    // unref() so a pending timer never holds the process open during shutdown -- the API calls
    // enableShutdownHooks(), and a live interval would delay SIGTERM on every deploy.
    this.timer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    this.timer.unref();
  }

  private async tick() {
    // Skip rather than queue up: a slow pass must not stack overlapping runs, which would let
    // one host claim batches faster than it can send them.
    if (this.running) return;
    this.running = true;
    try {
      const dispatched = await this.outbox.dispatchPending();
      if (dispatched > 0) this.logger.log(`Dispatched ${dispatched} outbox row(s)`);
    } catch (err) {
      // Includes the window on a fresh deploy where EmailOutbox does not exist yet, since
      // deploy.yml health-checks the new image before running migrations.
      this.logger.warn(`Outbox pass failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
