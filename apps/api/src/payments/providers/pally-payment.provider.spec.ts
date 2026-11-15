import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { PallyPaymentProvider, pallyConfigFromEnv, pallySignature, type PallyConfig } from "./pally-payment.provider";

const CONFIG: PallyConfig = {
  apiToken: "72|token",
  shopId: "SHOP1",
  apiUrl: "https://pal.example",
  webUrl: "https://example.com",
  allowedIps: [],
};

function setup(body: unknown = {}, status = 200, config: PallyConfig = CONFIG) {
  const fetchMock = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
  global.fetch = fetchMock as never;
  return { provider: new PallyPaymentProvider(config), fetchMock };
}

/** A postback exactly as Pally sends it: form-encoded, signed the documented way. */
function postback(fields: Record<string, string>, opts: { sign?: string; ip?: string } = {}) {
  const sign = opts.sign ?? pallySignature(fields.OutSum ?? "", fields.InvId ?? "", CONFIG.apiToken);
  const body = new URLSearchParams({ ...fields, SignatureValue: sign }).toString();
  return {
    rawBody: Buffer.from(body),
    headers: { "x-real-ip": opts.ip ?? "203.0.113.9", "content-type": "application/x-www-form-urlencoded" },
  };
}

const FIELDS = { InvId: "idem-1", OutSum: "103.00", Commission: "3.00", TrsId: "BILL1", Status: "SUCCESS", CurrencyIn: "RUB" };
const PAID_BILL = { id: "BILL1", order_id: "idem-1", status: "SUCCESS", amount: 100, currency_in: "RUB", success: true };

describe("pallyConfigFromEnv", () => {
  it("is null until both the token and the shop id are set", () => {
    expect(pallyConfigFromEnv({})).toBeNull();
    expect(pallyConfigFromEnv({ PALLY_API_TOKEN: "t" })).toBeNull();
    expect(pallyConfigFromEnv({ PALLY_API_TOKEN: "t", PALLY_SHOP_ID: "s" })).toMatchObject({
      apiToken: "t",
      shopId: "s",
      apiUrl: "https://pal24.pro",
      allowedIps: [],
    });
  });
});

describe("pallySignature", () => {
  it("is the documented upper-case md5 of OutSum:InvId:token", () => {
    const expected = createHash("md5").update("18.54:order-1:secret").digest("hex").toUpperCase();
    expect(pallySignature("18.54", "order-1", "secret")).toBe(expected);
    expect(pallySignature("18.54", "order-1", "secret")).toMatch(/^[0-9A-F]{32}$/);
  });
});

