import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../queue/queue.module";
import { EmailQuotaService } from "./email-quota.service";
import { EmailService } from "./email.service";
import { PrismaService } from "../prisma/prisma.service";
import { SellerLedgerService } from "../seller-ledger/seller-ledger.service";
import type { PaymentStatus } from "@prisma/client";

/**
 * Percentages of the daily send allowance that are worth telling someone about. Each fires at
 * most once per day (see the dedup key below) -- an alert that repeats every five minutes is one
 * people learn to ignore.
 */
const QUOTA_THRESHOLDS = [70, 85, 95];

/** Failed jobs sitting in one queue before it counts as a backlog worth reporting. */
const FAILED_JOBS_THRESHOLD = 20;

/**
 * How long an order may sit in PROCESSING with its top-up already sent before somebody is told.
 *
 * This is the one stuck state nothing may retry: the request may have reached the operator, and
 * a second attempt could charge the customer twice. StuckOrdersProcessor recovers every other
 * case silently; these are the ones that need a person, so thirty minutes is chosen to be well
 * past any plausible slow operator and still the same working hour.
 */
const SENT_STUCK_MS = 30 * 60_000;
const PAYMENT_RECONCILIATION_MS = 15 * 60_000;
const WEBHOOK_INBOX_STUCK_MS = 10 * 60_000;

/** How long a non-quota alert stays suppressed after firing. */
const ALERT_COOLDOWN_SECONDS = 6 * 60 * 60;

export interface AlertCheck {
  key: string;
  subject: string;
  body: string;
  /** Suppression window. Quota alerts use the rest of the day; others use the cooldown. */
  ttlSeconds: number;
}

