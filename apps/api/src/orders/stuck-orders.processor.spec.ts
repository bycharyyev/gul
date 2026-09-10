import { Prisma } from "@prisma/client";
import { StuckOrdersProcessor } from "./stuck-orders.processor";

function build(orders: Array<{ id: string }>, opts: { createThrows?: unknown } = {}) {
  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue(orders) },
    topupJob: {
      create: opts.createThrows
        ? jest.fn().mockRejectedValue(opts.createThrows)
        : jest.fn().mockResolvedValue({}),
    },
  };
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const service = new StuckOrdersProcessor(prisma as never, queue as never);
  return { service, prisma, queue };
}

const duplicate = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
  code: "P2002",
  clientVersion: "6.0.0",
});

describe("StuckOrdersProcessor", () => {
  it("looks only at orders that have been paid for and left waiting", async () => {
    const { service, prisma } = build([]);
    await service.sweep();

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("PAID");
    // PROCESSING is deliberately absent: by then the request may already have reached the
    // operator, and re-queueing it could top the customer up twice.
    expect(JSON.stringify(where)).not.toContain("PROCESSING");
    expect(where.paidAt.lt).toBeInstanceOf(Date);
    expect(where.paidAt.lt.getTime()).toBeLessThan(Date.now());
  });

  it("creates the missing job row and re-queues under the order's own id", async () => {
    // The crash this recovers from: the order was claimed PAID and the process died before the
    // TopupJob row existed. Nothing was sent, so this is safe to complete.
    const { service, prisma, queue } = build([{ id: "ord_1" }]);

    expect(await service.sweep()).toBe(1);
    expect(prisma.topupJob.create).toHaveBeenCalledWith({
      data: { orderId: "ord_1", status: "QUEUED" },
    });
    // jobId is the order id: BullMQ refuses a second message under an id that already exists, so
    // a sweep racing the original enqueue -- or the other node's sweep -- cannot double-process.
    expect(queue.add).toHaveBeenCalledWith(
      "process-topup",
      { orderId: "ord_1" },
      expect.objectContaining({ jobId: "ord_1" }),
    );
  });

  it("re-queues an order whose job row already exists", async () => {
    // The other crash: the row was written and the queue message never was. The duplicate-key
    // error is the expected outcome here, not a failure, and the enqueue must still happen --
    // treating it as an error would abandon exactly the order this exists to rescue.
    const { service, queue } = build([{ id: "ord_2" }], { createThrows: duplicate });

    expect(await service.sweep()).toBe(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("gives up on a real database error instead of pretending it recovered", async () => {
    const { service, queue } = build([{ id: "ord_3" }], { createThrows: new Error("connection lost") });

    expect(await service.sweep()).toBe(0);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("does nothing at all when there is nothing stranded", async () => {
    const { service, queue, prisma } = build([]);

    expect(await service.sweep()).toBe(0);
    expect(prisma.topupJob.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
