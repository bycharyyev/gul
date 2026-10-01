import { MarketplaceSettingsService } from "./marketplace-settings.service";

// What a fresh row holds: the column defaults, which equal the constants these settings replaced.
const AD_DEFAULTS = { storyAdPriceTmt: "50", storyAdDurationDays: 3, slideAdPriceTmt: "200", slideAdDurationDays: 3 };

function makeService(row: { id: string; takeRatePercent: unknown; updatedAt: Date } & Record<string, unknown>) {
  const upsert = jest.fn().mockResolvedValue({ ...AD_DEFAULTS, ...row });
  const prisma = { marketplaceSettings: { upsert } };
  const auditLog = { record: jest.fn() };
  const service = new MarketplaceSettingsService(prisma as never, auditLog as never);
  return { service, upsert, auditLog };
}

describe("MarketplaceSettingsService", () => {
  it("defaults to 0% and normalizes the Decimal to a number", async () => {
    const updatedAt = new Date("2026-09-01T00:00:00Z");
    const { service, upsert } = makeService({ id: "singleton", takeRatePercent: "0", updatedAt });

    await expect(service.getSettings()).resolves.toEqual({
      id: "singleton",
      takeRatePercent: 0,
      storyAdPriceTmt: 50,
      storyAdDurationDays: 3,
      slideAdPriceTmt: 200,
      slideAdDurationDays: 3,
      updatedAt: updatedAt.toISOString(),
    });
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton" },
      update: {},
    });
  });

  it("updates the rate and audits the change", async () => {
    const updatedAt = new Date("2026-09-02T00:00:00Z");
    const { service, upsert, auditLog } = makeService({ id: "singleton", takeRatePercent: "7.5", updatedAt });

    const result = await service.updateSettings({ takeRatePercent: 7.5 }, "admin-1");

    expect(result.takeRatePercent).toBe(7.5);
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", takeRatePercent: 7.5 },
      update: { takeRatePercent: 7.5 },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      "admin-1",
      "marketplace-settings.update",
      "MarketplaceSettings",
      "singleton",
      { takeRatePercent: 7.5 },
    );
  });

  it("getCurrentTakeRatePercent returns the same number getSettings would, for GalleryService to snapshot", async () => {
    const { service } = makeService({ id: "singleton", takeRatePercent: "12.5", updatedAt: new Date() });
    await expect(service.getCurrentTakeRatePercent()).resolves.toBe(12.5);
  });

  it("getAdPricing returns the configured price and run length per placement, as numbers", async () => {
    const { service } = makeService({
      id: "singleton",
      takeRatePercent: "0",
      updatedAt: new Date(),
      storyAdPriceTmt: "75.5",
      storyAdDurationDays: 5,
      slideAdPriceTmt: "320",
      slideAdDurationDays: 7,
    });
    await expect(service.getAdPricing("story")).resolves.toEqual({ priceTmt: 75.5, durationDays: 5 });
    await expect(service.getAdPricing("slide")).resolves.toEqual({ priceTmt: 320, durationDays: 7 });
  });

  it("updates only the ad pricing fields it is given", async () => {
    const { service, upsert } = makeService({ id: "singleton", takeRatePercent: "5", updatedAt: new Date() });
    await service.updateSettings({ slideAdPriceTmt: 250 }, "admin-1");
    expect(upsert).toHaveBeenCalledWith({
      where: { id: "singleton" },
      create: { id: "singleton", slideAdPriceTmt: 250 },
      update: { slideAdPriceTmt: 250 },
    });
  });
});
