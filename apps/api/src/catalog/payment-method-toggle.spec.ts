import { CatalogService } from "./catalog.service";

type Method = { id: string; code?: string; provider: string; isEnabled: boolean; name?: string; feePercent?: number; sortOrder?: number };

function setup(method: Method | null, codeTaken = false) {
  const prisma = {
    paymentMethod: {
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve(where.code ? (codeTaken ? { id: "other" } : null) : method),
      ),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...method, ...data })),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "new", ...data })),
    },
  };
  const auditLog = { record: jest.fn() };
  return { catalog: new CatalogService(prisma as never, auditLog as never), prisma, auditLog };
}

const providers = (configured: string[], known = ["manual", "freekassa", "heleket", "cryptocloud"]) => ({
  knows: (k: string) => known.includes(k),
  has: (k: string) => configured.includes(k),
});

describe("CatalogService.updatePaymentMethod", () => {
  const off = { id: "pm1", provider: "freekassa", isEnabled: false, name: "Card", feePercent: 0, sortOrder: 2 };
  const on = { ...off, isEnabled: true };

  it("enables a method whose provider is configured, and audits before/after", async () => {
    const { catalog, prisma, auditLog } = setup(off);
    await catalog.updatePaymentMethod("pm1", { isEnabled: true }, "admin-1", providers(["freekassa"]));
    expect(prisma.paymentMethod.update).toHaveBeenCalledWith({ where: { id: "pm1" }, data: { isEnabled: true } });
    expect(auditLog.record).toHaveBeenCalledWith(
      "admin-1",
      "payment-method.update",
      "PaymentMethod",
      "pm1",
      expect.objectContaining({ changes: { isEnabled: true } }),
    );
  });

  it("refuses to enable a method whose adapter is not configured (checkout would fail)", async () => {
    const { catalog, prisma } = setup(off);
    await expect(catalog.updatePaymentMethod("pm1", { isEnabled: true }, "a", providers([]))).rejects.toThrow(
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
    expect(prisma.paymentMethod.update).not.toHaveBeenCalled();
  });

  it("switches a live method to another configured adapter (crypto backup)", async () => {
    const { catalog, prisma } = setup({ ...on, provider: "heleket" });
    await catalog.updatePaymentMethod("pm1", { provider: "cryptocloud" }, "a", providers(["cryptocloud"]));
    expect(prisma.paymentMethod.update).toHaveBeenCalledWith({ where: { id: "pm1" }, data: { provider: "cryptocloud" } });
  });

  it("refuses to move a live method onto an adapter without keys", async () => {
    const { catalog } = setup({ ...on, provider: "heleket" });
    await expect(
      catalog.updatePaymentMethod("pm1", { provider: "cryptocloud" }, "a", providers(["heleket"])),
    ).rejects.toThrow("PAYMENT_PROVIDER_NOT_CONFIGURED");
  });

  it("refuses an adapter this build does not have", async () => {
    const { catalog } = setup(off);
    await expect(catalog.updatePaymentMethod("pm1", { provider: "stripe" }, "a", providers(["stripe"]))).rejects.toThrow(
      "PAYMENT_PROVIDER_UNKNOWN",
    );
  });

  it("edits name, fee and order without touching the provider check", async () => {
    const { catalog, prisma } = setup({ ...on, provider: "freekassa" });
    await catalog.updatePaymentMethod("pm1", { name: "  Карта  ", feePercent: 2.5, sortOrder: 1 }, "a", providers([]));
    expect(prisma.paymentMethod.update).toHaveBeenCalledWith({
      where: { id: "pm1" },
      data: { name: "Карта", feePercent: 2.5, sortOrder: 1 },
    });
  });

  it("always allows switching a method off", async () => {
    const { catalog, prisma } = setup(on);
    await catalog.updatePaymentMethod("pm1", { isEnabled: false }, "a", providers([]));
    expect(prisma.paymentMethod.update).toHaveBeenCalled();
  });

  it("404s an unknown method", async () => {
    const { catalog } = setup(null);
    await expect(catalog.updatePaymentMethod("x", { isEnabled: true }, "a", providers([]))).rejects.toThrow(
      "Payment method not found",
    );
  });
});

describe("CatalogService.createPaymentMethod", () => {
  it("creates a method for a free code, switched off", async () => {
    const { catalog, prisma } = setup(null);
    await catalog.createPaymentMethod({ code: "SBP", name: "СБП", provider: "freekassa" }, "a", () => true);
    expect(prisma.paymentMethod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ code: "SBP", provider: "freekassa", isEnabled: false }),
    });
  });

  it("refuses a code that already has a method", async () => {
    const { catalog } = setup(null, true);
    await expect(
      catalog.createPaymentMethod({ code: "CRYPTO", name: "x", provider: "heleket" }, "a", () => true),
    ).rejects.toThrow("PAYMENT_METHOD_CODE_TAKEN");
  });
});
