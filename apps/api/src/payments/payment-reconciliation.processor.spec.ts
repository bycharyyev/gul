import { PaymentReconciliationProcessor } from "./payment-reconciliation.processor";

describe("PaymentReconciliationProcessor", () => {
  it("runs the provider-neutral stale-payment pass", async () => {
    const payments = { reconcileStale: jest.fn().mockResolvedValue([{ action: "MANUAL_REVIEW" }]) };
    const processor = new PaymentReconciliationProcessor(payments as never);

    await expect(processor.runOnce()).resolves.toBe(1);
    expect(payments.reconcileStale).toHaveBeenCalledWith(15);
  });

  it("keeps the periodic worker alive after a reconciliation failure", async () => {
    const payments = { reconcileStale: jest.fn().mockRejectedValue(new Error("database down")) };
    const processor = new PaymentReconciliationProcessor(payments as never);

    await expect(processor.runOnce()).resolves.toBe(0);
  });
});
