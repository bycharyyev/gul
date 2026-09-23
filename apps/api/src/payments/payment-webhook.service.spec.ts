import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { PaymentsService } from "./payments.service";

describe("PaymentsService webhook trust boundary", () => {
  const rawBody = Buffer.from('{"event":"evt-1"}');
  const normalized = {
    eventId: "evt-1",
    status: "PENDING" as const,
    amount: "10.00",
    currency: "RUB",
    providerTransactionId: "txn-1",
    payload: { result: "pending" },
  };

  function setup() {
    const adapter = {
      key: "gateway",
      initiate: jest.fn(),
      verifyAndParseWebhook: jest.fn().mockResolvedValue(normalized),
    };
    const paymentEvent = {
      create: jest.fn().mockResolvedValue({ id: "inbox-1" }),
      findUnique: jest.fn(),
    };
    const prisma = { paymentEvent };
    const service = new PaymentsService(
      prisma as never,
      { resolve: jest.fn().mockReturnValue(adapter) } as never,
      {} as never,
      {} as never,
    );
    jest.spyOn(service, "processWebhookEvent").mockResolvedValue(true);
    return { service, prisma, adapter };
  }

  it("verifies exact bytes before writing the durable inbox", async () => {
    const { service, prisma, adapter } = setup();

    await expect(service.receiveWebhook("gateway", rawBody, { "x-signature": "valid" })).resolves.toEqual({
      received: true,
      duplicate: false,
      processed: true,
    });
    expect(adapter.verifyAndParseWebhook).toHaveBeenCalledWith({
      rawBody,
      headers: { "x-signature": "valid" },
    });
    expect(prisma.paymentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: "gateway",
        eventId: "evt-1",
        contentHash: createHash("sha256").update(rawBody).digest("hex"),
      }),
    });
  });

  it("persists nothing when the adapter rejects the signature", async () => {
    const { service, prisma, adapter } = setup();
    adapter.verifyAndParseWebhook.mockRejectedValue(new UnauthorizedException("invalid signature"));

    await expect(service.receiveWebhook("gateway", rawBody, {})).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  it("rejects sensitive diagnostic fields returned by an adapter", async () => {
    const { service, prisma, adapter } = setup();
    adapter.verifyAndParseWebhook.mockResolvedValue({
      ...normalized,
      payload: { cardNumber: "4111111111111111" },
    });

    await expect(service.receiveWebhook("gateway", rawBody, {})).rejects.toThrow("unsafe or too large");
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  it("rejects a successful event that does not carry verified money fields", async () => {
    const { service, prisma, adapter } = setup();
    adapter.verifyAndParseWebhook.mockResolvedValue({
      eventId: "evt-1",
      status: "SUCCEEDED",
      providerTransactionId: "txn-1",
    });

    await expect(service.receiveWebhook("gateway", rawBody, {})).rejects.toThrow(
      "Successful webhook must contain a valid amount",
    );
    expect(prisma.paymentEvent.create).not.toHaveBeenCalled();
  });

  it("rejects an event-id collision with different signed content", async () => {
    const { service, prisma } = setup();
    prisma.paymentEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.3" }),
    );
    prisma.paymentEvent.findUnique.mockResolvedValue({ id: "inbox-1", contentHash: "different" });

    await expect(service.receiveWebhook("gateway", rawBody, {})).rejects.toBeInstanceOf(ConflictException);
    expect(service.processWebhookEvent).not.toHaveBeenCalled();
  });

  it("accepts an exact provider retry as one durable event", async () => {
    const { service, prisma } = setup();
    const contentHash = createHash("sha256").update(rawBody).digest("hex");
    prisma.paymentEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "6.19.3" }),
    );
    prisma.paymentEvent.findUnique.mockResolvedValue({ id: "inbox-1", contentHash });

    await expect(service.receiveWebhook("gateway", rawBody, {})).resolves.toEqual({
      received: true,
      duplicate: true,
      processed: true,
    });
    expect(service.processWebhookEvent).toHaveBeenCalledTimes(1);
  });
});

