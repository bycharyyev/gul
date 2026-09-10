import { EmailOutboxService } from "./email-outbox.service";

function makePrisma(claimed: unknown[] = []) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(claimed),
    emailOutbox: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function makeEmail() {
  return {
    sendOrderCreated: jest.fn().mockResolvedValue(undefined),
    sendOrderStatusUpdate: jest.fn().mockResolvedValue(undefined),
  };
}

describe("EmailOutboxService", () => {
  describe("record", () => {
    it("writes through the caller's transaction client, not its own connection", async () => {
      const prisma = makePrisma();
      const service = new EmailOutboxService(prisma as never, makeEmail() as never);
      const tx = { emailOutbox: { createMany: jest.fn().mockResolvedValue({ count: 1 }) } };

      await service.record(tx as never, {
        kind: "ORDER_CREATED",
        orderId: "o1",
        idempotencyKey: "order:o1:ORDER_CREATED",
      });

      // The whole point of the pattern: the row must commit with the business change, so it
      // must never be written via this.prisma.
      expect(tx.emailOutbox.createMany).toHaveBeenCalled();
      expect(prisma.emailOutbox.createMany).not.toHaveBeenCalled();
    });

    it("ignores a duplicate key, so a replayed event records the obligation once", async () => {
      const service = new EmailOutboxService(makePrisma() as never, makeEmail() as never);
      const tx = { emailOutbox: { createMany: jest.fn().mockResolvedValue({ count: 0 }) } };

      await service.record(tx as never, { kind: "ORDER_CREATED", orderId: "o1", idempotencyKey: "k" });

      expect(tx.emailOutbox.createMany).toHaveBeenCalledWith(
        expect.objectContaining({ skipDuplicates: true }),
      );
    });
  });

  describe("dispatchPending", () => {
    it("claims rows with SKIP LOCKED so two hosts take disjoint batches", async () => {
      const prisma = makePrisma([]);
      const service = new EmailOutboxService(prisma as never, makeEmail() as never);

      await service.dispatchPending();

      // A tagged template passes the TemplateStringsArray itself as the first argument.
      const sql = (prisma.$queryRaw.mock.calls[0][0] as unknown as string[]).join("");
      expect(sql).toContain("FOR UPDATE SKIP LOCKED");
      expect(sql).toContain("DISPATCHING");
    });

    it("dispatches an ORDER_CREATED row and marks it DISPATCHED", async () => {
      const prisma = makePrisma([
        { id: "ob1", kind: "ORDER_CREATED", orderId: "o1", idempotencyKey: "k", attempts: 1 },
      ]);
      const email = makeEmail();
      const service = new EmailOutboxService(prisma as never, email as never);

      expect(await service.dispatchPending()).toBe(1);
      expect(email.sendOrderCreated).toHaveBeenCalledWith("o1");
      expect(prisma.emailOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "DISPATCHED" }) }),
      );
    });

    it("routes a completed order to the status-update path", async () => {
      const prisma = makePrisma([
        { id: "ob2", kind: "ORDER_COMPLETED", orderId: "o2", idempotencyKey: "k2", attempts: 1 },
      ]);
      const email = makeEmail();
      const service = new EmailOutboxService(prisma as never, email as never);

      await service.dispatchPending();
      expect(email.sendOrderStatusUpdate).toHaveBeenCalledWith("o2");
    });

    it("returns a failed row to PENDING so the next pass retries it", async () => {
      const prisma = makePrisma([
        { id: "ob3", kind: "ORDER_CREATED", orderId: "o3", idempotencyKey: "k3", attempts: 1 },
      ]);
      const email = makeEmail();
      email.sendOrderCreated.mockRejectedValue(new Error("db down"));
      const service = new EmailOutboxService(prisma as never, email as never);

      await service.dispatchPending();
      expect(prisma.emailOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PENDING", lastError: "db down" }),
        }),
      );
    });

    it("stops retrying once attempts are exhausted, leaving the row visible as FAILED", async () => {
      const prisma = makePrisma([
        { id: "ob4", kind: "ORDER_CREATED", orderId: "o4", idempotencyKey: "k4", attempts: 5 },
      ]);
      const email = makeEmail();
      email.sendOrderCreated.mockRejectedValue(new Error("still broken"));
      const service = new EmailOutboxService(prisma as never, email as never);

      await service.dispatchPending();
      expect(prisma.emailOutbox.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
      );
    });

    it("one bad row does not stop the rest of the batch", async () => {
      const prisma = makePrisma([
        { id: "a", kind: "ORDER_CREATED", orderId: "o1", idempotencyKey: "k1", attempts: 1 },
        { id: "b", kind: "ORDER_CREATED", orderId: "o2", idempotencyKey: "k2", attempts: 1 },
      ]);
      const email = makeEmail();
      email.sendOrderCreated.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(undefined);
      const service = new EmailOutboxService(prisma as never, email as never);

      expect(await service.dispatchPending()).toBe(2);
      expect(email.sendOrderCreated).toHaveBeenCalledTimes(2);
    });
  });
});
