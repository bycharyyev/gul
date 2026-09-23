import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { WithdrawalsService } from "./withdrawals.service";

describe("WithdrawalsService ledger integration", () => {
  function setup(txOverrides: Record<string, unknown> = {}) {
    const tx = {
      seller: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      withdrawalRequest: {
        create: jest.fn().mockResolvedValue({ id: "w1", sellerId: "s1", amountTmt: new Prisma.Decimal(25) }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "w1", status: "REJECTED" }),
      },
      ...txOverrides,
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
      withdrawalRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: "w1",
          sellerId: "s1",
          amountTmt: new Prisma.Decimal(25),
          status: "PENDING",
        }),
      },
    };
    const ledger = { record: jest.fn().mockResolvedValue({ id: "l1" }) };
    const service = new WithdrawalsService(
      prisma as never,
      { requireSellerId: jest.fn().mockResolvedValue("s1") } as never,
      { notifySeller: jest.fn() } as never,
      { sendSellerPayout: jest.fn() } as never,
      { record: jest.fn() } as never,
      ledger as never,
    );
    return { service, prisma, tx, ledger };
  }

  it("reserves the balance and appends the debit in the same transaction", async () => {
    const { service, prisma, tx, ledger } = setup();

    await service.createRequest("u1", { amountTmt: 25, payoutDetails: "card" });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.seller.updateMany).toHaveBeenCalledWith({
      where: { id: "s1", balanceTmt: { gte: 25 } },
      data: { balanceTmt: { decrement: 25 } },
    });
    expect(ledger.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        sellerId: "s1",
        type: "WITHDRAWAL_RESERVE",
        amountTmt: -25,
        idempotencyKey: "withdrawal:w1:reserve",
      }),
    );
  });

  it("does not create a withdrawal or ledger entry when funds are insufficient", async () => {
    const { service, tx, ledger } = setup();
    tx.seller.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.createRequest("u1", { amountTmt: 25, payoutDetails: "card" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.withdrawalRequest.create).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it("refunds a rejected request and appends the credit in the same transaction", async () => {
    const { service, prisma, tx, ledger } = setup();

    await service.rejectRequest("w1", { note: "invalid details" }, "admin1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.seller.update).toHaveBeenCalledWith({
      where: { id: "s1" },
      data: { balanceTmt: { increment: new Prisma.Decimal(25) } },
    });
    expect(ledger.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        sellerId: "s1",
        type: "WITHDRAWAL_REFUND",
        amountTmt: new Prisma.Decimal(25),
        idempotencyKey: "withdrawal:w1:refund",
      }),
    );
  });
});
