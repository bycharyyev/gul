import { createHash, createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import { FreeKassaPaymentProvider, apiSignature, money, parseFormBody, type FreeKassaConfig } from "./freekassa-payment.provider";

const CONFIG: FreeKassaConfig = {
  shopId: "7012",
  secretWord1: "secret1",
  secretWord2: "secret2",
  apiKey: "api-key",
  allowedIps: ["168.119.157.136"],
};
const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function setup(apiOrders: unknown[] = [], ok = true) {
  const redis = { eval: jest.fn().mockResolvedValue(1_790_000_000_000) };
  const fetchMock = jest.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => (ok ? { type: "success", orders: apiOrders } : { type: "error", message: "boom" }),
  });
  global.fetch = fetchMock as never;
  const provider = new FreeKassaPaymentProvider(redis as never, CONFIG);
  return { provider, fetchMock, redis };
}

function notification(fields: Record<string, string>, ip = "168.119.157.136") {
  return {
    rawBody: Buffer.from(new URLSearchParams(fields).toString()),
    headers: { "x-real-ip": ip, "content-type": "application/x-www-form-urlencoded" },
  };
}

const PAID = { merchant_order_id: "idem-1", fk_order_id: 555, amount: 100.11, currency: "RUB", status: 1 };
const signed = (amount = "100.11", order = "idem-1") => ({
  MERCHANT_ID: "7012",
  AMOUNT: amount,
  intid: "999",
  MERCHANT_ORDER_ID: order,
  CUR_ID: "42",
  SIGN: md5(`7012:${amount}:secret2:${order}`),
});

describe("FreeKassaPaymentProvider.initiate", () => {
  const order = { currency: "RUB", amountCharged: new Prisma.Decimal("100.11") } as never;

  it("redirects to the hosted page with the documented MD5 signature", async () => {
    const { provider } = setup();
    const res = await provider.initiate(order, "idem-1");
    const url = new URL(res.redirectUrl!);
    expect(url.origin + url.pathname).toBe("https://pay.fk.money/");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      m: "7012",
      oa: "100.11",
      currency: "RUB",
      o: "idem-1",
      s: md5("7012:100.11:secret1:RUB:idem-1"), // docs: md5('7012:100.11:secret:RUB:154') shape
    });
    expect(res.providerRef).toBe("idem-1");
  });

  it("refuses a currency FreeKassa cannot charge", async () => {
    const { provider } = setup();
    await expect(provider.initiate({ currency: "TRY", amountCharged: new Prisma.Decimal(5) } as never, "k")).rejects.toThrow(
      "PAYMENT_CURRENCY_NOT_SUPPORTED",
    );
  });
});

describe("FreeKassaPaymentProvider.verifyAndParseWebhook", () => {
  it("accepts a signed notification from FreeKassa and takes status/amount/currency from its API", async () => {
    const { provider, fetchMock } = setup([PAID]);
    const event = await provider.verifyAndParseWebhook(notification(signed()));

    expect(event).toMatchObject({
      eventId: "intid:999",
      status: "SUCCEEDED",
      amount: "100.11",
      currency: "RUB",
      idempotencyKey: "idem-1",
      providerTransactionId: "555",
    });
    // The API read is signed: values by key name, "|"-joined, HMAC-SHA256 with the API key.
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    const { signature, ...params } = sent;
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.fk.life/v1/orders");
    expect(signature).toBe(apiSignature(params, "api-key"));
    expect(params).toMatchObject({ paymentId: "idem-1", shopId: 7012 });
  });

  it("refuses a notification that does not come from a FreeKassa address", async () => {
    const { provider, fetchMock } = setup([PAID]);
    await expect(provider.verifyAndParseWebhook(notification(signed(), "203.0.113.5"))).rejects.toThrow("Untrusted");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a bad signature, and one for another shop", async () => {
    const { provider } = setup([PAID]);
    await expect(provider.verifyAndParseWebhook(notification({ ...signed(), SIGN: "0".repeat(32) }))).rejects.toThrow(
      "Bad notification signature",
    );
    await expect(provider.verifyAndParseWebhook(notification({ ...signed(), MERCHANT_ID: "1" }))).rejects.toThrow(
      "another shop",
    );
  });

  it("does not trust the notification's amount: the API's figure is what the core compares", async () => {
    const { provider } = setup([{ ...PAID, amount: 1 }]);
    const event = await provider.verifyAndParseWebhook(notification(signed()));
    expect(event.amount).toBe("1.00"); // the core then refuses: it differs from the recorded Payment
  });

  it("an unpaid or refunded order never reports success", async () => {
    const pending = setup([{ ...PAID, status: 0 }]);
    expect((await pending.provider.verifyAndParseWebhook(notification(signed()))).status).toBe("PENDING");
    const refunded = setup([{ ...PAID, status: 6 }]);
    const ev = await refunded.provider.verifyAndParseWebhook(notification(signed()));
    expect(ev.status).toBe("UNKNOWN");
    expect(ev.amount).toBeUndefined();
  });

  it("an API failure is an error (FreeKassa retries), never a guess", async () => {
    const { provider } = setup([], false);
    await expect(provider.verifyAndParseWebhook(notification(signed()))).rejects.toThrow("FreeKassa API error");
  });
});

describe("FreeKassaPaymentProvider.lookup", () => {
  it("maps the API order status", async () => {
    const { provider } = setup([{ ...PAID, status: 8 }]);
    await expect(provider.lookup({ idempotencyKey: "idem-1", providerTransactionId: null })).resolves.toMatchObject({
      status: "DECLINED",
    });
  });

  it("an order FreeKassa does not have yet is still pending", async () => {
    const { provider } = setup([]);
    await expect(provider.lookup({ idempotencyKey: "idem-1", providerTransactionId: null })).resolves.toMatchObject({
      status: "PENDING",
    });
  });
});

describe("helpers", () => {
  it("apiSignature matches the documented PHP (ksort, implode '|', hash_hmac sha256)", () => {
    const expected = createHmac("sha256", "k").update("123|777").digest("hex"); // nonce|shopId
    expect(apiSignature({ shopId: 777, nonce: 123 }, "k")).toBe(expected);
  });

  it("money gives one canonical form", () => {
    expect(money("100")).toBe("100.00");
    expect(money(100.5)).toBe("100.50");
    expect(() => money("-1")).toThrow();
  });

  it("parses multipart notifications as well as urlencoded ones", () => {
    const b = "XyZ";
    const body = `--${b}\r\nContent-Disposition: form-data; name="AMOUNT"\r\n\r\n100\r\n--${b}\r\nContent-Disposition: form-data; name="intid"\r\n\r\n7\r\n--${b}--\r\n`;
    expect(parseFormBody(Buffer.from(body), `multipart/form-data; boundary=${b}`)).toEqual({ AMOUNT: "100", intid: "7" });
    expect(parseFormBody(Buffer.from("AMOUNT=100&intid=7"), "application/x-www-form-urlencoded")).toEqual({
      AMOUNT: "100",
      intid: "7",
    });
  });
});