describe("PallyPaymentProvider.initiate", () => {
  const order = { id: "ord-1", currency: "RUB", amountCharged: new Prisma.Decimal("100") } as never;

  it("creates a single-use bill keyed by the idempotency key and returns its payment page", async () => {
    const { provider, fetchMock } = setup({ success: "true", bill_id: "BILL1", link_page_url: "https://pally.info/transfer/BILL1" });
    const res = await provider.initiate(order, "idem-1");

    expect(res).toEqual({ providerRef: "BILL1", redirectUrl: "https://pally.info/transfer/BILL1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://pal.example/api/v1/bill/create");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer 72|token");
    const sent = Object.fromEntries(new URLSearchParams(init.body));
    expect(sent).toMatchObject({
      amount: "100.00",
      shop_id: "SHOP1",
      order_id: "idem-1",
      currency_in: "RUB",
      type: "normal",
      success_url: "https://example.com/payment/pally?orderId=ord-1",
      fail_url: "https://example.com/payment/pally?orderId=ord-1",
      deactivate_on_fail: "1",
    });
  });

  it("refuses a currency Pally cannot bill in, without calling it", async () => {
    const { provider, fetchMock } = setup();
    const tryOrder = { id: "o", currency: "TRY", amountCharged: new Prisma.Decimal("5") } as never;
    await expect(provider.initiate(tryOrder, "k")).rejects.toThrow("PAYMENT_CURRENCY_NOT_SUPPORTED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a rejected bill as the caller's error and an outage as ours", async () => {
    await expect(setup({ success: false }, 422).provider.initiate(order, "k")).rejects.toThrow("PAYMENT_PROVIDER_REJECTED");
    await expect(setup({}, 500).provider.initiate(order, "k")).rejects.toThrow("Pally API error");
    await expect(setup({ success: "true" }).provider.initiate(order, "k")).rejects.toThrow("no payment page");
  });
});

describe("PallyPaymentProvider.verifyAndParseWebhook", () => {
  it("settles from the API's bill, not from the postback's own amount", async () => {
    const { provider, fetchMock } = setup(PAID_BILL);
    const event = await provider.verifyAndParseWebhook(postback(FIELDS));

    expect(fetchMock.mock.calls[0][0]).toBe("https://pal.example/api/v1/bill/status?id=BILL1");
    expect(event).toMatchObject({
      eventId: "BILL1:SUCCESS",
      status: "SUCCEEDED",
      amount: "100.00",
      currency: "RUB",
      providerTransactionId: "BILL1",
      idempotencyKey: "idem-1",
      providerStatus: "PALLY_SUCCESS",
    });
    expect(JSON.stringify(event.payload)).not.toContain("72|token");
  });

  it("refuses a missing or wrong signature before calling the API", async () => {
    const { provider, fetchMock } = setup(PAID_BILL);
    await expect(provider.verifyAndParseWebhook(postback(FIELDS, { sign: "0".repeat(32) }))).rejects.toThrow("Bad notification signature");
    await expect(provider.verifyAndParseWebhook(postback(FIELDS, { sign: "" }))).rejects.toThrow("Unsigned notification");
    // Signed for another amount: the signature covers OutSum as sent.
    const forged = postback({ ...FIELDS, OutSum: "1.00" }, { sign: pallySignature("103.00", "idem-1", CONFIG.apiToken) });
    await expect(provider.verifyAndParseWebhook(forged)).rejects.toThrow("Bad notification signature");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a postback whose bill belongs to another order", async () => {
    const { provider } = setup({ ...PAID_BILL, order_id: "someone-else" });
    await expect(provider.verifyAndParseWebhook(postback(FIELDS))).rejects.toThrow("Notification for another order");
  });

  it("does not settle a success the API does not confirm", async () => {
    const pending = await setup({ ...PAID_BILL, status: "PROCESS" }).provider.verifyAndParseWebhook(postback(FIELDS));
    expect(pending.status).toBe("PENDING");
    expect(pending.amount).toBeUndefined();
    const over = await setup({ ...PAID_BILL, status: "OVERPAID" }).provider.verifyAndParseWebhook(postback(FIELDS));
    expect(over.status).toBe("UNKNOWN");
    expect(over.amount).toBeUndefined();
    const failed = await setup({ ...PAID_BILL, status: "FAIL" }).provider.verifyAndParseWebhook(postback({ ...FIELDS, Status: "FAIL" }));
    expect(failed).toMatchObject({ status: "DECLINED", eventId: "BILL1:FAIL" });
  });

  it("asks for a retry while the bill is not visible in the API", async () => {
    const { provider } = setup({ success: false, message: "api:error.bill_not_found" }, 403);
    await expect(provider.verifyAndParseWebhook(postback(FIELDS))).rejects.toThrow("not yet visible");
  });

  it("applies the address filter only when one is configured", async () => {
    const filtered = setup(PAID_BILL, 200, { ...CONFIG, allowedIps: ["198.51.100.7"] }).provider;
    await expect(filtered.verifyAndParseWebhook(postback(FIELDS))).rejects.toThrow("Untrusted notification source");
    await expect(filtered.verifyAndParseWebhook(postback(FIELDS, { ip: "198.51.100.7" }))).resolves.toMatchObject({ status: "SUCCEEDED" });
  });
});

describe("PallyPaymentProvider.lookup", () => {
  it("finds the bill by our reference and prefers a paid one over a retried duplicate", async () => {
    const { provider, fetchMock } = setup({
      success: true,
      data: [
        { id: "B-open", order_id: "idem-1", status: "NEW", amount: 100, currency_in: "RUB" },
        { id: "B-paid", order_id: "idem-1", status: "SUCCESS", amount: 100, currency_in: "RUB" },
        { id: "B-other", order_id: "idem-10", status: "SUCCESS", amount: 5, currency_in: "RUB" },
      ],
    });
    const res = await provider.lookup({ idempotencyKey: "idem-1", providerTransactionId: null });
    expect(fetchMock.mock.calls[0][0]).toBe("https://pal.example/api/v1/bill/search?order_id=idem-1&shop_id=SHOP1");
    expect(res).toMatchObject({ status: "SUCCEEDED", amount: "100.00", currency: "RUB", providerRef: "B-paid" });
  });

  it("is pending when Pally has no bill for the reference", async () => {
    const res = await setup({ success: true, data: [] }).provider.lookup({ idempotencyKey: "idem-1", providerTransactionId: null });
    expect(res).toEqual({ status: "PENDING", providerStatus: "NOT_FOUND" });
  });
});
