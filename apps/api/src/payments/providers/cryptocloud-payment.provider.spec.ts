import { createHmac } from "crypto";
import { Prisma } from "@prisma/client";
import {
  CryptoCloudPaymentProvider,
  splitRef,
  verifyHs256,
  type CryptoCloudConfig,
} from "./cryptocloud-payment.provider";

const CONFIG: CryptoCloudConfig = {
  shopId: "shop-1",
  apiKey: "api-key",
  secretKey: "secret",
  apiUrl: "https://api.trybit.com/v2",
};

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function jwt(payload: Record<string, unknown>, secret = "secret", alg = "HS256") {
  const h = b64url(JSON.stringify({ typ: "JWT", alg }));
  const p = b64url(JSON.stringify(payload));
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
const fresh = () => jwt({ id: 13, exp: Math.floor(Date.now() / 1000) + 300 });

function setup(result: unknown, status = 200) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: async () => ({ status: status < 400 ? "success" : "error", result }),
  });
  global.fetch = fetchMock as never;
  return { provider: new CryptoCloudPaymentProvider(CONFIG), fetchMock };
}

const PAID = { uuid: "INV-ABC12345", status: "paid", order_id: "idem-1__RUB", amount_in_fiat: 100 };
function postback(fields: Record<string, unknown>) {
  return { rawBody: Buffer.from(JSON.stringify(fields)), headers: { "content-type": "application/json" } };
}

describe("CryptoCloudPaymentProvider.initiate", () => {
  it("creates an invoice in the order currency, carrying our key and the currency in order_id", async () => {
    const { provider, fetchMock } = setup({ uuid: "INV-ABC12345", link: "https://pay.trybit.com/ABC12345" });
    const order = { currency: "RUB", amountCharged: new Prisma.Decimal("100") } as never;
    const res = await provider.initiate(order, "idem-1");

    expect(res).toEqual({ providerRef: "INV-ABC12345", redirectUrl: "https://pay.trybit.com/ABC12345" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.trybit.com/v2/invoice/create");
    expect(init.headers.Authorization).toBe("Token api-key");
    expect(JSON.parse(init.body)).toMatchObject({ shop_id: "shop-1", amount: 100, currency: "RUB", order_id: "idem-1__RUB" });
  });
});

describe("CryptoCloudPaymentProvider.verifyAndParseWebhook", () => {
  it("settles only from the API's view of the invoice", async () => {
    const { provider, fetchMock } = setup([PAID]);
    const event = await provider.verifyAndParseWebhook(
      postback({ status: "success", invoice_id: "ABC12345", order_id: "idem-1__RUB", token: fresh() }),
    );
    expect(event).toMatchObject({
      status: "SUCCEEDED",
      amount: "100.00",
      currency: "RUB",
      idempotencyKey: "idem-1",
      providerTransactionId: "INV-ABC12345",
      eventId: "INV-ABC12345:paid",
    });
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.trybit.com/v2/invoice/merchant/info");
  });

  it("refuses a postback with a token signed by anyone else", async () => {
    const { provider, fetchMock } = setup([PAID]);
    const forged = jwt({ id: 13, exp: Math.floor(Date.now() / 1000) + 300 }, "guess");
    await expect(
      provider.verifyAndParseWebhook(postback({ invoice_id: "ABC12345", token: forged })),
    ).rejects.toThrow("Bad notification signature");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an expired token (replay)", async () => {
    const { provider } = setup([PAID]);
    const old = jwt({ id: 13, exp: Math.floor(Date.now() / 1000) - 10 });
    await expect(provider.verifyAndParseWebhook(postback({ invoice_id: "ABC12345", token: old }))).rejects.toThrow(
      "Bad notification signature",
    );
  });

  it("does not settle a partial payment", async () => {
    const { provider } = setup([{ ...PAID, status: "partial" }]);
    await expect(
      provider.verifyAndParseWebhook(postback({ invoice_id: "ABC12345", token: fresh() })),
    ).resolves.toMatchObject({ status: "UNKNOWN", amount: undefined });
  });

  it("acknowledges the dashboard's test invoice (no reference of ours) without settling anything", async () => {
    const { provider } = setup([{ ...PAID, order_id: null }]);
    await expect(
      provider.verifyAndParseWebhook(postback({ invoice_id: "ABC12345", token: fresh() })),
    ).resolves.toMatchObject({ status: "UNKNOWN", amount: undefined, idempotencyKey: undefined, providerTransactionId: "INV-ABC12345" });
  });
});

describe("helpers", () => {
  it("rejects a token whose header claims another algorithm", () => {
    expect(verifyHs256(jwt({ exp: 9999999999 }, "secret", "none"), "secret")).toBe(false);
  });

  it("splits our order_id back into key and currency", () => {
    expect(splitRef("a-b__c__USD")).toEqual({ idempotencyKey: "a-b__c", currency: "USD" });
    expect(splitRef("nothing")).toBeNull();
  });
});
