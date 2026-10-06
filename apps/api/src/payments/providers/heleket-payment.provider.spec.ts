import { Prisma } from "@prisma/client";
import { HeleketPaymentProvider, heleketSign, phpJson, type HeleketConfig } from "./heleket-payment.provider";

const CONFIG: HeleketConfig = {
  merchantId: "merchant-uuid",
  apiKey: "api-key",
  allowedIps: ["31.133.220.8"],
  callbackUrl: "https://api.example.com/api/payments/webhooks/heleket",
  webUrl: "https://example.com",
};

function setup(result: unknown = {}, status = 200, state = 0) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => ({ state, result }),
  });
  global.fetch = fetchMock as never;
  return { provider: new HeleketPaymentProvider(CONFIG), fetchMock };
}

/** A notification body exactly as PHP would produce it, signed the documented way. */
function notification(fields: Record<string, unknown>, ip = "31.133.220.8") {
  const sign = heleketSign(phpJson(fields), CONFIG.apiKey);
  const body = phpJson({ ...fields, sign });
  return { rawBody: Buffer.from(body), headers: { "x-real-ip": ip, "content-type": "application/json" } };
}

const PAID_INFO = { uuid: "inv-1", order_id: "idem-1", amount: "100.00", currency: "RUB", payment_status: "paid" };
const FIELDS = {
  type: "payment",
  uuid: "inv-1",
  order_id: "idem-1",
  amount: "100.00",
  currency: "RUB",
  status: "paid",
  url: "https://pay.heleket.com/pay/inv-1",
  is_final: true,
};

describe("HeleketPaymentProvider.initiate", () => {
  const order = { id: "ord-1", currency: "RUB", amountCharged: new Prisma.Decimal("100") } as never;

  it("creates an invoice keyed by the idempotency key and signs the exact body sent", async () => {
    const { provider, fetchMock } = setup({ uuid: "inv-1", url: "https://pay.heleket.com/pay/inv-1" });
    const res = await provider.initiate(order, "idem-1");

    expect(res).toEqual({ providerRef: "inv-1", redirectUrl: "https://pay.heleket.com/pay/inv-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.heleket.com/v1/payment");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      amount: "100.00",
      currency: "RUB",
      order_id: "idem-1",
      url_callback: CONFIG.callbackUrl,
      url_success: "https://example.com/payment/return?orderId=ord-1",
    });
    expect(init.headers.merchant).toBe("merchant-uuid");
    expect(init.headers.sign).toBe(heleketSign(init.body, "api-key"));
  });

  it("reports a rejected invoice as a client error, not an outage", async () => {
    const { provider } = setup(undefined, 422, 1);
    await expect(provider.initiate(order, "idem-1")).rejects.toThrow("PAYMENT_PROVIDER_REJECTED");
  });
});

describe("HeleketPaymentProvider.verifyAndParseWebhook", () => {
  it("accepts a signed notification from Heleket and settles from the API's answer", async () => {
    const { provider, fetchMock } = setup(PAID_INFO);
    const event = await provider.verifyAndParseWebhook(notification(FIELDS));

    expect(event).toMatchObject({
      eventId: "inv-1:paid",
      status: "SUCCEEDED",
      amount: "100.00",
      currency: "RUB",
      idempotencyKey: "idem-1",
      providerTransactionId: "inv-1",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.heleket.com/v1/payment/info");
  });

  it("verifies a PHP-escaped body (slashes as \\/) the way Heleket signs it", async () => {
    const { provider } = setup(PAID_INFO);
    const n = notification(FIELDS);
    expect(n.rawBody.toString()).toContain("https:\\/\\/pay.heleket.com");
    await expect(provider.verifyAndParseWebhook(n)).resolves.toMatchObject({ status: "SUCCEEDED" });
  });

  it("refuses a notification from any other address", async () => {
    const { provider, fetchMock } = setup(PAID_INFO);
    await expect(provider.verifyAndParseWebhook(notification(FIELDS, "1.2.3.4"))).rejects.toThrow("Untrusted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a tampered notification", async () => {
    const { provider, fetchMock } = setup(PAID_INFO);
    const n = notification(FIELDS);
    const forged = { ...n, rawBody: Buffer.from(n.rawBody.toString().replace('"100.00"', '"1.00"')) };
    await expect(provider.verifyAndParseWebhook(forged)).rejects.toThrow("Bad notification signature");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trusts the API over the notification: a 'paid' claim the API does not confirm settles nothing", async () => {
    const { provider } = setup({ ...PAID_INFO, payment_status: "check" });
    await expect(provider.verifyAndParseWebhook(notification(FIELDS))).resolves.toMatchObject({
      status: "PENDING",
      amount: undefined,
    });
  });

  it("leaves an underpaid invoice to a human", async () => {
    const { provider } = setup({ ...PAID_INFO, payment_status: "wrong_amount" });
    await expect(provider.verifyAndParseWebhook(notification({ ...FIELDS, status: "wrong_amount" }))).resolves.toMatchObject({
      status: "UNKNOWN",
    });
  });
});

describe("phpJson", () => {
  it("escapes slashes and non-ASCII like json_encode", () => {
    expect(phpJson({ u: "a/b", t: "Привет" })).toBe('{"u":"a\\/b","t":"\\u041f\\u0440\\u0438\\u0432\\u0435\\u0442"}');
  });
});
