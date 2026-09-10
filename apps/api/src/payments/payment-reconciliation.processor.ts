import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PaymentsService } from "./payments.service";

const STARTUP_DELAY_MS = 90_000;
const INTERVAL_MS = 5 * 60_000;
const STALE_MINUTES = 15;

/**
 * Runs on EVERY API host -- both nodes sweep the same rows in the same primary database, so treat
 * every step here as concurrent by default rather than as a singleton. Provider lookup is
 * read-only, and settlement goes through a conditional transaction in confirmPayment that decides
 * a refund obligation from a second SUCCEEDED payment rather than from losing the claim race
 * (deciding it from the race produced refund tickets for correctly-paid orders). Providers
 * without lookup simply leave their rows for staff review.
 */
@Injectable()
export class PaymentReconciliationProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconciliationProcessor.name);
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
      const rows = await this.payments.reconcileStale(STALE_MINUTES);
      const settled = rows.filter((row) => row.action === "SETTLED").length;
      if (settled > 0) this.logger.warn(`Reconciled and settled ${settled} payment(s)`);
      return rows.length;
    } catch (err) {
      this.logger.error(`Payment reconciliation failed: ${err instanceof Error ? err.message : err}`);
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
