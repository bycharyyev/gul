import { GalleryService } from "./gallery.service";

function makeTxAwarePrisma(overrides: { galleryOrder?: Record<string, unknown> } = {}) {
  const prisma = {
    galleryOrder: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), ...overrides.galleryOrder },
    seller: { update: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
  };
  // Executes the callback form with `prisma` itself standing in as `tx` -- same trick
  // ReferralsService's own spec uses, so ledger/seller calls made inside the transaction are
  // visible on the same jest.fn()s the test asserts against.
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: typeof prisma) => unknown)(prisma) : arg,
  );
  return prisma;
}

function target(
  prisma: unknown,
  ledgerRecord: jest.Mock,
  marketplaceSettings: { getCurrentTakeRatePercent: jest.Mock } = { getCurrentTakeRatePercent: jest.fn() },
) {
  return new GalleryService(
    prisma as never,
    { notifyNewOrder: jest.fn() } as never, // telegramBot
    { notifyAdmin: jest.fn() } as never, // adminTelegramBot -- createOrder always calls this
    { sendSellerNewOrder: jest.fn() } as never, // email
    { record: jest.fn() } as never, // auditLog
    { record: ledgerRecord } as never, // ledger
    marketplaceSettings as never,
  );
}

describe("GalleryService -- marketplace take rate", () => {
  describe("createOrder snapshots the rate", () => {
    it("freezes MarketplaceSettings.takeRatePercent onto the new order at creation time", async () => {
      const getCurrentTakeRatePercent = jest.fn().mockResolvedValue(12.5);
      const create = jest.fn().mockResolvedValue({ id: "order-1", amountTmt: 500 });
      const prisma = {
        // sellerId: null (house product) so createOrder skips the seller notification paths --
        // this test is only about the snapshot, not notifications.
        galleryProduct: {
          findUnique: jest.fn().mockResolvedValue({ id: "p1", isEnabled: true, priceTmt: 500, sellerId: null }),
        },
        galleryOrder: { create },
      };
      const service = target(prisma, jest.fn(), { getCurrentTakeRatePercent });

      await service.createOrder("user-1", {
        productId: "p1",
        recipientName: "A",
        recipientPhone: "+99361234567",
        deliveryCity: "Ashgabat",
        deliveryAddress: "Street 1",
      });

      expect(getCurrentTakeRatePercent).toHaveBeenCalledTimes(1);
      expect(create.mock.calls[0][0].data.takeRatePercentSnapshot).toBe(12.5);
    });

    it("a later settings change never touches an order already created", async () => {
      // The service reads the rate exactly once, at creation -- there is no code path in
      // updateOrderStatus that calls back into MarketplaceSettingsService, so a change to the
      // live setting between creation and delivery cannot affect this order's snapshot.
      const getCurrentTakeRatePercent = jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(20);
      const create = jest.fn().mockResolvedValue({ id: "order-1", amountTmt: 500 });
      const prisma = {
        galleryProduct: {
          findUnique: jest.fn().mockResolvedValue({ id: "p1", isEnabled: true, priceTmt: 500, sellerId: null }),
        },
        galleryOrder: { create },
      };
      const service = target(prisma, jest.fn(), { getCurrentTakeRatePercent });

      await service.createOrder("user-1", {
        productId: "p1",
        recipientName: "A",
        recipientPhone: "+99361234567",
        deliveryCity: "Ashgabat",
        deliveryAddress: "Street 1",
      });

      expect(create.mock.calls[0][0].data.takeRatePercentSnapshot).toBe(5);
    });
  });

  describe("updateOrderStatus -- DELIVERED crediting", () => {
    function deliveredOrder(overrides: Record<string, unknown>) {
      return {
        id: "order-1",
        status: "PROCESSING",
        amountTmt: 1000,
        takeRatePercentSnapshot: null,
        product: { sellerId: "seller-1" },
        ...overrides,
      };
    }

    it("0% (null snapshot) credits the seller the full amount, byte-for-byte as before -- no extra ledger row", async () => {
      const ledgerRecord = jest.fn().mockResolvedValue({});
      const order = deliveredOrder({ takeRatePercentSnapshot: null });
      const prisma = makeTxAwarePrisma({
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "DELIVERED" }),
        },
      });
      const marketplaceSettings = { getCurrentTakeRatePercent: jest.fn() };
      const service = target(prisma, ledgerRecord, marketplaceSettings);

      await service.updateOrderStatus("order-1", "DELIVERED", "actor-1", "staff");

      expect(prisma.seller.update).toHaveBeenCalledWith({
        where: { id: "seller-1" },
        data: { balanceTmt: { increment: 1000 } },
      });
      expect(ledgerRecord).toHaveBeenCalledTimes(1);
      expect(ledgerRecord.mock.calls[0][1]).toMatchObject({ type: "GALLERY_SALE_CREDIT", amountTmt: 1000 });
      expect(marketplaceSettings.getCurrentTakeRatePercent).not.toHaveBeenCalled();
    });

    it("0% explicit (snapshot = 0) behaves identically to a null snapshot", async () => {
      const ledgerRecord = jest.fn().mockResolvedValue({});
      const order = deliveredOrder({ takeRatePercentSnapshot: 0 });
      const prisma = makeTxAwarePrisma({
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "DELIVERED" }),
        },
      });
      const service = target(prisma, ledgerRecord);

      await service.updateOrderStatus("order-1", "DELIVERED", "actor-1", "staff");

      expect(prisma.seller.update).toHaveBeenCalledWith({
        where: { id: "seller-1" },
        data: { balanceTmt: { increment: 1000 } },
      });
      expect(ledgerRecord).toHaveBeenCalledTimes(1);
    });

    it("> 0% splits the sale into a net credit and a platform-fee debit that sum exactly to the gross", async () => {
      const ledgerRecord = jest.fn().mockResolvedValue({});
      const order = deliveredOrder({ amountTmt: 1000, takeRatePercentSnapshot: 10 });
      const prisma = makeTxAwarePrisma({
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "DELIVERED" }),
        },
      });
      const service = target(prisma, ledgerRecord);

      await service.updateOrderStatus("order-1", "DELIVERED", "actor-1", "staff");

      // netToSellerTmt (900) + platformCutTmt (100) === gross (1000).
      expect(prisma.seller.update).toHaveBeenCalledWith({
        where: { id: "seller-1" },
        data: { balanceTmt: { increment: 900 } },
      });
      expect(ledgerRecord).toHaveBeenCalledTimes(2);
      expect(ledgerRecord.mock.calls[0][1]).toMatchObject({
        type: "GALLERY_SALE_CREDIT",
        amountTmt: 1000,
        idempotencyKey: "gallery-order:order-1:delivered",
      });
      expect(ledgerRecord.mock.calls[1][1]).toMatchObject({
        type: "MARKETPLACE_PLATFORM_FEE",
        amountTmt: -100,
        idempotencyKey: "gallery-order:order-1:platform-fee",
      });
      const netCredit = ledgerRecord.mock.calls[0][1].amountTmt;
      const platformDebit = ledgerRecord.mock.calls[1][1].amountTmt;
      expect(netCredit + platformDebit).toBe(900);
    });

    it("rounds the platform cut to 2 decimals and the two legs still sum exactly to the gross", async () => {
      const ledgerRecord = jest.fn().mockResolvedValue({});
      // 99.99 * 10% = 9.999 -> rounds to 10.00; net must be exactly 89.99, not 89.991 or similar.
      const order = deliveredOrder({ amountTmt: 99.99, takeRatePercentSnapshot: 10 });
      const prisma = makeTxAwarePrisma({
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "DELIVERED" }),
        },
      });
      const service = target(prisma, ledgerRecord);

      await service.updateOrderStatus("order-1", "DELIVERED", "actor-1", "staff");

      expect(prisma.seller.update).toHaveBeenCalledWith({
        where: { id: "seller-1" },
        data: { balanceTmt: { increment: 89.99 } },
      });
      expect(ledgerRecord.mock.calls[1][1].amountTmt).toBe(-10);
    });

    it("a house product (no sellerId) gets no seller ledger activity either way", async () => {
      const ledgerRecord = jest.fn();
      const order = deliveredOrder({ takeRatePercentSnapshot: 10, product: { sellerId: null } });
      const prisma = makeTxAwarePrisma({
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "DELIVERED" }),
        },
      });
      const service = target(prisma, ledgerRecord);

      await service.updateOrderStatus("order-1", "DELIVERED", "actor-1", "staff");

      expect(prisma.seller.update).not.toHaveBeenCalled();
      expect(ledgerRecord).not.toHaveBeenCalled();
    });

    it("does not credit twice when the DELIVERED claim is lost to a concurrent call", async () => {
      const ledgerRecord = jest.fn();
      const order = deliveredOrder({ takeRatePercentSnapshot: 10 });
      const prisma = makeTxAwarePrisma({
        galleryOrder: {
          findUnique: jest.fn().mockResolvedValue(order),
          // Someone else's call already moved the status -- this update affects 0 rows.
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          findUniqueOrThrow: jest.fn().mockResolvedValue({ ...order, status: "DELIVERED" }),
        },
      });
      const service = target(prisma, ledgerRecord);

      await service.updateOrderStatus("order-1", "DELIVERED", "actor-1", "staff");

      expect(prisma.seller.update).not.toHaveBeenCalled();
      expect(ledgerRecord).not.toHaveBeenCalled();
    });
  });
});
