import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import { Prisma, type CurrencyCode, type Payment, type PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { TOPUP_QUEUE } from "../queue/queue.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { isStaffRole } from "../common/staff-role";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  constructor(
    private prisma: PrismaService,
    private providers: PaymentProviderRegistry,
    @Inject(TOPUP_QUEUE) private topupQueue: Queue,
    private auditLog: AuditLogService,
  ) {}

  private initiationResponse(payment: Pick<Payment, "id" | "providerTransactionId" | "redirectUrl" | "status">) {
    return {
      paymentId: payment.id,
      providerRef: payment.providerTransactionId,
      redirectUrl: payment.redirectUrl,
      status: payment.status,
    };
  }

  private validateIdempotencyKey(value?: string): string {
    if (!value) return randomUUID();
    const key = value.trim();
    if (!/^[A-Za-z0-9._:-]{8,64}$/.test(key)) {
      throw new BadRequestException("Idempotency-Key must be 8-64 safe ASCII characters");
    }
    return key;
  }

  async initiate(orderId: string, requester: { userId: string; role: string }, requestedKey?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { paymentMethod: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    // Without this, any authenticated customer could initiate payment against someone else's
    // order id (IDOR) -- staff roles are exempt since they legitimately act on any order.
    const isOwner = order.userId === requester.userId;
    const isStaff = isStaffRole(requester.role);
    if (!isOwner && !isStaff) throw new ForbiddenException();

    if (order.status !== "PENDING_PAYMENT") {
      throw new BadRequestException("Order is not awaiting payment");
    }

    const idempotencyKey = this.validateIdempotencyKey(requestedKey);
    const sameRequest = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (sameRequest) {
      if (sameRequest.orderId !== order.id) {
        throw new BadRequestException("Idempotency-Key is already bound to another order");
      }
      return this.initiationResponse(sameRequest);
    }

    // Even legacy clients that do not send a key cannot open a second gateway attempt while the
    // previous outcome may still settle. The durable guard acquired below closes the concurrent
    // TOCTOU gap; UNKNOWN is deliberately kept guarded until reconciliation.
    const unresolved = await this.prisma.payment.findFirst({
      where: { orderId: order.id, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
      orderBy: { createdAt: "desc" },
    });
    if (unresolved) return this.initiationResponse(unresolved);

    // Written *before* calling the provider: if the process dies between the provider accepting
    // the charge and us recording that, this row (status INITIATING, holding the same key we
    // gave the provider) is what lets a human reconcile it later instead of the charge vanishing
    // from our side entirely.
    let payment: Payment;
    let initiationOrder = order;
    try {
      const claimed = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${order.id}, 0))`;
        const currentOrder = await tx.order.findUnique({
          where: { id: order.id },
          include: { paymentMethod: true },
        });
        if (!currentOrder || currentOrder.status !== "PENDING_PAYMENT") {
          throw new BadRequestException("Order is not awaiting payment");
        }
        // Unlike a partial status index, this claim remains held when a timeout turns the
        // attempt UNKNOWN. A concurrent request therefore cannot slip into the gap and charge
        // again before reconciliation.
        await tx.paymentInitiationGuard.create({ data: { orderId: order.id } });
        const created = await tx.payment.create({
          data: {
            orderId: order.id,
            provider: currentOrder.paymentMethod.provider,
            idempotencyKey,
            amount: currentOrder.amountCharged,
            currency: currentOrder.currency,
            status: "INITIATING",
          },
        });
        await tx.paymentInitiationGuard.update({
          where: { orderId: order.id },
          data: { paymentId: created.id },
        });
        return { payment: created, order: currentOrder };
      });
      payment = claimed.payment;
      initiationOrder = claimed.order;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const winner = await this.prisma.payment.findFirst({
        where: {
          orderId: order.id,
          OR: [{ idempotencyKey }, { status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } }],
        },
        orderBy: { createdAt: "desc" },
      });
      if (!winner) throw err;
      return this.initiationResponse(winner);
    }

    const provider = this.providers.resolve(initiationOrder.paymentMethod.provider);
    let result: Awaited<ReturnType<typeof provider.initiate>>;
    try {
      result = await provider.initiate(initiationOrder, idempotencyKey);
    } catch (err) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        // A network error is not proof of rejection: the provider may have accepted the request
        // before the response was lost. UNKNOWN blocks another charge until lookup/manual review.
        data: { status: "UNKNOWN", failureCode: "INITIATION_AMBIGUOUS" },
      });
      throw new ServiceUnavailableException("Payment outcome is unknown and requires reconciliation");
    }

    const initiated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerTransactionId: result.providerRef,
        redirectUrl: result.redirectUrl,
        status: "PENDING",
      },
    });

    return this.initiationResponse(initiated);
  }

  async confirmManualPayment(orderId: string, adminId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { paymentMethod: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.paymentMethod.provider !== "manual") {
      throw new BadRequestException("Provider payments can only be confirmed by verified webhook or lookup");
    }
    const result = await this.confirmPayment(orderId);
    if (!result.alreadyProcessed) {
      this.auditLog.record(adminId, "payment.manual-confirm", "Order", orderId, { reason });
    }
    return result;
  }

  /** Internal settlement path for verified provider facts and validated manual confirmation. */
  async confirmPayment(orderId: string, adminId?: string, paymentId?: string, webhookEventId?: string) {
    const settled = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { paymentMethod: true },
      });
      if (!order) throw new NotFoundException("Order not found");

      const payment = paymentId
        ? await tx.payment.findUnique({ where: { id: paymentId } })
        : await tx.payment.findFirst({
            where: { orderId, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
            orderBy: { createdAt: "desc" },
          });
      if (paymentId && (!payment || payment.orderId !== orderId)) {
        throw new BadRequestException("Payment does not belong to this order");
      }
      const markWebhookProcessed = async (resolvedPaymentId: string, processingError: string | null) => {
        if (!webhookEventId) return;
        await tx.paymentEvent.update({
          where: { id: webhookEventId },
          data: {
            paymentId: resolvedPaymentId,
            processedAt: new Date(),
            processingStartedAt: null,
            processingError,
          },
        });
      };

      // A verified provider success is a financial fact even if the order was cancelled in the
      // meantime. Persist it monotonically and surface the conflict for refund handling.
      if (["CANCELLED", "REFUNDED", "FAILED"].includes(order.status)) {
        if (!paymentId || !payment) throw new BadRequestException("Order is not awaiting payment");
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", confirmedAt: new Date(), failureCode: null },
        });
        await markWebhookProcessed(payment.id, "SUCCEEDED_REQUIRES_REFUND");
        return { alreadyProcessed: false, shouldEnqueue: false, requiresRefund: true };
      }

      if (["PAID", "PROCESSING", "COMPLETED"].includes(order.status)) {
        const requiresRefund = Boolean(paymentId && payment && payment.status !== "SUCCEEDED");
        if (payment && payment.status !== "SUCCEEDED") {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: "SUCCEEDED", confirmedAt: new Date(), failureCode: null },
          });
        }
        await tx.paymentInitiationGuard.deleteMany({ where: { orderId } });
        if (payment) {
          await markWebhookProcessed(payment.id, requiresRefund ? "SUCCEEDED_REQUIRES_REFUND" : null);
        }
        return { alreadyProcessed: true, shouldEnqueue: order.status === "PAID", requiresRefund };
      }
      if (order.status !== "PENDING_PAYMENT") {
        throw new BadRequestException("Order is not awaiting payment");
      }

      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "PENDING_PAYMENT" },
        data: { status: "PAID", paidAt: new Date() },
      });
      if (claimed.count === 0) {
        // Another settlement won while this transaction waited on the order row. Losing that race
        // is NOT by itself evidence of a double charge: the winner is very often *this same
        // payment*, settled concurrently by the other node's reconciliation sweep or by a webhook
        // retry -- both API hosts run those loops against one database. Flagging a refund on
        // "we lost the claim" alone raised SUCCEEDED_REQUIRES_REFUND for correctly-paid orders,
        // i.e. it asked an operator to give money back for a single, legitimate payment.
        // A refund is owed only when a *different* payment also settled this order.
        if (paymentId && payment) {
          const current = await tx.payment.findUnique({ where: { id: payment.id } });
          if (current?.status !== "SUCCEEDED") {
            await tx.payment.update({
              where: { id: payment.id },
              data: { status: "SUCCEEDED", confirmedAt: new Date(), failureCode: null },
            });
          }
          const otherSettled = await tx.payment.count({
            where: { orderId, status: "SUCCEEDED", id: { not: payment.id } },
          });
          const requiresRefund = otherSettled > 0;
          const currentOrder = await tx.order.findUnique({ where: { id: orderId } });
          await markWebhookProcessed(payment.id, requiresRefund ? "SUCCEEDED_REQUIRES_REFUND" : null);
          return {
            alreadyProcessed: true,
            shouldEnqueue: currentOrder?.status === "PAID",
            requiresRefund,
          };
        }
        return { alreadyProcessed: true, shouldEnqueue: true, requiresRefund: false };
      }

      if (payment) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: "SUCCEEDED", confirmedAt: new Date(), failureCode: null },
        });
      } else {
        // The existing mobile/manual flow intentionally has no initiation call. Preserve an
        // explicit financial record instead of marking the order paid with no Payment evidence.
        await tx.payment.create({
          data: {
            orderId,
            provider: "manual",
            providerTransactionId: `manual_${orderId}`,
            idempotencyKey: `manual-confirm:${orderId}`,
            amount: order.amountCharged,
            currency: order.currency,
            status: "SUCCEEDED",
            confirmedAt: new Date(),
          },
        });
      }
      const unresolved = await tx.payment.count({
        where: { orderId, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
      });
      if (unresolved === 0) await tx.paymentInitiationGuard.deleteMany({ where: { orderId } });
      await tx.topupJob.upsert({
        where: { orderId },
        create: { orderId, status: "QUEUED" },
        update: {},
      });
      if (payment) await markWebhookProcessed(payment.id, null);
      return { alreadyProcessed: false, shouldEnqueue: true, requiresRefund: false };
    });

    if (adminId && !settled.alreadyProcessed) {
      this.auditLog.record(adminId, "payment.confirm", "Order", orderId);
    }

    // jobId = orderId: BullMQ refuses a second job with the same id while one exists, so a
    // duplicate enqueue for the same order (e.g. a retried webhook) can't create a second
    // concurrent worker run of it -- on top of the QUEUED->SENT claim in processTopup itself.
    if (settled.shouldEnqueue) {
      await this.topupQueue.add(
        "process-topup",
        { orderId },
        { jobId: orderId, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
      );
    }
    return {
      alreadyProcessed: settled.alreadyProcessed,
      requiresRefund: settled.requiresRefund,
    };
  }

  async listStale(minutes: number) {
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const stale = await this.prisma.payment.findMany({
      where: { status: { in: ["INITIATING", "PENDING", "UNKNOWN"] }, updatedAt: { lt: cutoff } },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });

    return stale.map((payment) => {
      let action = "MANUAL_REVIEW";
      try {
        action = this.providers.resolve(payment.provider).lookup && payment.idempotencyKey
          ? "LOOKUP_AVAILABLE"
          : "MANUAL_REVIEW";
      } catch {
        action = "PROVIDER_UNAVAILABLE";
      }
      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        status: payment.status,
        action,
        updatedAt: payment.updatedAt,
      };
    });
  }

  async reconcileStale(minutes: number) {
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const stale = await this.prisma.payment.findMany({
      where: { status: { in: ["INITIATING", "PENDING", "UNKNOWN"] }, updatedAt: { lt: cutoff } },
      orderBy: { updatedAt: "asc" },
      take: 100,
    });

    const rows: Array<Record<string, unknown>> = [];
    for (const payment of stale) {
      let status: PaymentStatus = payment.status;
      let provider: ReturnType<PaymentProviderRegistry["resolve"]>;
      try {
        provider = this.providers.resolve(payment.provider);
      } catch {
        rows.push({
          paymentId: payment.id,
          orderId: payment.orderId,
          provider: payment.provider,
          status,
          action: "PROVIDER_UNAVAILABLE",
          updatedAt: payment.updatedAt,
        });
        continue;
      }
      let action = provider.lookup && payment.idempotencyKey ? "LOOKED_UP" : "MANUAL_REVIEW";
      if (provider.lookup && payment.idempotencyKey) {
        let result: Awaited<ReturnType<NonNullable<typeof provider.lookup>>>;
        try {
          result = await provider.lookup({
            idempotencyKey: payment.idempotencyKey,
            providerTransactionId: payment.providerTransactionId,
          });
        } catch {
          status = "UNKNOWN";
          action = "LOOKUP_FAILED";
          const changed = await this.prisma.payment.updateMany({
            where: { id: payment.id, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
            data: { status: "UNKNOWN", failureCode: "LOOKUP_FAILED" },
          });
          if (changed.count === 0) {
            const current = await this.prisma.payment.findUnique({ where: { id: payment.id } });
            status = current?.status ?? status;
            action = "IGNORED_TERMINAL_PAYMENT";
          }
          rows.push({
            paymentId: payment.id,
            orderId: payment.orderId,
            provider: payment.provider,
            status,
            action,
            updatedAt: payment.updatedAt,
          });
          continue;
        }

        status = result.status;
        if (result.status === "SUCCEEDED") {
          const amount = result.amount?.trim();
          const currency = result.currency?.trim().toUpperCase();
          if (
            !amount ||
            !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(amount) ||
            !currency ||
            !new Prisma.Decimal(payment.amount).equals(amount) ||
            payment.currency !== currency
          ) {
            status = "UNKNOWN";
            action = "PAYMENT_DETAILS_MISMATCH";
            await this.prisma.payment.updateMany({
              where: { id: payment.id, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
              data: { status: "UNKNOWN", failureCode: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH" },
            });
          } else {
            const outcome = await this.confirmPayment(payment.orderId, undefined, payment.id);
            action = outcome.requiresRefund ? "SUCCEEDED_REQUIRES_REFUND" : "SETTLED";
          }
        } else {
          await this.prisma.$transaction(async (tx) => {
            const changed = await tx.payment.updateMany({
              where: { id: payment.id, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
              data: {
                status: result.status,
                providerStatus: result.providerStatus,
                providerTransactionId: result.providerRef ?? payment.providerTransactionId,
                failureCode: result.status === "UNKNOWN" ? "LOOKUP_AMBIGUOUS" : null,
              },
            });
            if (changed.count === 0) {
              const current = await tx.payment.findUnique({ where: { id: payment.id } });
              status = current?.status ?? status;
              action = "IGNORED_TERMINAL_PAYMENT";
            }
            if (changed.count > 0 && ["DECLINED", "CANCELLED"].includes(result.status)) {
              const unresolved = await tx.payment.count({
                where: { orderId: payment.orderId, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
              });
              if (unresolved === 0) {
                await tx.paymentInitiationGuard.deleteMany({ where: { orderId: payment.orderId } });
              }
            }
          });
        }
      }
      rows.push({
        paymentId: payment.id,
        orderId: payment.orderId,
        provider: payment.provider,
        status,
        action,
        updatedAt: payment.updatedAt,
      });
    }
    return rows;
  }

  async receiveWebhook(
    providerKey: string,
    rawBody: Buffer | undefined,
    headers: Readonly<Record<string, string | string[] | undefined>>,
  ) {
    if (!rawBody) throw new BadRequestException("Raw webhook body is required");
    const provider = this.providers.resolve(providerKey);
    if (!provider.verifyAndParseWebhook) {
      throw new BadRequestException("Provider does not support webhooks");
    }

    // The adapter must authenticate the exact bytes before anything derived from the request is
    // trusted or persisted. Signature headers themselves are never returned by the adapter.
    const normalized = await provider.verifyAndParseWebhook({ rawBody, headers });
    const safeId = (value: string | undefined, field: string, required = false) => {
      const result = value?.trim();
      if ((required && !result) || (result && (result.length > 200 || /[\u0000-\u001f]/.test(result)))) {
        throw new BadRequestException(`Invalid webhook ${field}`);
      }
      return result;
    };
    const eventId = safeId(normalized.eventId, "eventId", true)!;
    const providerTransactionId = safeId(normalized.providerTransactionId, "providerTransactionId");
    const idempotencyKey = safeId(normalized.idempotencyKey, "idempotencyKey");
    if (!providerTransactionId && !idempotencyKey) {
      throw new BadRequestException("Webhook must identify a payment");
    }
    if (!["PENDING", "SUCCEEDED", "DECLINED", "UNKNOWN", "CANCELLED"].includes(normalized.status)) {
      throw new BadRequestException("Invalid webhook payment status");
    }
    const amount = normalized.amount?.trim();
    const currency = normalized.currency?.trim().toUpperCase();
    if (normalized.status === "SUCCEEDED") {
      if (!amount || !/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(amount)) {
        throw new BadRequestException("Successful webhook must contain a valid amount");
      }
      if (!currency || !["USD", "RUB", "EUR", "TRY", "CNY", "KZT"].includes(currency)) {
        throw new BadRequestException("Successful webhook must contain a valid currency");
      }
    }
    if (normalized.payload) {
      const entries = Object.entries(normalized.payload);
      const sensitiveKey = /secret|signature|authorization|token|password|card|pan|cvv|cvc|email|phone|name|address/i;
      const unsafe =
        Array.isArray(normalized.payload) ||
        entries.length > 32 ||
        entries.some(
          ([key, value]) =>
            !/^[A-Za-z0-9_.:-]{1,64}$/.test(key) ||
            sensitiveKey.test(key) ||
            !(
              value === null ||
              typeof value === "boolean" ||
              (typeof value === "number" && Number.isFinite(value)) ||
              (typeof value === "string" && value.length <= 500)
            ),
        );
      if (unsafe || JSON.stringify(normalized.payload).length > 8192) {
        throw new BadRequestException("Webhook diagnostic payload is unsafe or too large");
      }
    }
    const contentHash = createHash("sha256").update(rawBody).digest("hex");

    let inboxId: string;
    let duplicate = false;
    try {
      const created = await this.prisma.paymentEvent.create({
        data: {
          provider: provider.key,
          eventId,
          providerTransactionId,
          idempotencyKey,
          status: normalized.status,
          amount,
          currency: currency as CurrencyCode | undefined,
          providerStatus: safeId(normalized.providerStatus, "providerStatus"),
          contentHash,
          payload: normalized.payload,
        },
      });
      inboxId = created.id;
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
      const existing = await this.prisma.paymentEvent.findUnique({
        where: { provider_eventId: { provider: provider.key, eventId } },
      });
      if (!existing) throw err;
      if (existing.contentHash !== contentHash) {
        this.logger.error(`Payment webhook event-id collision provider=${provider.key} eventId=${eventId}`);
        throw new ConflictException("Webhook event id was reused with different content");
      }
      inboxId = existing.id;
      duplicate = true;
    }

    const processed = await this.processWebhookEvent(inboxId);
    return { received: true, duplicate, processed };
  }

  async processWebhookEvent(eventId: string): Promise<boolean> {
    const staleClaim = new Date(Date.now() - 5 * 60_000);
    const claimed = await this.prisma.paymentEvent.updateMany({
      where: {
        id: eventId,
        processedAt: null,
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleClaim } }],
      },
      data: { processingStartedAt: new Date(), processingError: null },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.paymentEvent.findUnique({ where: { id: eventId } });
      return current?.processedAt != null;
    }

    const event = await this.prisma.paymentEvent.findUniqueOrThrow({ where: { id: eventId } });
    try {
      const [byTransaction, byIdempotency] = await Promise.all([
        event.providerTransactionId
          ? this.prisma.payment.findFirst({
              where: { provider: event.provider, providerTransactionId: event.providerTransactionId },
            })
          : null,
        event.idempotencyKey
          ? this.prisma.payment.findFirst({
              where: { provider: event.provider, idempotencyKey: event.idempotencyKey },
            })
          : null,
      ]);
      if (byTransaction && byIdempotency && byTransaction.id !== byIdempotency.id) {
        await this.prisma.paymentEvent.update({
          where: { id: event.id },
          data: {
            processedAt: new Date(),
            processingStartedAt: null,
            processingError: "PAYMENT_IDENTIFIER_CONFLICT",
          },
        });
        return true;
      }
      const payment = byTransaction ?? byIdempotency;
      if (!payment) {
        await this.prisma.paymentEvent.update({
          where: { id: event.id },
          data: { processingStartedAt: null, processingError: "PAYMENT_NOT_FOUND" },
        });
        return false;
      }

      if (
        event.status === "SUCCEEDED" &&
        (!event.amount || !event.currency || !new Prisma.Decimal(payment.amount).equals(event.amount) || payment.currency !== event.currency)
      ) {
        await this.prisma.paymentEvent.update({
          where: { id: event.id },
          data: {
            paymentId: payment.id,
            processedAt: new Date(),
            processingStartedAt: null,
            processingError: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH",
          },
        });
        return true;
      }

      if (event.status === "SUCCEEDED") {
        // confirmPayment owns the inbox row from here: it marks it processed inside its own
        // transaction and records SUCCEEDED_REQUIRES_REFUND there when one is genuinely owed.
        await this.confirmPayment(payment.orderId, undefined, payment.id, event.id);
        return true;
      } else {
        let processingError: string | null = null;
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.payment.updateMany({
            where: { id: payment.id, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
            data: {
              status: event.status,
              providerStatus: event.providerStatus,
              providerTransactionId: event.providerTransactionId ?? payment.providerTransactionId,
              failureCode: event.status === "UNKNOWN" ? "WEBHOOK_AMBIGUOUS" : null,
            },
          });
          if (changed.count === 0) processingError = "IGNORED_TERMINAL_PAYMENT";
          if (changed.count > 0 && ["DECLINED", "CANCELLED"].includes(event.status)) {
            const unresolved = await tx.payment.count({
              where: { orderId: payment.orderId, status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
            });
            if (unresolved === 0) {
              await tx.paymentInitiationGuard.deleteMany({ where: { orderId: payment.orderId } });
            }
          }
          await tx.paymentEvent.update({
            where: { id: event.id },
            data: {
              paymentId: payment.id,
              processedAt: new Date(),
              processingStartedAt: null,
              processingError,
            },
          });
        });
      }
      return true;
    } catch (err) {
      this.logger.error(
        `Payment webhook processing failed eventId=${event.id}: ${err instanceof Error ? err.message : err}`,
        err instanceof Error ? err.stack : undefined,
      );
      const reset = await this.prisma.paymentEvent.updateMany({
        where: { id: event.id, processedAt: null },
        data: { processingStartedAt: null, processingError: "PROCESSING_FAILED" },
      });
      return reset.count === 0;
    }
  }

  async replayPendingWebhookEvents(limit = 50): Promise<number> {
    const pending = await this.prisma.paymentEvent.findMany({
      where: {
        processedAt: null,
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: new Date(Date.now() - 5 * 60_000) } }],
      },
      select: { id: true },
      orderBy: { receivedAt: "asc" },
      take: limit,
    });
    let processed = 0;
    for (const event of pending) {
      if (await this.processWebhookEvent(event.id)) processed++;
    }
    return processed;
  }
}
