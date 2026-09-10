import { PaymentWebhookProcessor } from "./payment-webhook.processor";

describe("PaymentWebhookProcessor", () => {
  it("replays verified inbox rows left unfinished by a crash", async () => {
    const payments = { replayPendingWebhookEvents: jest.fn().mockResolvedValue(2) };
    const processor = new PaymentWebhookProcessor(payments as never);

    await expect(processor.runOnce()).resolves.toBe(2);
    expect(payments.replayPendingWebhookEvents).toHaveBeenCalledWith();
  });

  it("keeps the worker alive when a replay pass fails", async () => {
    const payments = { replayPendingWebhookEvents: jest.fn().mockRejectedValue(new Error("db down")) };
    const processor = new PaymentWebhookProcessor(payments as never);

    await expect(processor.runOnce()).resolves.toBe(0);
  });
});