describe("PaymentsService durable webhook processing", () => {
  function event(overrides: Record<string, unknown> = {}) {
    return {
      id: "inbox-1",
      provider: "gateway",
      providerTransactionId: "txn-1",
      idempotencyKey: "attempt-1",
      status: "DECLINED",
      amount: null,
      currency: null,
      providerStatus: "declined",
      processedAt: null,
      ...overrides,
    };
  }

  function processorSetup(currentEvent = event()) {
    const tx = {
      payment: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      paymentEvent: { update: jest.fn().mockResolvedValue({}) },
      paymentInitiationGuard: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      paymentEvent: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(currentEvent),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: { findFirst: jest.fn() },
      $transaction: jest.fn((callback: (value: typeof tx) => unknown) => callback(tx)),
    };
    const service = new PaymentsService(prisma as never, {} as never, {} as never, {} as never);
    return { service, prisma, tx };
  }

  it("does not apply an event whose two identifiers resolve to different payments", async () => {
    const { service, prisma, tx } = processorSetup();
    prisma.payment.findFirst
      .mockResolvedValueOnce({ id: "payment-a", orderId: "o1" })
      .mockResolvedValueOnce({ id: "payment-b", orderId: "o2" });

    await expect(service.processWebhookEvent("inbox-1")).resolves.toBe(true);
    expect(prisma.paymentEvent.update).toHaveBeenCalledWith({
      where: { id: "inbox-1" },
      data: expect.objectContaining({ processingError: "PAYMENT_IDENTIFIER_CONFLICT" }),
    });
    expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });

  it("retains a late decline but cannot downgrade a terminal successful payment", async () => {
    const { service, prisma, tx } = processorSetup();
    prisma.payment.findFirst.mockResolvedValue({ id: "p1", orderId: "o1", status: "SUCCEEDED" });
    tx.payment.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.processWebhookEvent("inbox-1")).resolves.toBe(true);
    expect(tx.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", status: { in: ["INITIATING", "PENDING", "UNKNOWN"] } },
      }),
    );
    expect(tx.paymentEvent.update).toHaveBeenCalledWith({
      where: { id: "inbox-1" },
      data: expect.objectContaining({ paymentId: "p1", processingError: "IGNORED_TERMINAL_PAYMENT" }),
    });
    expect(prisma.paymentEvent.update).not.toHaveBeenCalled();
  });

  it("passes a verified success and inbox id into the transactional settlement path", async () => {
    const { service, prisma } = processorSetup(event({ status: "SUCCEEDED", amount: new Prisma.Decimal("10.00"), currency: "RUB" }));
    prisma.payment.findFirst.mockResolvedValue({
      id: "p1",
      orderId: "o1",
      status: "PENDING",
      amount: new Prisma.Decimal("10.00"),
      currency: "RUB",
    });
    const settle = jest.spyOn(service, "confirmPayment").mockResolvedValue({
      alreadyProcessed: false,
      requiresRefund: false,
    });

    await expect(service.processWebhookEvent("inbox-1")).resolves.toBe(true);
    expect(settle).toHaveBeenCalledWith("o1", undefined, "p1", "inbox-1");
  });

  it("quarantines a successful event when verified money does not match the payment", async () => {
    const { service, prisma } = processorSetup(
      event({ status: "SUCCEEDED", amount: new Prisma.Decimal("9.99"), currency: "RUB" }),
    );
    prisma.payment.findFirst.mockResolvedValue({
      id: "p1",
      orderId: "o1",
      status: "PENDING",
      amount: new Prisma.Decimal("10.00"),
      currency: "RUB",
    });
    const settle = jest.spyOn(service, "confirmPayment");

    await expect(service.processWebhookEvent("inbox-1")).resolves.toBe(true);
    expect(settle).not.toHaveBeenCalled();
    expect(prisma.paymentEvent.update).toHaveBeenCalledWith({
      where: { id: "inbox-1" },
      data: expect.objectContaining({ processingError: "PAYMENT_AMOUNT_OR_CURRENCY_MISMATCH" }),
    });
  });
});
