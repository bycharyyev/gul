import { MarketplaceSettingsService } from "./marketplace-settings.service";

function makeService(upsertResult: { id: string; takeRatePercent: unknown; updatedAt: Date }) {
  const upsert = jest.fn().mockResolvedValue(upsertResult);
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
});
