import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PaymentsService } from "./payments.service";

const STARTUP_DELAY_MS = 30_000;
const INTERVAL_MS = 60_000;

/** Recovers verified inbox rows after a crash between durable receipt and business processing. */
@Injectable()
export class PaymentWebhookProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentWebhookProcessor.name);
  private startupTimer?: NodeJS.Timeout;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private payments: PaymentsService) {}

  onModuleInit() {
    this.startupTimer = setTimeout(() => {
      this.timer = setInterval(() => void this.runOnce(), INTERVAL_MS);
      this.timer.unref();
      void this.runOnce();
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref();
  }

  async runOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return await this.payments.replayPendingWebhookEvents();
    } catch (err) {
      this.logger.error(`Payment webhook replay failed: ${err instanceof Error ? err.message : err}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }
}