@Injectable()
export class EmailAlertService {
  private readonly logger = new Logger(EmailAlertService.name);

  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
    private quota: EmailQuotaService,
    private email: EmailService,
    private prisma: PrismaService,
    private sellerLedger: SellerLedgerService,
  ) {}

  private recipient(): string | null {
    return process.env.ALERT_EMAIL?.trim() || null;
  }

  /**
   * Claims the right to fire an alert, so it goes out once rather than on every poll.
   *
   * `SET key NX EX ttl` is the claim: whichever host wins the race sends, the other sees the key
   * already exists and stays quiet. Both hosts run this loop against the same Redis.
   */
  private async claimAlert(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const claimed = await this.redis.set(`email:alert:${key}`, "1", "EX", ttlSeconds, "NX");
      return claimed === "OK";
    } catch {
      // If Redis is unreachable we cannot dedup. Staying silent is the safer failure: the same
      // outage would otherwise mail the same alert on every single poll.
      return false;
    }
  }

  /** Seconds until UTC midnight -- a quota alert should not repeat within the day it describes. */
  private secondsUntilQuotaReset(): number {
    const now = new Date();
    const reset = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return Math.max(60, Math.round((reset - now.getTime()) / 1000));
  }

  /** Builds the list of things currently worth alerting about. Pure, so it is easy to test. */
  async collect(): Promise<AlertCheck[]> {
    const health = await this.email.health();
    const alerts: AlertCheck[] = [];

    // --- SMTP reachability. Deliberately first: everything below is moot if we cannot send.
    if (health.smtpConfigured && health.smtpReachable === false) {
      alerts.push({
        key: "smtp-unreachable",
        subject: "Gulyaly: SMTP недоступен",
        body: [
          `Хост: ${health.smtpHost ?? "(не задан)"}`,
          `Ошибка: ${health.smtpError ?? "неизвестна"}`,
          "",
          "Проверьте MAIL_USER/MAIL_PASS в /opt/gul/.env и доступность хоста.",
        ].join("\n"),
        ttlSeconds: ALERT_COOLDOWN_SECONDS,
      });
    }

    if (!health.smtpConfigured) {
      alerts.push({
        key: "smtp-unconfigured",
        subject: "Gulyaly: SMTP не настроен",
        body: "MAIL_HOST не задан — исходящая почта отключена, все отправки пишутся как SKIPPED.",
        ttlSeconds: ALERT_COOLDOWN_SECONDS,
      });
    }

    // --- Daily quota. Report only the highest threshold crossed, not all of them at once.
    const crossed = QUOTA_THRESHOLDS.filter((t) => health.quota.usedPercent >= t).pop();
    if (crossed !== undefined) {
      alerts.push({
        key: `quota-${crossed}`,
        subject: `Gulyaly: израсходовано ${health.quota.usedPercent}% суточного лимита почты`,
        body: [
          `Отправлено: ${health.quota.used} из ${health.quota.limit}`,
          `Осталось: ${health.quota.remaining}`,
          `Лимит обнулится: ${health.quota.resetsAt.toISOString()}`,
          "",
          "Маркетинг отключается на 60%, обычные транзакционные — на 85%.",
          "Письма с кодами и безопасностью продолжают уходить до 100%.",
        ].join("\n"),
        ttlSeconds: this.secondsUntilQuotaReset(),
      });
    }

    // --- Stuck jobs.
    for (const queue of health.queues) {
      const failed = "failed" in queue ? (queue.failed as number) : 0;
      if (failed >= FAILED_JOBS_THRESHOLD) {
        alerts.push({
          key: `queue-failed-${queue.name}`,
          subject: `Gulyaly: ${failed} писем не отправлено (очередь ${queue.name})`,
          body: [
            `Очередь: ${queue.name}`,
            `Задач в статусе failed: ${failed}`,
            "",
            "Смотрите /admin/mail — журнал писем и здоровье почты.",
          ].join("\n"),
          ttlSeconds: ALERT_COOLDOWN_SECONDS,
        });
      }
    }

    // --- Paid orders whose top-up went out and never came back.
    const stuck = await this.prisma.order.count({
      where: {
        status: "PROCESSING",
        topupJob: { is: { status: "SENT", sentAt: { lt: new Date(Date.now() - SENT_STUCK_MS) } } },
      },
    });
    if (stuck > 0) {
      alerts.push({
        key: "orders-stuck-sent",
        subject: `Gulyaly: ${stuck} заказ(ов) зависли в обработке`,
        body: [
          `Заказов в статусе «в обработке» дольше 30 минут: ${stuck}`,
          "",
          "Запрос к оператору по ним уже ушёл, поэтому повторить их автоматически нельзя:",
          "повтор мог бы списать с клиента второй раз. Нужно сверить вручную —",
          "прошло ли пополнение у оператора, и закрыть заказ соответственно.",
          "",
          "Заказы, до которых запрос ещё не дошёл, система возвращает в очередь сама.",
        ].join("\n"),
        ttlSeconds: ALERT_COOLDOWN_SECONDS,
      });
    }

    const stalePaymentWhere = {
      status: { in: ["INITIATING", "PENDING", "UNKNOWN"] as PaymentStatus[] },
      updatedAt: { lt: new Date(Date.now() - PAYMENT_RECONCILIATION_MS) },
    };
    const [stalePayments, oldestPayment] = await Promise.all([
      this.prisma.payment.count({ where: stalePaymentWhere }),
      this.prisma.payment.findFirst({
        where: stalePaymentWhere,
        orderBy: { updatedAt: "asc" },
        select: { updatedAt: true },
      }),
    ]);
    if (stalePayments > 0) {
      alerts.push({
        key: "payments-require-reconciliation",
        subject: `Gulyaly: ${stalePayments} платеж(ей) требуют сверки`,
        body: [
          "Есть платежи с незавершённым или неоднозначным результатом старше 15 минут.",
          `Самый старый: ${oldestPayment?.updatedAt.toISOString() ?? "неизвестно"}`,
          "",
          "Откройте GET /payments/reconciliation. Новая попытка поверх UNKNOWN автоматически не создаётся.",
        ].join("\n"),
        ttlSeconds: ALERT_COOLDOWN_SECONDS,
      });
    }

    const stuckWebhookEvents = await this.prisma.paymentEvent.count({
      where: {
        processedAt: null,
        receivedAt: { lt: new Date(Date.now() - WEBHOOK_INBOX_STUCK_MS) },
      },
    });
    if (stuckWebhookEvents > 0) {
      alerts.push({
        key: "payment-webhook-inbox-stuck",
        subject: `Gulyaly: ${stuckWebhookEvents} webhook-событий платежей не обработано`,
        body: [
          "Проверенные provider events находятся в durable inbox больше 10 минут.",
          "Автоматический replay не смог применить их. Проверьте PaymentEvent.processingError и журнал API.",
        ].join("\n"),
        ttlSeconds: ALERT_COOLDOWN_SECONDS,
      });
    }

    // --- Seller balance cache versus the append-only financial source of truth.
    // Run this inside the existing cross-host deduplicated alert pass instead of adding another
    // timer. A mismatch is never repaired automatically: choosing which side is correct requires
    // an operator to inspect the underlying business event and append a compensating entry.
    try {
      const mismatches = await this.sellerLedger.reconcile();
      if (mismatches.length > 0) {
        const sample = mismatches
          .slice(0, 10)
          .map(
            (row) =>
              `@${row.handle}: cache=${row.cachedBalance.toFixed(2)} TMT, ` +
              `ledger=${row.ledgerBalance.toFixed(2)} TMT, difference=${row.difference.toFixed(2)} TMT`,
          )
          .join("\n");
        alerts.push({
          key: "seller-ledger-mismatch",
          subject: `Gulyaly: расхождение балансов у ${mismatches.length} продавца(ов)`,
          body: [
            "Seller.balanceTmt не совпадает с суммой неизменяемого ledger.",
            "Автоматическое исправление отключено; проверьте источник операции и добавьте компенсирующую запись.",
            "",
            sample,
            ...(mismatches.length > 10 ? [`\nИ ещё: ${mismatches.length - 10}`] : []),
          ].join("\n"),
          ttlSeconds: ALERT_COOLDOWN_SECONDS,
        });
      }
    } catch (err) {
      this.logger.warn(`Seller ledger reconciliation failed: ${err instanceof Error ? err.message : err}`);
      alerts.push({
        key: "seller-ledger-reconciliation-unavailable",
        subject: "Gulyaly: сверка балансов недоступна",
        body: "Не удалось сравнить Seller.balanceTmt с ledger. Проверьте PostgreSQL и журнал API.",
        ttlSeconds: ALERT_COOLDOWN_SECONDS,
      });
    }

    return alerts;
  }

  /**
   * Checks and mails whatever is newly wrong.
   *
   * Note the inherent limit: an SMTP outage cannot be reported over SMTP. That alert is still
   * attempted (the failure may be partial -- a wrong From, one bad recipient) but it is logged at
   * error level regardless, which is what a log-based monitor should watch for. A channel that
   * does not depend on our own mail path would be the real fix.
   */
  async run(): Promise<number> {
    const alerts = await this.collect();
    if (alerts.length === 0) return 0;

    const to = this.recipient();
    let sent = 0;

    for (const alert of alerts) {
      if (!(await this.claimAlert(alert.key, alert.ttlSeconds))) continue;

      this.logger.error(`EMAIL_ALERT ${alert.key}: ${alert.subject}`);
      if (!to) continue;

      try {
        await this.email.sendAlert(to, alert.subject, alert.body);
        sent += 1;
      } catch (err) {
        this.logger.error(
          `Could not deliver alert ${alert.key} to ${to}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    return sent;
  }
}
