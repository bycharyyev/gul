import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import {
  EMAIL_QUEUE_CRITICAL,
  EMAIL_QUEUE_MARKETING,
  EMAIL_QUEUE_TRANSACTIONAL,
  redisConnection,
} from "../queue/queue.module";
import { EmailService, type EmailJobData } from "./email.service";

/**
 * Per-queue pacing. REG.RU publishes a daily cap (enforced by EmailQuotaService) but no
 * messages/second or messages/minute figure anywhere, so these are conservative self-imposed
 * numbers rather than provider limits -- tune down if REG.RU pushes back, and only up after
 * confirming a real limit with them.
 *
 * Critical is paced loosely and runs two jobs at a time: an OTP is worthless if it arrives late,
 * and the volume is inherently small. Marketing is throttled hardest, since it is the only
 * source that can produce thousands of messages from a single admin action.
 */
const LANES = [
  { queue: EMAIL_QUEUE_CRITICAL, concurrency: 2, max: 30, duration: 60_000 },
  { queue: EMAIL_QUEUE_TRANSACTIONAL, concurrency: 2, max: 20, duration: 60_000 },
  { queue: EMAIL_QUEUE_MARKETING, concurrency: 1, max: 10, duration: 60_000 },
] as const;

@Injectable()
export class EmailProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailProcessor.name);
  private workers: Worker[] = [];

  constructor(private email: EmailService) {}

  onModuleInit() {
    // One worker per lane, so a marketing backlog occupies only the marketing worker and can
    // never hold up a password-reset code waiting behind it.
    this.workers = LANES.map((lane) => {
      const worker = new Worker(
        lane.queue,
        async (job: Job<EmailJobData>) => {
          await this.email.sendNow(job.data);
        },
        {
          connection: redisConnection(),
          concurrency: lane.concurrency,
          limiter: { max: lane.max, duration: lane.duration },
        },
      );

      worker.on("failed", (job, err) => {
        // Only reached after all attempts are exhausted -- sendNow rethrows solely for the
        // "temporary, worth retrying" class; permanent and auth failures returned normally and
        // were already recorded against the EmailLog.
        this.logger.error(`Email job ${job?.id} on ${lane.queue} exhausted retries: ${err.message}`);
      });

      return worker;
    });
  }

  async onModuleDestroy() {
    await Promise.all(this.workers.map((w) => w.close()));
  }
}
