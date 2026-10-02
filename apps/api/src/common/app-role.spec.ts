import { appRole, runsBackgroundWork } from "./app-role";
import { PaymentReconciliationProcessor } from "../payments/payment-reconciliation.processor";
import { TopupProcessor } from "../orders/topup.processor";

describe("APP_ROLE (ADR 0008)", () => {
  const original = process.env.APP_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.APP_ROLE;
    else process.env.APP_ROLE = original;
    jest.useRealTimers();
  });

  it.each([
    [undefined, "all", true],
    ["http", "http", false],
    ["HTTP ", "http", false],
    ["worker", "worker", true],
    ["wroker", "all", true], // a typo must never silently stop background work
  ])("APP_ROLE=%p -> %s, background %p", (value, role, background) => {
    if (value === undefined) delete process.env.APP_ROLE;
    else process.env.APP_ROLE = value;
    expect(appRole()).toBe(role);
    expect(runsBackgroundWork()).toBe(background);
  });

  it("an http process starts no payment sweeper and no top-up worker", () => {
    process.env.APP_ROLE = "http";
    jest.useFakeTimers();
    const reconciliation = new PaymentReconciliationProcessor({} as never);
    reconciliation.onModuleInit();
    expect(jest.getTimerCount()).toBe(0);

    const topup = new TopupProcessor({} as never, {} as never);
    topup.onModuleInit();
    expect((topup as unknown as { worker?: unknown }).worker).toBeUndefined();
  });
});
