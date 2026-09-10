import { SellerLedgerService } from "./seller-ledger.service";

describe("SellerLedgerService", () => {
  it("writes an immutable entry through the caller's transaction", async () => {
    const create = jest.fn().mockResolvedValue({ id: "entry-1" });
    const service = new SellerLedgerService({} as never);
    const input = {
      sellerId: "seller-1",
      type: "GALLERY_SALE_CREDIT" as const,
      amountTmt: 50,
      referenceType: "GalleryOrder",
      referenceId: "order-1",
      idempotencyKey: "gallery-order:order-1:delivered",
    };

    await service.record({ sellerLedgerEntry: { create } } as never, input);

    expect(create).toHaveBeenCalledWith({ data: input });
  });

  it("reports only cache-versus-ledger differences and normalizes decimals", async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([
        { sellerId: "seller-1", handle: "shop", cachedBalance: "12.50", ledgerBalance: "10.00" },
      ]),
    };
    const service = new SellerLedgerService(prisma as never);

    await expect(service.reconcile()).resolves.toEqual([
      { sellerId: "seller-1", handle: "shop", cachedBalance: 12.5, ledgerBalance: 10, difference: 2.5 },
    ]);
  });
});
