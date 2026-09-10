import { Global, Module } from "@nestjs/common";
import { Queue } from "bullmq";
import IORedis from "ioredis";

export const TOPUP_QUEUE = "topup-queue";

/**
 * Email is split across three queues rather than one queue with a priority field.
 *
 * Priority within a single queue only orders what a worker picks up *next* -- it does nothing
 * once the worker is already saturated, so a large newsletter could still hold up a
 * password-reset code behind its in-flight jobs. Separate queues get separate workers, so
 * critical mail has capacity that marketing physically cannot consume.
 */
// Hyphens, not colons: BullMQ builds its Redis keys as `bull:<name>:<...>` and rejects a name
// containing ":" outright ("Queue name cannot contain :").
export const EMAIL_QUEUE_CRITICAL = "email-critical";
export const EMAIL_QUEUE_TRANSACTIONAL = "email-transactional";
export const EMAIL_QUEUE_MARKETING = "email-marketing";

export const EMAIL_QUEUE_NAMES = [
  EMAIL_QUEUE_CRITICAL,
  EMAIL_QUEUE_TRANSACTIONAL,
  EMAIL_QUEUE_MARKETING,
] as const;

export function redisConnection() {
  return new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

function queueProvider(token: string, queueName: string) {
  return {
    provide: token,
    useFactory: () => new Queue(queueName, { connection: redisConnection() }),
  };
}

export const topupQueueProvider = queueProvider(TOPUP_QUEUE, TOPUP_QUEUE);
export const emailCriticalQueueProvider = queueProvider(EMAIL_QUEUE_CRITICAL, EMAIL_QUEUE_CRITICAL);
export const emailTransactionalQueueProvider = queueProvider(EMAIL_QUEUE_TRANSACTIONAL, EMAIL_QUEUE_TRANSACTIONAL);
export const emailMarketingQueueProvider = queueProvider(EMAIL_QUEUE_MARKETING, EMAIL_QUEUE_MARKETING);

/** Shared Redis client for things that aren't queues -- the daily send quota counter. */
export const REDIS_CLIENT = "redis-client";
export const redisClientProvider = {
  provide: REDIS_CLIENT,
  useFactory: () => redisConnection(),
};

@Global()
@Module({
  providers: [
    topupQueueProvider,
    emailCriticalQueueProvider,
    emailTransactionalQueueProvider,
    emailMarketingQueueProvider,
    redisClientProvider,
  ],
  exports: [
    TOPUP_QUEUE,
    EMAIL_QUEUE_CRITICAL,
    EMAIL_QUEUE_TRANSACTIONAL,
    EMAIL_QUEUE_MARKETING,
    REDIS_CLIENT,
  ],
})
export class QueueModule {}
