import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { EmailAlertService } from "./email-alert.service";

/**
 * Alerts are about slow-moving conditions -- a quota filling up over hours, a queue backing up,
 * SMTP credentials going stale. Five minutes is frequent enough to catch them well before they
 * matter, and the dedup in EmailAlertService is what actually bounds how often anyone is told.
 */
const CHECK_INTERVAL_MS = 5 * 60_000;

/**
 * Waits before the first check so a restart does not fire alerts against a half-warm process
 * (SMTP verify against a container that is still starting, queues that have not connected yet).
 */
const STARTUP_DELAY_MS = 60_000;

@Injectable()
export class EmailAlertProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailAlertProcessor.name);
  private timer?: NodeJS.Timeout;
  private startupTimer?: NodeJS.Timeout;
  private running = false;

  constructor(private alerts: EmailAlertService) {}

  onModuleInit() {
    this.startupTimer = setTimeout(() => {
      this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
      // unref so a pending timer never delays SIGTERM on a deploy.
      this.timer.unref();
      void this.tick();
    }, STARTUP_DELAY_MS);
    this.startupTimer.unref();
  }

  private async tick() {
    // A check does a real SMTP handshake, which can be slow; never let two overlap.
    if (this.running) return;
    this.running = true;
    try {
      const sent = await this.alerts.run();
      if (sent > 0) this.logger.warn(`Sent ${sent} email alert(s)`);
    } catch (err) {
      this.logger.warn(`Alert pass failed: ${err instanceof Error ? err.message : err}`);
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
  }
}
