import { AdminStatsService } from "./admin-stats.service";

function makeService(row: Record<string, unknown> | undefined, newCurrent: number, newPrevious: number) {
  const queryRaw = jest.fn().mockResolvedValue(row ? [row] : []);
  const count = jest.fn().mockResolvedValueOnce(newCurrent).mockResolvedValueOnce(newPrevious);
  const prisma = { $queryRaw: queryRaw, user: { count } };
  const service = new AdminStatsService(prisma as never, {} as never);
  return { service, queryRaw, count };
}

describe("AdminStatsService.getPeriodComparison", () => {
  it("maps both windows and converts bigint counts", async () => {
    const { service } = makeService(
      { curOrders: 12n, prevOrders: 8n, curCompleted: 10n, prevCompleted: 5n, curVolume: 450.5, prevVolume: 300 },
      4,
      2,
    );
    await expect(service.getPeriodComparison(7)).resolves.toEqual({
      days: 7,
      current: { orders: 12, completedOrders: 10, volumeTmt: 450.5, newCustomers: 4 },
      previous: { orders: 8, completedOrders: 5, volumeTmt: 300, newCustomers: 2 },
    });
  });

  it("measures two windows of equal length that meet exactly", async () => {
    const { service, count } = makeService(undefined, 0, 0);
    await service.getPeriodComparison(30);
    const current = count.mock.calls[0][0].where.createdAt;
    const previous = count.mock.calls[1][0].where.createdAt;
    expect(previous.lt).toEqual(current.gte);
    expect(current.lt.getTime() - current.gte.getTime()).toBe(30 * 86_400_000);
    expect(previous.lt.getTime() - previous.gte.getTime()).toBe(30 * 86_400_000);
  });

  it("treats an empty table as zeros and clamps the period", async () => {
    const { service } = makeService(undefined, 0, 0);
    const result = await service.getPeriodComparison(10_000);
    expect(result.days).toBe(365);
    expect(result.current).toEqual({ orders: 0, completedOrders: 0, volumeTmt: 0, newCustomers: 0 });
  });
});

function makeEconomicsService(overrides: {
  topupRows?: Array<Record<string, unknown>>;
  purchaseRow?: Record<string, unknown>;
  galleryGrossSum?: number | null;
  adDebitsSum?: number | null;
  platformFeesSum?: number | null;
  cargoSum?: number | null;
  cargoCount?: number;
  referralSum?: number | null;
  referralCount?: number;
  sellerFloatSum?: number | null;
} = {}) {
  const queryRaw = jest
    .fn()
    .mockResolvedValueOnce(overrides.topupRows ?? [])
    .mockResolvedValueOnce([overrides.purchaseRow ?? { count: 0n, serviceFeesTmt: 0, shippingTmt: 0 }]);
  const galleryOrderAggregate = jest.fn().mockResolvedValue({ _sum: { amountTmt: overrides.galleryGrossSum ?? 0 } });
  const sellerLedgerAggregate = jest
    .fn()
    .mockResolvedValueOnce({ _sum: { amountTmt: overrides.adDebitsSum ?? 0 } })
    .mockResolvedValueOnce({ _sum: { amountTmt: overrides.platformFeesSum ?? 0 } });
  const shipmentAggregate = jest
    .fn()
    .mockResolvedValue({ _sum: { totalPriceTmt: overrides.cargoSum ?? 0 }, _count: { _all: overrides.cargoCount ?? 0 } });
  const referralAggregate = jest
    .fn()
    .mockResolvedValue({ _sum: { rewardAmountTmt: overrides.referralSum ?? 0 }, _count: { _all: overrides.referralCount ?? 0 } });
  const sellerAggregate = jest.fn().mockResolvedValue({ _sum: { balanceTmt: overrides.sellerFloatSum ?? 0 } });

  const prisma = {
    $queryRaw: queryRaw,
    galleryOrder: { aggregate: galleryOrderAggregate },
    sellerLedgerEntry: { aggregate: sellerLedgerAggregate },
    shipment: { aggregate: shipmentAggregate },
    referral: { aggregate: referralAggregate },
    seller: { aggregate: sellerAggregate },
  };
  const service = new AdminStatsService(prisma as never, {} as never);
  return { service, prisma };
}

describe("AdminStatsService.getEconomics", () => {
  it("clamps the window the same way every other stat on this service does", async () => {
    await expect(makeEconomicsService().service.getEconomics(10_000)).resolves.toMatchObject({ days: 365 });
    await expect(makeEconomicsService().service.getEconomics(-5)).resolves.toMatchObject({ days: 1 });
  });

  it("shapes every stream with field names that say what they are", async () => {
    const { service } = makeEconomicsService({
      topupRows: [{ serviceCode: "TMCELL", currency: "USD", count: 3n, gmvTmt: 300, feesTmt: 9, avgAmountTmt: 100, costedCount: 2n, costedGmvTmt: 200, costTmt: 195 }],
      purchaseRow: { count: 2n, serviceFeesTmt: 40, shippingTmt: 15 },
      galleryGrossSum: 500,
      adDebitsSum: -80, // ledger debits are negative -- revenue is the negation
      platformFeesSum: -25,
      cargoSum: 640,
      cargoCount: 4,
      referralSum: 60,
      referralCount: 3,
      sellerFloatSum: 12_000,
    });

    await expect(service.getEconomics(7)).resolves.toEqual({
      days: 7,
      topups: [{ serviceCode: "TMCELL", currency: "USD", count: 3, gmvTmt: 300, feesTmt: 9, avgAmountTmt: 100, costedCount: 2, costedGmvTmt: 200, costTmt: 195 }],
      gallery: { grossSalesTmt: 500, adRevenueTmt: 80, platformFeeTmt: 25 },
      marketplacePurchases: { count: 2, serviceFeesTmt: 40, shippingTmt: 15 },
      cargo: { count: 4, tariffRevenueTmt: 640 },
      referralCost: { count: 3, costTmt: 60 },
      sellerFloat: { owedTmt: 12_000 },
    });
  });

  it("a never-set take rate reports a 0 platform fee, not an absence of the field", async () => {
    const { service } = makeEconomicsService();
    const result = await service.getEconomics(30);
    expect(result.gallery.platformFeeTmt).toBe(0);
  });

  it("sellerFloat is not windowed: the aggregate carries no date filter", async () => {
    const { service, prisma } = makeEconomicsService();
    await service.getEconomics(30);
    expect(prisma.seller.aggregate).toHaveBeenCalledWith({ _sum: { balanceTmt: true } });
  });

  it("excludes draft/quote-only and cancelled shipments from cargo tariff revenue", async () => {
    const { service, prisma } = makeEconomicsService();
    await service.getEconomics(30);
    const where = (prisma.shipment.aggregate as jest.Mock).mock.calls[0][0].where;
    expect(where.status.notIn).toEqual(expect.arrayContaining(["DRAFT", "QUOTE_CREATED", "CANCELLED"]));
    expect(where.paidAt.gte).toBeInstanceOf(Date);
  });
});
