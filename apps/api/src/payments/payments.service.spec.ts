import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { validate } from "class-validator";
import { ConfirmManualPaymentDto } from "./dto/confirm-manual-payment.dto";
import { PaymentsService } from "./payments.service";

describe("PaymentsService authorization", () => {
  function serviceFor(order: { id: string; userId: string; status: string; paymentMethod: { provider: string } }) {
    const prisma = { order: { findUnique: jest.fn().mockResolvedValue(order) } };
    const service = new PaymentsService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it("does not let a seller initiate another customer's payment", async () => {
    const { service } = serviceFor({ id: "o1", userId: "customer1", status: "PENDING_PAYMENT", paymentMethod: { provider: "manual" } });

    await expect(service.initiate("o1", { userId: "seller1", role: "SELLER" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it.each(["ADMIN", "MANAGER", "SUPPORT"])("allows %s to initiate on behalf of a customer", async (role) => {
    const order = { id: "o1", userId: "customer1", status: "PENDING_PAYMENT", paymentMethod: { provider: "manual" } };
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "p1" }),
        update: jest.fn().mockResolvedValue({
          id: "p1",
          providerTransactionId: "ref1",
          redirectUrl: null,
          status: "PENDING",
        }),
      },
      paymentInitiationGuard: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn((callback: (value: typeof prisma) => unknown) => callback(prisma)),
    });
    const providers = {
      resolve: jest.fn().mockReturnValue({
        key: "manual",
        initiate: jest.fn().mockResolvedValue({ providerRef: "ref1", redirectUrl: null }),
      }),
    };
    const service = new PaymentsService(prisma as never, providers as never, {} as never, {} as never);

    await expect(service.initiate("o1", { userId: "staff1", role })).resolves.toEqual({
      paymentId: "p1",
      providerRef: "ref1",
      redirectUrl: null,
      status: "PENDING",
    });
  });
});

describe("PaymentsService initiation resilience", () => {
  const order = {
    id: "o1",
    userId: "u1",
    status: "PENDING_PAYMENT",
    amountCharged: 10,
    currency: "TMT",
    paymentMethod: { provider: "gateway" },
  };

  function setup() {
    const initiate = jest.fn().mockResolvedValue({ providerRef: "provider-1", redirectUrl: "https://pay.test/1" });
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "p1" }),
        update: jest.fn().mockResolvedValue({
          id: "p1",
          providerTransactionId: "provider-1",
          redirectUrl: "https://pay.test/1",
          status: "PENDING",
        }),
      },
      paymentInitiationGuard: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    Object.assign(prisma, {
      $transaction: jest.fn((callback: (value: typeof prisma) => unknown) => callback(prisma)),
    });
    const providers = { resolve: jest.fn().mockReturnValue({ key: "gateway", initiate }) };
    const service = new PaymentsService(prisma as never, providers as never, {} as never, {} as never);
    return { service, prisma, initiate };
  }

  it("returns an existing attempt for the same HTTP idempotency key", async () => {
    const { service, prisma, initiate } = setup();
    prisma.payment.findUnique.mockResolvedValue({
      id: "p-existing",
      orderId: "o1",
      providerTransactionId: "provider-existing",
      redirectUrl: "https://pay.test/existing",
      status: "PENDING",
    });

    const result = await service.initiate("o1", { userId: "u1", role: "CUSTOMER" }, "checkout-attempt-1");

    expect(result.paymentId).toBe("p-existing");
    expect(initiate).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("rejects reuse of a key bound to a different order", async () => {
    const { service, prisma } = setup();
    prisma.payment.findUnique.mockResolvedValue({ id: "p2", orderId: "other" });

    await expect(
      service.initiate("o1", { userId: "u1", role: "CUSTOMER" }, "checkout-attempt-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not open another attempt while an UNKNOWN payment exists", async () => {
    const { service, prisma, initiate } = setup();
    prisma.payment.findFirst.mockResolvedValue({
      id: "p-unknown",
      orderId: "o1",
      providerTransactionId: null,
      redirectUrl: null,
      status: "UNKNOWN",
    });

    expect((await service.initiate("o1", { userId: "u1", role: "CUSTOMER" })).status).toBe("UNKNOWN");
    expect(initiate).not.toHaveBeenCalled();
  });

  it("marks a network/provider exception UNKNOWN instead of claiming it failed", async () => {
    const { service, prisma, initiate } = setup();
    initiate.mockRejectedValue(new Error("timeout"));

    await expect(
      service.initiate("o1", { userId: "u1", role: "CUSTOMER" }, "checkout-attempt-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "UNKNOWN", failureCode: "INITIATION_AMBIGUOUS" },
    });
  });
});

describe("PaymentsService manual confirmation boundary", () => {
  function setup(provider: string) {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({ id: "o1", paymentMethod: { provider } }),
      },
    };
    const auditLog = { record: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, {} as never, auditLog as never);
    jest.spyOn(service, "confirmPayment").mockResolvedValue({ alreadyProcessed: false, requiresRefund: false });
    return { service, auditLog };
  }

  it("rejects manual confirmation for a provider-backed payment method", async () => {
    const { service } = setup("acquirer");

    await expect(service.confirmManualPayment("o1", "admin1", "bank statement checked")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.confirmPayment).not.toHaveBeenCalled();
  });

  it("confirms only a manual method and records the required reason", async () => {
    const { service, auditLog } = setup("manual");

    await service.confirmManualPayment("o1", "admin1", "cash receipt 2026-09-07");

    expect(service.confirmPayment).toHaveBeenCalledWith("o1");
    expect(auditLog.record).toHaveBeenCalledWith("admin1", "payment.manual-confirm", "Order", "o1", {
      reason: "cash receipt 2026-09-07",
    });
  });

  it("requires a substantive manual confirmation reason at the HTTP boundary", async () => {
    const missing = new ConfirmManualPaymentDto();
    missing.reason = "";
    const valid = new ConfirmManualPaymentDto();
    valid.reason = "cash receipt 2026-09-07";

    expect(await validate(missing)).not.toHaveLength(0);
    expect(await validate(valid)).toHaveLength(0);
  });
});

describe("PaymentsService settlement and reconciliation", () => {
  it("settles payment, order and delivery obligation in one transaction", async () => {
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "o1",
          status: "PENDING_PAYMENT",
          amountCharged: 10,
          currency: "TMT",
          paymentMethod: { provider: "manual" },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({ id: "p1", orderId: "o1", status: "PENDING" }),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      paymentInitiationGuard: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      topupJob: { upsert: jest.fn().mockResolvedValue({ id: "j1" }) },
    };
    const prisma = { $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const audit = { record: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, audit as never);

    await expect(service.confirmPayment("o1", "admin1")).resolves.toEqual({
      alreadyProcessed: false,
      requiresRefund: false,
    });
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }),
    );
    expect(tx.topupJob.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId: "o1" }, create: { orderId: "o1", status: "QUEUED" } }),
    );
    expect(queue.add).toHaveBeenCalledWith("process-topup", { orderId: "o1" }, expect.objectContaining({ jobId: "o1" }));
  });

  it("marks a verified webhook processed inside the settlement transaction", async () => {
    const tx = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: "o1",
          status: "PENDING_PAYMENT",
          amountCharged: 10,
          currency: "TMT",
          paymentMethod: { provider: "gateway" },
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue({ id: "p1", orderId: "o1", status: "PENDING" }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      paymentEvent: { update: jest.fn().mockResolvedValue({}) },
      paymentInitiationGuard: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      topupJob: { upsert: jest.fn().mockResolvedValue({ id: "j1" }) },
    };
    const prisma = { $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, {} as never);

    await service.confirmPayment("o1", undefined, "p1", "inbox-1");

    expect(tx.paymentEvent.update).toHaveBeenCalledWith({
      where: { id: "inbox-1" },
      data: expect.objectContaining({ paymentId: "p1", processedAt: expect.any(Date) }),
    });
  });

  it("treats a duplicate confirmation as success without creating another database obligation", async () => {
    const tx = {
      order: { findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "COMPLETED" }) },
      payment: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      paymentInitiationGuard: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      topupJob: { upsert: jest.fn() },
    };
    const prisma = { $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
    const queue = { add: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, {} as never);

    await expect(service.confirmPayment("o1")).resolves.toEqual({
      alreadyProcessed: true,
      requiresRefund: false,
    });
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(tx.topupJob.upsert).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("preserves verified provider success on a cancelled order and flags a required refund", async () => {
    const tx = {
      order: { findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "CANCELLED" }) },
      payment: {
        findUnique: jest.fn().mockResolvedValue({ id: "p1", orderId: "o1", status: "UNKNOWN" }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma = { $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
    const queue = { add: jest.fn() };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, {} as never);

    await expect(service.confirmPayment("o1", undefined, "p1")).resolves.toEqual({
      alreadyProcessed: false,
      requiresRefund: true,
    });
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: expect.objectContaining({ status: "SUCCEEDED" }),
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("records a second verified success that loses the order-settlement race as refundable", async () => {
    const tx = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: "o1", status: "PENDING_PAYMENT" })
          .mockResolvedValueOnce({ id: "o1", status: "PAID" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payment: {
        findUnique: jest.fn().mockResolvedValue({ id: "p2", orderId: "o1", status: "UNKNOWN" }),
        update: jest.fn().mockResolvedValue({}),
        // A DIFFERENT payment already settled this order: money really was taken twice.
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const prisma = { $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, {} as never);

    await expect(service.confirmPayment("o1", undefined, "p2")).resolves.toEqual({
      alreadyProcessed: true,
      requiresRefund: true,
    });
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: expect.objectContaining({ status: "SUCCEEDED" }),
    });
    expect(tx.payment.count).toHaveBeenCalledWith({
      where: { orderId: "o1", status: "SUCCEEDED", id: { not: "p2" } },
    });
  });

  it("does not flag a refund when the SAME payment won the race on another host", async () => {
    // Both API nodes sweep the same rows in the same database, so one payment being settled
    // twice concurrently is routine. Treating "we lost the claim" as proof of a double charge
    // asked operators to refund correctly-paid orders.
    const tx = {
      order: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: "o1", status: "PENDING_PAYMENT" })
          .mockResolvedValueOnce({ id: "o1", status: "PAID" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      payment: {
        // Re-read inside the transaction: the winner was this very payment.
        findUnique: jest.fn().mockResolvedValue({ id: "p1", orderId: "o1", status: "SUCCEEDED" }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const prisma = { $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)) };
    const queue = { add: jest.fn().mockResolvedValue({}) };
    const service = new PaymentsService(prisma as never, {} as never, queue as never, {} as never);

    await expect(service.confirmPayment("o1", undefined, "p1")).resolves.toEqual({
      alreadyProcessed: true,
      requiresRefund: false,
    });
    // Already SUCCEEDED, so nothing to rewrite -- and above all, no refund obligation invented.
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it("lists stale attempts without calling provider lookup or mutating payment state", async () => {
    const payment = {
      id: "p1",
      orderId: "o1",
      provider: "gateway",
      idempotencyKey: "checkout-attempt-1",
      status: "UNKNOWN",
      updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    };
    const lookup = jest.fn();
    const prisma = { payment: { findMany: jest.fn().mockResolvedValue([payment]), update: jest.fn() } };
    const providers = { resolve: jest.fn().mockReturnValue({ key: "gateway", lookup }) };
    const service = new PaymentsService(prisma as never, providers as never, {} as never, {} as never);

    await expect(service.listStale(15)).resolves.toEqual([
      expect.objectContaining({ paymentId: "p1", action: "LOOKUP_AVAILABLE" }),
    ]);
    expect(lookup).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("leaves stale manual payments for review without retrying initiation", async () => {
    const payment = {
      id: "p1",
      orderId: "o1",
      provider: "manual",
      idempotencyKey: "checkout-attempt-1",
      providerTransactionId: "manual_1",
      status: "UNKNOWN",
      updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    };
    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([payment]),
        update: jest.fn(),
      },
    };
    const provider = { key: "manual", initiate: jest.fn() };
    const providers = { resolve: jest.fn().mockReturnValue(provider) };
    const service = new PaymentsService(prisma as never, providers as never, {} as never, {} as never);

    await expect(service.reconcileStale(15)).resolves.toEqual([
      expect.objectContaining({ paymentId: "p1", status: "UNKNOWN", action: "MANUAL_REVIEW" }),
    ]);
    expect(provider.initiate).not.toHaveBeenCalled();
    expect(prisma.payment.update).not.toHaveBeenCalled();
  });

  it("does not settle a successful lookup whose amount differs from the payment", async () => {
    const payment = {
      id: "p1",
      orderId: "o1",
      provider: "gateway",
      idempotencyKey: "checkout-attempt-1",
      providerTransactionId: "txn-1",
      amount: new Prisma.Decimal("10.00"),
      currency: "RUB",
      status: "UNKNOWN",
      updatedAt: new Date("2026-09-06T00:00:00.000Z"),
    };
    const lookup = jest.fn().mockResolvedValue({ status: "SUCCEEDED", amount: "9.99", currency: "RUB" });
    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([payment]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const providers = { resolve: jest.fn().mockReturnValue({ key: "gateway", lookup }) };
    const service = new PaymentsService(prisma as never, providers as never, {} as never, {} as never);
    const settle = jest.spyOn(service, "confirmPayment");

    await expect(service.reconcileStale(15)).resolves.toEqual([
      expect.objectContaining({ paymentId: "p1", status: "UNKNOWN", action: "PAYMENT_DETAILS_MISMATCH" }),
    ]);
    expect(settle).not.toHaveBeenCalled();
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCode: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH" }) }),
    );
  });
});
