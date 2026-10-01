import { NotFoundException } from "@nestjs/common";
import { CatalogService } from "./catalog.service";

function setup(service: { id: string } | null = { id: "s1" }) {
  const prisma = {
    service: {
      findUnique: jest.fn().mockResolvedValue(service),
      findMany: jest.fn().mockResolvedValue([
        { id: "s1", code: "TMCELL", name: "TMCELL", cost: { costPercent: "97.50", updatedAt: new Date("2026-10-01T00:00:00Z") } },
        { id: "s2", code: "BELET", name: "Belet", cost: null },
      ]),
    },
    serviceCost: { upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const auditLog = { record: jest.fn() };
  return { catalog: new CatalogService(prisma as never, auditLog as never), prisma, auditLog };
}

describe("CatalogService cost basis (E-01)", () => {
  it("lists every service with its cost as a number, or null where none is set", async () => {
    const { catalog } = setup();
    await expect(catalog.listServiceCosts()).resolves.toEqual([
      { serviceId: "s1", code: "TMCELL", name: "TMCELL", costPercent: 97.5, updatedAt: "2026-10-01T00:00:00.000Z" },
      { serviceId: "s2", code: "BELET", name: "Belet", costPercent: null, updatedAt: null },
    ]);
  });

  it("sets a cost and audits who changed it", async () => {
    const { catalog, prisma, auditLog } = setup();
    await catalog.setServiceCost("s1", 96, "admin-1");
    expect(prisma.serviceCost.upsert).toHaveBeenCalledWith({
      where: { serviceId: "s1" },
      create: { serviceId: "s1", costPercent: 96, updatedById: "admin-1" },
      update: { costPercent: 96, updatedById: "admin-1" },
    });
    expect(auditLog.record).toHaveBeenCalledWith("admin-1", "service-cost.set", "Service", "s1", { costPercent: 96 });
  });

  it("clears a cost with null, so new orders carry no cost basis rather than a false zero", async () => {
    const { catalog, prisma } = setup();
    await catalog.setServiceCost("s1", null, "admin-1");
    expect(prisma.serviceCost.deleteMany).toHaveBeenCalledWith({ where: { serviceId: "s1" } });
    expect(prisma.serviceCost.upsert).not.toHaveBeenCalled();
  });

  it("refuses an unknown service", async () => {
    const { catalog } = setup(null);
    await expect(catalog.setServiceCost("nope", 90, "admin-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});
