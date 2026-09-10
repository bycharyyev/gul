import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";
import { EmailOutboxService } from "../email/email-outbox.service";
import { EmailService } from "../email/email.service";
import { ReferralsService } from "../referrals/referrals.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { OperatorGateway, OperatorTopupResult } from "./operator-gateway.interface";
import type { OrderStatus } from "@prisma/client";
import { canTransition } from "../common/state-machine";
import { ADMIN_ORDER_TRANSITIONS } from "./order-state-machine";
import { isStaffRole } from "../common/staff-role";

const DETAIL_INCLUDE = {
  service: true,
  paymentMethod: true,
  user: { select: { id: true, phone: true, fullName: true } },
  apiKey: { select: { id: true, name: true, ownerLabel: true } },
  payments: { orderBy: { createdAt: "desc" as const } },
  topupJob: true,
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    @Inject(TOPUP_QUEUE) private topupQueue: Queue,
    private outbox: EmailOutboxService,
    private email: EmailService,
    private referrals: ReferralsService,
    private auditLog: AuditLogService,
  ) {}

  async create(attribution: { userId?: string; apiKeyId?: string }, dto: CreateOrderDto) {
    const service = await this.prisma.service.findUnique({ where: { id: dto.serviceId } });
    if (!service || !service.isEnabled) throw new NotFoundException("Service not available");

    if (dto.amountTmt < Number(service.minAmountTmt) || dto.amountTmt > Number(service.maxAmountTmt)) {
      throw new BadRequestException(
        `Amount must be between ${service.minAmountTmt} and ${service.maxAmountTmt} TMT`,
      );
    }

    if (service.validationRegex && !new RegExp(service.validationRegex).test(dto.recipientIdentifier)) {
      throw new BadRequestException("Recipient identifier is invalid for this service");
    }

    const rate = await this.prisma.rate.findUnique({
      where: { serviceId_currency: { serviceId: dto.serviceId, currency: dto.currency } },
    });
    if (!rate || !rate.enabled) throw new BadRequestException("Currency not available for this service");

    const paymentMethod = await this.prisma.paymentMethod.findUnique({
      where: { id: dto.paymentMethodId },
    });
    if (!paymentMethod || !paymentMethod.isEnabled) {
      throw new BadRequestException("Payment method not available");
    }

    const rateValue = Number(rate.rate);
    const feePercent = Number(paymentMethod.feePercent);

    // Order and the obligation to email about it commit together. Previously the email was
    // fired off after the write, leaving a window where a crash in between lost the
    // notification silently.
    const order = await this.prisma.$transaction(async (tx) => {
      // The balance debit, order and its outbox obligation are one financial commit. If either
      // later write fails, PostgreSQL rolls the referral credit back with them.
      const discount = attribution.userId
        ? await this.referrals.applyReferralDiscount(attribution.userId, dto.amountTmt, tx)
        : { amountAfterDiscount: dto.amountTmt, discountApplied: 0 };
      const referralDiscountTmt = discount.discountApplied || undefined;
      const subtotal = discount.amountAfterDiscount * rateValue;
      const feeAmount = subtotal * (feePercent / 100);
      const amountCharged = Math.round((subtotal + feeAmount) * 100) / 100;
      const created = await tx.order.create({
        data: {
          userId: attribution.userId,
          apiKeyId: attribution.apiKeyId,
          serviceId: dto.serviceId,
          paymentMethodId: dto.paymentMethodId,
          recipientIdentifier: dto.recipientIdentifier,
          amountTmt: dto.amountTmt,
          currency: dto.currency,
          rateApplied: rateValue,
          amountCharged,
          feeAmount: Math.round(feeAmount * 100) / 100,
          referralDiscountTmt,
        },
      });
      await this.outbox.record(tx, {
        kind: "ORDER_CREATED",
        orderId: created.id,
        idempotencyKey: `order:${created.id}:ORDER_CREATED`,
      });
      return created;
    });

    return order;
  }

  async findMine(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, requester: { userId: string; role: string }) {
    const order = await this.prisma.order.findFirst({ where: { id }, include: DETAIL_INCLUDE });
    if (!order) throw new NotFoundException("Order not found");

    const isOwner = order.userId === requester.userId;
    const isStaff = isStaffRole(requester.role);
    if (!isOwner && !isStaff) throw new ForbiddenException();

    return order;
  }

  async findOneForApiKey(id: string, apiKeyId: string) {
    const order = await this.prisma.order.findFirst({ where: { id, apiKeyId } });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /** Public order lookup — requires the exact recipient identifier used to place the order. */
  async track(orderId: string, recipientIdentifier: string) {
    if (!orderId || !recipientIdentifier) {
      throw new BadRequestException("orderId and recipientIdentifier are required");
    }
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, recipientIdentifier },
      include: { service: { select: { name: true, logoUrl: true } } },
    });
    if (!order) throw new NotFoundException("Заказ не найден. Проверьте номер заказа и телефон/ID получателя.");

    return {
      id: order.id,
      status: order.status,
      serviceName: order.service.name,
      amountTmt: Number(order.amountTmt),
      currency: order.currency,
      amountCharged: Number(order.amountCharged),
      createdAt: order.createdAt,
      completedAt: order.completedAt,
      failureReason: order.failureReason,
    };
  }

  async findAllForAdmin(status?: string) {
    return this.prisma.order.findMany({
      where: status ? { status: status as OrderStatus } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        service: true,
        paymentMethod: true,
        user: { select: { id: true, phone: true, fullName: true } },
        apiKey: { select: { id: true, name: true, ownerLabel: true } },
      },
    });
  }

  async findOneForAdmin(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  async updateStatusAdmin(id: string, nextStatus: OrderStatus, adminId: string, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");

    if (!canTransition(ADMIN_ORDER_TRANSITIONS, order.status, nextStatus)) {
      throw new BadRequestException(`Cannot move order from ${order.status} to ${nextStatus}`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: {
          status: nextStatus,
          failureReason: nextStatus === "FAILED" || nextStatus === "CANCELLED" ? reason : order.failureReason,
        },
      });
      // Only these two statuses produce a customer email (see sendOrderStatusUpdate).
      if (nextStatus === "COMPLETED" || nextStatus === "FAILED") {
        await this.outbox.record(tx, {
          kind: nextStatus === "COMPLETED" ? "ORDER_COMPLETED" : "ORDER_FAILED",
          orderId: id,
          idempotencyKey: `order:${id}:ORDER_${nextStatus}`,
        });
      }
      return result;
    });

    this.auditLog.record(adminId, "order.status", "Order", id, { from: order.status, to: nextStatus, reason });

    return updated;
  }

  async updateDetailsAdmin(id: string, input: { recipientIdentifier?: string; amountTmt?: number }) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize against payment initiation. The initiator takes the same per-order lock before
      // creating its durable guard/payment, so an edit can neither slip into nor across that gap.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 0))`;
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.status !== "PENDING_PAYMENT") {
        throw new BadRequestException("Only orders awaiting payment can be edited");
      }
      const [guard, payment] = await Promise.all([
        tx.paymentInitiationGuard.findUnique({ where: { orderId: id }, select: { orderId: true } }),
        tx.payment.findFirst({ where: { orderId: id }, select: { id: true } }),
      ]);
      if (guard || payment) throw new BadRequestException("Order cannot be edited after payment initiation");

      const service = await tx.service.findUniqueOrThrow({ where: { id: order.serviceId } });
      const paymentMethod = await tx.paymentMethod.findUniqueOrThrow({ where: { id: order.paymentMethodId } });

    const recipientIdentifier = input.recipientIdentifier ?? order.recipientIdentifier;
    const amountTmt = input.amountTmt ?? Number(order.amountTmt);

    if (amountTmt < Number(service.minAmountTmt) || amountTmt > Number(service.maxAmountTmt)) {
      throw new BadRequestException(
        `Amount must be between ${service.minAmountTmt} and ${service.maxAmountTmt} TMT`,
      );
    }
    if (service.validationRegex && !new RegExp(service.validationRegex).test(recipientIdentifier)) {
      throw new BadRequestException("Recipient identifier is invalid for this service");
    }

    const rateValue = Number(order.rateApplied);
    const feePercent = Number(paymentMethod.feePercent);
    const subtotal = amountTmt * rateValue;
    const feeAmount = subtotal * (feePercent / 100);
    const amountCharged = Math.round((subtotal + feeAmount) * 100) / 100;

      return tx.order.update({
        where: { id },
        data: {
          recipientIdentifier,
          amountTmt,
          amountCharged,
          feeAmount: Math.round(feeAmount * 100) / 100,
        },
      });
    });
  }

  /** Free-text note (e.g. activation key / promo code) surfaced in the completion email. */
  async setDeliveryNote(id: string, deliveryNote: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");
    return this.prisma.order.update({ where: { id }, data: { deliveryNote } });
  }

  async retryTopup(id: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { topupJob: true } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "FAILED") {
      throw new BadRequestException("Only failed orders can be retried");
    }

    await this.prisma.order.update({ where: { id }, data: { status: "PAID", failureReason: null } });
    await this.prisma.topupJob.update({
      where: { orderId: id },
      data: { status: "QUEUED", lastError: null },
    });

    // A previous run's jobId (= orderId) is still in BullMQ's completed/failed set at this point,
    // so re-adding with the same jobId would be a silent no-op -- remove it first so the retry
    // actually gets queued.
    await this.topupQueue.remove(id);
    await this.topupQueue.add(
      "process-topup",
      { orderId: id },
      { jobId: id, attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
  }

  /** Invoked by the topup queue worker. */
  async processTopup(orderId: string, gateway: OperatorGateway) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    // Claim QUEUED -> SENT atomically first. If a previous attempt already got this far --
    // crashed after the gateway call went out but before the result was recorded, or this job
    // was retried after already sending -- this matches 0 rows and we must NOT call the gateway
    // again; we have no way to know whether the operator already received that request. This
    // makes delivery at-most-once, not exactly-once: a crash right after a real send leaves the
    // order stuck in PROCESSING for manual reconciliation instead of risking a second real charge.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const orderClaim = await tx.order.updateMany({
        where: { id: orderId, status: "PAID" },
        data: { status: "PROCESSING" },
      });
      if (orderClaim.count === 0) return false;
      const jobClaim = await tx.topupJob.updateMany({
        where: { orderId, status: "QUEUED" },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      });
      if (jobClaim.count === 0) throw new Error("Top-up job was already claimed");
      return true;
    });
    if (!claimed) return;

    let result: OperatorTopupResult;
    try {
      result = await gateway.topUp(order, orderId);
    } catch (err) {
      // Without this, a thrown error left the job stuck at status "SENT" forever -- the QUEUED
      // guard above would then refuse every retry (correctly, since we don't know if the send
      // went through), but nothing would ever mark it FAILED for a human to look at either.
      result = { outcome: "UNKNOWN", errorMessage: (err as Error).message };
    }

    if (result.outcome === "CONFIRMED") {
      await this.prisma.$transaction(async (tx) => {
        const completed = await tx.order.updateMany({
          where: { id: orderId, status: "PROCESSING" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        if (completed.count === 0) throw new Error("Top-up order left PROCESSING before confirmation");
        await tx.topupJob.update({
          where: { orderId },
          data: { status: "CONFIRMED", confirmedAt: new Date(), operatorRef: result.operatorRef },
        });
        await this.outbox.record(tx, {
          kind: "ORDER_COMPLETED",
          orderId,
          idempotencyKey: `order:${orderId}:ORDER_COMPLETED`,
        });
      });
      if (order.userId) {
        await this.referrals.maybeRewardReferral(order.userId, orderId);
      }
    } else if (result.outcome === "DECLINED") {
      await this.prisma.$transaction(async (tx) => {
        const failed = await tx.order.updateMany({
          where: { id: orderId, status: "PROCESSING" },
          data: { status: "FAILED", failureReason: result.errorMessage ?? "Operator rejected top-up" },
        });
        if (failed.count === 0) throw new Error("Top-up order left PROCESSING before decline");
        await tx.topupJob.update({
          where: { orderId },
          data: { status: "FAILED", lastError: result.errorMessage ?? "Operator rejected top-up" },
        });
        await this.outbox.record(tx, {
          kind: "ORDER_FAILED",
          orderId,
          idempotencyKey: `order:${orderId}:ORDER_FAILED`,
        });
      });
    } else {
      // An UNKNOWN result may mean the operator accepted the request before the connection
      // failed. Keep SENT/PROCESSING so neither BullMQ nor an admin can blindly send it again.
      await this.prisma.topupJob.update({
        where: { orderId },
        data: { lastError: result.errorMessage ?? "Operator outcome is unknown; reconcile manually" },
      });
    }
  }
}
