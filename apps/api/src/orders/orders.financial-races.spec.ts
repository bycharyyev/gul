import { BadRequestException } from "@nestjs/common";
import { OrdersService } from "./orders.service";

function serviceWith(prisma: Record<string, unknown>, referrals: Record<string, unknown> = {}) {
  return new OrdersService(
    prisma as never,
    {} as never,
    { record: jest.fn() } as never,
    {} as never,
    referrals as never,
    {} as never,
    { notifyAdmin: jest.fn() } as never,
  );
}

describe("OrdersService financial transaction boundaries", () => {
  it("runs referral debit through the same transaction client as order and outbox", async () => {
    const tx = {
      order: { create: jest.fn().mockResolvedValue({ id: "o1" }) },
      user: {},
    };
    const prisma = {
      service: {
        findUnique: jest.fn().mockResolvedValue({
          id: "s1",
          isEnabled: true,
          minAmountTmt: 1,
          maxAmountTmt: 100,
          validationRegex: null,
        }),
      },
      rate: { findUnique: jest.fn().mockResolvedValue({ enabled: true, rate: 1 }) },
      paymentMethod: { findUnique: jest.fn().mockResolvedValue({ isEnabled: true, feePercent: 0 }) },
      serviceCost: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const referrals = {
      applyReferralDiscount: jest.fn().mockResolvedValue({ amountAfterDiscount: 8, discountApplied: 2 }),
    };
    const service = serviceWith(prisma, referrals);

    await service.create(
      { userId: "u1" },
      { serviceId: "s1", paymentMethodId: "pm1", recipientIdentifier: "x", amountTmt: 10, currency: "RUB" } as never,
    );

    expect(referrals.applyReferralDiscount).toHaveBeenCalledWith("u1", 10, tx);
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ referralDiscountTmt: 2, amountCharged: 8 }) }),
    );
  });

  describe("cost basis snapshot (E-01)", () => {
    function setup(serviceCost: { costPercent: number } | null) {
      const tx = {
        order: { create: jest.fn().mockResolvedValue({ id: "o1" }) },
        orderCost: { create: jest.fn() },
      };
      const prisma = {
        service: {
          findUnique: jest.fn().mockResolvedValue({
            id: "s1",
            isEnabled: true,
            minAmountTmt: 1,
            maxAmountTmt: 1000,
            validationRegex: null,
          }),
        },
        rate: { findUnique: jest.fn().mockResolvedValue({ enabled: true, rate: 1 }) },
        paymentMethod: { findUnique: jest.fn().mockResolvedValue({ isEnabled: true, feePercent: 0 }) },
        serviceCost: { findUnique: jest.fn().mockResolvedValue(serviceCost) },
        $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      };
      const service = serviceWith(prisma, {
        applyReferralDiscount: jest.fn().mockResolvedValue({ amountAfterDiscount: 0, discountApplied: 0 }),
      });
      const create = (amountTmt: number) =>
        service.create(
          { apiKeyId: "k1" },
          { serviceId: "s1", paymentMethodId: "pm1", recipientIdentifier: "x", amountTmt, currency: "TMT" } as never,
        );
      return { tx, create };
    }

    it("freezes the service's cost percentage and the cost in TMT onto the order, in the same transaction", async () => {
      const { tx, create } = setup({ costPercent: 97.5 });
      await create(12.34);
      // 12.34 x 97.5% = 12.0315 -> 12.03, rounded once to cents.
      expect(tx.orderCost.create).toHaveBeenCalledWith({
        data: { orderId: "o1", costPercent: 97.5, costTmt: 12.03 },
      });
    });

    it("records nothing when no cost is set -- unknown, not zero", async () => {
      const { tx, create } = setup(null);
      await create(50);
      expect(tx.orderCost.create).not.toHaveBeenCalled();
    });
  });

  it("rejects editing once any payment exists while holding the order lock", async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      order: { findUnique: jest.fn().mockResolvedValue({ id: "o1", status: "PENDING_PAYMENT" }) },
      paymentInitiationGuard: { findUnique: jest.fn().mockResolvedValue(null) },
      payment: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
    };
    const prisma = { $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)) };

    await expect(serviceWith(prisma).updateDetailsAdmin("o1", { amountTmt: 20 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
