import { CatalogService } from "./catalog.service";

function setup(method: { id: string; provider: string } | null) {
  const prisma = {
    paymentMethod: {
      findUnique: jest.fn().mockResolvedValue(method),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...method, ...data })),
    },
  };
  const auditLog = { record: jest.fn() };
  return { catalog: new CatalogService(prisma as never, auditLog as never), prisma, auditLog };
}

describe("CatalogService.setPaymentMethodEnabled", () => {
  it("enables a method whose provider is registered, and audits it", async () => {
    const { catalog, prisma, auditLog } = setup({ id: "pm1", provider: "freekassa" });
    await catalog.setPaymentMethodEnabled("pm1", true, "admin-1", () => true);
    expect(prisma.paymentMethod.update).toHaveBeenCalledWith({ where: { id: "pm1" }, data: { isEnabled: true } });
    expect(auditLog.record).toHaveBeenCalledWith("admin-1", "payment-method.set-enabled", "PaymentMethod", "pm1", {
      isEnabled: true,
      provider: "freekassa",
    });
  });

  it("refuses to enable a method whose adapter is not configured (checkout would fail)", async () => {
    const { catalog, prisma } = setup({ id: "pm1", provider: "freekassa" });
    await expect(catalog.setPaymentMethodEnabled("pm1", true, "admin-1", () => false)).rejects.toThrow(
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
    );
    expect(prisma.paymentMethod.update).not.toHaveBeenCalled();
  });

  it("always allows switching a method off", async () => {
    const { catalog, prisma } = setup({ id: "pm1", provider: "freekassa" });
    await catalog.setPaymentMethodEnabled("pm1", false, "admin-1", () => false);
    expect(prisma.paymentMethod.update).toHaveBeenCalled();
  });

  it("404s an unknown method", async () => {
    const { catalog } = setup(null);
    await expect(catalog.setPaymentMethodEnabled("x", true, "a", () => true)).rejects.toThrow("Payment method not found");
  });
});
