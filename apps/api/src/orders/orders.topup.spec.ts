import { OrdersService } from "./orders.service";

function fixture() {
  const order = {
    id: "order-1",
    userId: "user-1",
    amountTmt: 10,
    recipientIdentifier: "hidden",
  };
  const prisma = {
    order: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    topupJob: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((callback: (value: typeof prisma) => unknown) => callback(prisma));
  const service = new OrdersService(
    prisma as never,
    {} as never,
    { record: jest.fn() } as never,
    {} as never,
    { maybeRewardReferral: jest.fn() } as never,
    {} as never,
  );
  return { order, prisma, service };
}

describe("OrdersService top-up outcome handling", () => {
  it("keeps an ambiguous thrown result in SENT/PROCESSING for reconciliation", async () => {
    const { prisma, service } = fixture();
    const gateway = { topUp: jest.fn().mockRejectedValue(new Error("timeout")) };

    await service.processTopup("order-1", gateway);

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: "order-1", status: "PAID" },
      data: { status: "PROCESSING" },
    });
    expect(prisma.topupJob.update).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      data: { lastError: "timeout" },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("does not call a gateway when the durable QUEUED claim was already consumed", async () => {
    const { prisma, service } = fixture();
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    const gateway = { topUp: jest.fn() };

    await service.processTopup("order-1", gateway);

    expect(gateway.topUp).not.toHaveBeenCalled();
    expect(prisma.topupJob.updateMany).not.toHaveBeenCalled();
  });

  it("marks only an explicit operator decline as FAILED", async () => {
    const { prisma, service } = fixture();
    const gateway = {
      topUp: jest.fn().mockResolvedValue({ outcome: "DECLINED", errorMessage: "invalid account" }),
    };

    await service.processTopup("order-1", gateway);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(prisma.topupJob.update).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      data: { status: "FAILED", lastError: "invalid account" },
    });
  });

  it("does not send when cancellation wins before the atomic PAID claim", async () => {
    const { prisma, service } = fixture();
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    const gateway = { topUp: jest.fn() };

    await service.processTopup("order-1", gateway);

    expect(gateway.topUp).not.toHaveBeenCalled();
    expect(prisma.topupJob.updateMany).not.toHaveBeenCalled();
  });
});
