import { BadRequestException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ReferralsService } from "./referrals.service";

function makePrismaMock() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    seller: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    referralSettings: {
      upsert: jest.fn(),
    },
    referral: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
    // Referral codes come from a Postgres sequence, which Prisma only reaches through raw SQL.
    $queryRawUnsafe: jest.fn(),
  };
  // Executes the callback (or array) form with `prisma` itself standing in as `tx`, since the
  // mock methods are the same either way -- lets tests that go through $transaction assert on
  // the same jest.fn()s without needing a separate tx double.
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : arg,
  );
  return prisma;
}

describe("ReferralsService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: ReferralsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    const auditLog = { record: jest.fn() };
    service = new ReferralsService(prisma as never, auditLog as never, { record: jest.fn() } as never);
  });

  describe("changeUsername", () => {
    it("rejects a username that collides with another user's username", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ username: "1000" })
        .mockResolvedValueOnce({ id: "other-user" });

      await expect(service.changeUsername("user-1", "taken")).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("rejects a username that collides with an existing seller handle", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ username: "1000" })
        .mockResolvedValueOnce(null);
      prisma.seller.findUnique.mockResolvedValue({ id: "seller-1", handle: "shopname" });

      await expect(service.changeUsername("user-1", "shopname")).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("allows keeping your own current username (self-collision is not a conflict)", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ username: "myname" })
        .mockResolvedValueOnce({ id: "user-1" });
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: "user-1", username: "myname" });

      await service.changeUsername("user-1", "myname");
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { username: "myname" },
      });
    });

    it("rejects an invalid format (uppercase, too short, disallowed characters)", async () => {
      await expect(service.changeUsername("user-1", "A")).rejects.toThrow(BadRequestException);
      await expect(service.changeUsername("user-1", "has space")).rejects.toThrow(BadRequestException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("lowercases and trims before checking/storing", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ username: "1000" })
        .mockResolvedValueOnce(null);
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.update.mockResolvedValue({ id: "user-1", username: "newname" });

      await service.changeUsername("user-1", "  NewName  ");
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { username: "newname" } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: { username: "newname" },
      });
    });

    it("falls back to a 409 if a concurrent change wins the race past the pre-checks", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ username: "1000" })
        .mockResolvedValueOnce(null);
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "6.19.3",
        }),
      );

      await expect(service.changeUsername("user-1", "raceduser")).rejects.toThrow(ConflictException);
    });
  });

  describe("generateUsername", () => {
    it("issues the next number from the sequence", async () => {
      prisma.$queryRawUnsafe.mockResolvedValueOnce([{ value: BigInt(1000) }]);
      prisma.user.findUnique.mockResolvedValueOnce(null);
      prisma.seller.findUnique.mockResolvedValueOnce(null);

      expect(await service.generateUsername()).toBe("1000");
    });

    it("draws again when a number is already taken by a hand-set code", async () => {
      // Staff can give a partner any code that fits the pattern, including a number the sequence
      // has not reached. Without this retry that account would break the next registration.
      prisma.$queryRawUnsafe
        .mockResolvedValueOnce([{ value: BigInt(1007) }])
        .mockResolvedValueOnce([{ value: BigInt(1008) }]);
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: "partner-with-a-vanity-number" })
        .mockResolvedValueOnce(null);
      prisma.seller.findUnique.mockResolvedValueOnce(null);

      expect(await service.generateUsername()).toBe("1008");
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
    });
  });

  describe("applyReferralDiscount", () => {
    it("caps the discount at the available balance, not the requested amount", async () => {
      prisma.user.findUnique.mockResolvedValue({ referralBalanceTmt: 15 });
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.applyReferralDiscount("user-1", 100);

      expect(result).toEqual({ amountAfterDiscount: 85, discountApplied: 15 });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: "user-1", referralBalanceTmt: { gte: 15 } },
        data: { referralBalanceTmt: { decrement: 15 } },
      });
    });

    it("is a no-op when the balance is zero", async () => {
      prisma.user.findUnique.mockResolvedValue({ referralBalanceTmt: 0 });

      const result = await service.applyReferralDiscount("user-1", 100);

      expect(result).toEqual({ amountAfterDiscount: 100, discountApplied: 0 });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it("does not apply the discount if a concurrent request already spent the balance", async () => {
      prisma.user.findUnique.mockResolvedValue({ referralBalanceTmt: 15 });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.applyReferralDiscount("user-1", 100);

      expect(result).toEqual({ amountAfterDiscount: 100, discountApplied: 0 });
    });
  });

  const baseSettings = {
    id: "singleton",
    customerRewardTmt: 0,
    sellerRewardTmt: 0,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };

  describe("recordReferral", () => {
    it("never blocks on a self-referral", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: true });
      prisma.user.findUnique.mockResolvedValue({ id: "user-1" });
      prisma.seller.findUnique.mockResolvedValue(null);

      await service.recordReferral("user-1", "user-1-own-code");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("records the invitation even while the program is switched off", async () => {
      // The regression this guards: attribution used to be gated on `enabled`, so an invitation
      // accepted while the programme was off was thrown away rather than left unpaid -- and
      // switching the programme on later could not recover a single one of them.
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: false });
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: "referrer-9" });

      await service.recordReferral("user-2", "1000");
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it("still does nothing for a code nobody holds", async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(null);

      await service.recordReferral("user-2", "not-a-real-code");
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("stores attribution captured on the /r/<code> link on the Referral row", async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: "referrer-9" });

      await service.recordReferral("user-2", "1000", {
        utmSource: "instagram",
        utmMedium: "social",
        utmCampaign: "launch2026",
        referrerUrl: "https://instagram.com/gulyaly",
      });

      expect(prisma.referral.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            utmSource: "instagram",
            utmMedium: "social",
            utmCampaign: "launch2026",
            referrerUrl: "https://instagram.com/gulyaly",
          }),
        }),
      );
    });

    it("leaves attribution fields undefined for a code typed in directly", async () => {
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: "referrer-9" });

      await service.recordReferral("user-2", "1000");

      expect(prisma.referral.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            utmSource: undefined,
            utmMedium: undefined,
            utmCampaign: undefined,
            referrerUrl: undefined,
          }),
        }),
      );
    });
  });

  describe("maybeRewardReferral", () => {
    const pendingCustomerReferral = {
      id: "referral-1",
      referrerType: "CUSTOMER" as const,
      referrerUserId: "referrer-1",
      referrerSellerId: null,
      refereeUserId: "referee-1",
      status: "PENDING" as const,
    };

    it("credits the referrer's balance and marks the referral REWARDED", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: true, customerRewardTmt: 5 });
      prisma.referral.findUnique.mockResolvedValue(pendingCustomerReferral);
      prisma.referral.updateMany.mockResolvedValue({ count: 1 });

      await service.maybeRewardReferral("referee-1", "order-1");

      expect(prisma.referral.updateMany).toHaveBeenCalledWith({
        where: { id: "referral-1", status: "PENDING" },
        data: { status: "REWARDED", rewardAmountTmt: 5, rewardedAt: expect.any(Date), qualifyingOrderId: "order-1" },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "referrer-1" },
        data: { referralBalanceTmt: { increment: 5 } },
      });
    });

    it("credits a seller referrer's payout balance instead of a user's referral balance", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: true, sellerRewardTmt: 7 });
      prisma.referral.findUnique.mockResolvedValue({
        ...pendingCustomerReferral,
        referrerType: "SELLER",
        referrerUserId: null,
        referrerSellerId: "seller-1",
      });
      prisma.referral.updateMany.mockResolvedValue({ count: 1 });

      await service.maybeRewardReferral("referee-1", "order-1");

      expect(prisma.seller.update).toHaveBeenCalledWith({
        where: { id: "seller-1" },
        data: { balanceTmt: { increment: 7 } },
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("does not double-credit when a concurrent call already claimed the PENDING -> REWARDED transition", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: true, customerRewardTmt: 5 });
      prisma.referral.findUnique.mockResolvedValue(pendingCustomerReferral);
      // Simulates the race: another call's updateMany already won, so this one claims 0 rows.
      prisma.referral.updateMany.mockResolvedValue({ count: 0 });

      await service.maybeRewardReferral("referee-1", "order-1");

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.seller.update).not.toHaveBeenCalled();
    });

    it("is a no-op when the referral is already REWARDED", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: true, customerRewardTmt: 5 });
      prisma.referral.findUnique.mockResolvedValue({ ...pendingCustomerReferral, status: "REWARDED" });

      await service.maybeRewardReferral("referee-1", "order-1");

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("is a no-op when the referee has no referral at all", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: true, customerRewardTmt: 5 });
      prisma.referral.findUnique.mockResolvedValue(null);

      await service.maybeRewardReferral("referee-1", "order-1");

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("is a no-op when the program is disabled", async () => {
      prisma.referralSettings.upsert.mockResolvedValue({ ...baseSettings, enabled: false });

      await service.maybeRewardReferral("referee-1", "order-1");

      expect(prisma.referral.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
