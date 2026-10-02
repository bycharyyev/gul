import { BadRequestException, Inject, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { Order } from "@prisma/client";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../queue/queue.module";
import type {
  PaymentInitiationResult,
  PaymentLookupResult,
  PaymentLookupStatus,
  PaymentProvider,
  PaymentWebhookInput,
  VerifiedPaymentWebhook,
} from "./payment-provider.interface";

/** Hosted payment page (SCI). */
const PAY_URL = "https://pay.fk.money/";
/** REST API v1. */
const API_URL = "https://api.fk.life/v1";
/** FreeKassa's documented notification senders. Override with FREEKASSA_ALLOWED_IPS (comma list). */
const DEFAULT_NOTIFY_IPS = ["168.119.157.136", "168.119.60.227", "178.154.197.79", "51.250.54.238"];
/** Currencies FreeKassa accepts for the shop amount; our others (TRY, CNY) cannot be charged here. */
const SUPPORTED_CURRENCIES = new Set(["RUB", "USD", "EUR", "KZT"]);

/** FreeKassa order status -> our normalised status (docs §2.3). */
const STATUS: Record<number, PaymentLookupStatus> = {
  0: "PENDING",
  1: "SUCCEEDED",
  6: "UNKNOWN", // refunded after payment: needs a human, never auto-settles or auto-fails
  8: "DECLINED",
  9: "CANCELLED",
};

export interface FreeKassaConfig {
  shopId: string;
  secretWord1: string;
  secretWord2: string;
  apiKey: string;
  allowedIps: string[];
}

export function freeKassaConfigFromEnv(env: NodeJS.ProcessEnv = process.env): FreeKassaConfig | null {
  const shopId = env.FREEKASSA_SHOP_ID?.trim();
  const secretWord1 = env.FREEKASSA_SECRET_WORD_1?.trim();
  const secretWord2 = env.FREEKASSA_SECRET_WORD_2?.trim();
  const apiKey = env.FREEKASSA_API_KEY?.trim();
  if (!shopId || !secretWord1 || !secretWord2 || !apiKey) return null;
  const allowedIps = (env.FREEKASSA_ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { shopId, secretWord1, secretWord2, apiKey, allowedIps: allowedIps.length ? allowedIps : DEFAULT_NOTIFY_IPS };
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase());
  const right = Buffer.from(b.toLowerCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

/** API v1 signature: values ordered by key name, joined with "|", HMAC-SHA256 with the API key. */
export function apiSignature(params: Record<string, string | number>, apiKey: string): string {
  const joined = Object.keys(params)
    .sort()
    .map((k) => String(params[k]))
    .join("|");
  return createHmac("sha256", apiKey).update(joined).digest("hex");
}

/** "100" / "100.5" / "100.50" -> "100.50": one canonical form for signatures and comparisons. */
export function money(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException("Invalid amount");
  return n.toFixed(2);
}

/** Notifications arrive as form fields (urlencoded or multipart). Parsed from the exact raw bytes. */
export function parseFormBody(rawBody: Buffer, contentType: string | undefined): Record<string, string> {
  const text = rawBody.toString("utf8");
  const boundary = /multipart\/form-data;.*boundary="?([^";]+)"?/i.exec(contentType ?? "")?.[1];
  if (!boundary) return Object.fromEntries(new URLSearchParams(text));
  const fields: Record<string, string> = {};
  for (const part of text.split(`--${boundary}`)) {
    const name = /name="([^"]+)"/.exec(part)?.[1];
    const split = part.indexOf("\r\n\r\n");
    if (!name || split === -1) continue;
    fields[name] = part.slice(split + 4).replace(/\r\n$/, "");
  }
  return fields;
}

/**
 * FreeKassa (https://docs.freekassa.net). The customer pays on FreeKassa's hosted page (SCI); the
 * result arrives as a notification on /api/payments/webhooks/freekassa.
 *
 * A notification settles nothing on its own word. It must come from a documented FreeKassa address
 * (X-Real-IP, written by our nginx), carry this shop's id and a valid MD5 signature made with
 * secret word 2 -- and even then the status, amount and currency are taken from FreeKassa's API
 * (an authenticated server-to-server read), because the notification itself carries no currency
 * and MD5 over a shared secret is a weak proof. The payment core then still refuses a success
 * whose amount or currency differ from the Payment it recorded.
 *
 * Our order reference on FreeKassa's side (`o` / `paymentId` / MERCHANT_ORDER_ID) is the payment's
 * durable idempotency key, so every notification and lookup maps back to exactly one Payment row.
 */
@Injectable()
export class FreeKassaPaymentProvider implements PaymentProvider {
  readonly key = "freekassa";
  /** Plain-text acknowledgement FreeKassa requires; anything else makes it retry. */
  readonly webhookAck = "YES";
  private readonly logger = new Logger(FreeKassaPaymentProvider.name);
  private readonly config: FreeKassaConfig | null;

  /** Built by PaymentsModule's factory; tests pass a config directly. */
  constructor(
    @Inject(REDIS_CLIENT) private redis: Redis,
    config: FreeKassaConfig | null = freeKassaConfigFromEnv(),
  ) {
    this.config = config;
  }

  isConfigured(): boolean {
    return this.config !== null;
  }

  private cfg(): FreeKassaConfig {
    if (!this.config) throw new ServiceUnavailableException("FreeKassa is not configured");
    return this.config;
  }

  async initiate(order: Order, idempotencyKey: string): Promise<PaymentInitiationResult> {
    const { shopId, secretWord1 } = this.cfg();
    const currency = String(order.currency);
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new BadRequestException("PAYMENT_CURRENCY_NOT_SUPPORTED");
    }
    const amount = money(order.amountCharged.toString());
    // Signature: MD5(shop:amount:secret1:currency:order) -- with the exact strings sent below.
    const sign = md5(`${shopId}:${amount}:${secretWord1}:${currency}:${idempotencyKey}`);
    const url = new URL(PAY_URL);
    url.search = new URLSearchParams({ m: shopId, oa: amount, currency, o: idempotencyKey, s: sign, lang: "ru" }).toString();
    return { providerRef: idempotencyKey, redirectUrl: url.toString() };
  }

  async lookup(input: { idempotencyKey: string; providerTransactionId: string | null }): Promise<PaymentLookupResult> {
    const order = await this.findOrder(input.idempotencyKey);
    if (!order) return { status: "PENDING", providerStatus: "NOT_FOUND" };
    return this.normalise(order);
  }

  async verifyAndParseWebhook({ rawBody, headers }: PaymentWebhookInput): Promise<VerifiedPaymentWebhook> {
    const { shopId, secretWord2, allowedIps } = this.cfg();

    // nginx overwrites X-Real-IP with the connecting address, so a caller cannot choose it.
    const ip = String(headers["x-real-ip"] ?? "").trim();
    if (!allowedIps.includes(ip)) {
      this.logger.warn("FreeKassa notification from a non-FreeKassa address refused");
      throw new UnauthorizedException("Untrusted notification source");
    }

    const contentType = headers["content-type"];
    const f = parseFormBody(rawBody, Array.isArray(contentType) ? contentType[0] : contentType);
    const merchantId = f.MERCHANT_ID ?? "";
    const amount = f.AMOUNT ?? "";
    const orderRef = f.MERCHANT_ORDER_ID ?? "";
    const intid = f.intid ?? "";
    const sign = f.SIGN ?? "";
    if (!merchantId || !amount || !orderRef || !intid || !sign) throw new BadRequestException("Incomplete notification");
    if (merchantId !== shopId) throw new UnauthorizedException("Notification for another shop");
    // Signature over the amount exactly as sent: MD5(shop:amount:secret2:order).
    if (!sameHex(sign, md5(`${merchantId}:${amount}:${secretWord2}:${orderRef}`))) {
      throw new UnauthorizedException("Bad notification signature");
    }

    // Authenticated read of the same order from FreeKassa: status, amount and currency come from
    // here, not from the notification. A network failure is an error, so FreeKassa retries.
    const order = await this.findOrder(orderRef);
    if (!order) throw new ServiceUnavailableException("Order not yet visible in the FreeKassa API");
    const result = this.normalise(order);
    return {
      eventId: `intid:${intid}`,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      providerTransactionId: String(order.fk_order_id ?? intid),
      idempotencyKey: orderRef,
      providerStatus: result.providerStatus,
      payload: { intid, notifiedAmount: amount, curId: f.CUR_ID ?? null, commission: f.commission ?? null },
    };
  }

  private normalise(order: FkOrder): PaymentLookupResult {
    const status = STATUS[Number(order.status)] ?? "UNKNOWN";
    return {
      status,
      amount: status === "SUCCEEDED" ? money(order.amount) : undefined,
      currency: status === "SUCCEEDED" ? String(order.currency ?? "").toUpperCase() : undefined,
      providerStatus: `FK_${order.status}`,
      providerRef: String(order.fk_order_id ?? ""),
    };
  }

  /** POST /orders filtered by our reference (paymentId). Null when FreeKassa has no such order. */
  private async findOrder(paymentId: string): Promise<FkOrder | null> {
    const res = await this.api<{ type?: string; orders?: FkOrder[] }>("/orders", { paymentId });
    return res.orders?.find((o) => String(o.merchant_order_id) === paymentId) ?? null;
  }

  private async api<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const { shopId, apiKey } = this.cfg();
    const body: Record<string, string | number> = { ...params, shopId: Number(shopId), nonce: await this.nonce() };
    body.signature = apiSignature(body, apiKey);
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("FreeKassa API unreachable");
    }
    const json = (await res.json().catch(() => ({}))) as T & { type?: string; message?: string };
    if (!res.ok || json.type === "error") {
      this.logger.warn(`FreeKassa API ${path} failed: ${res.status} ${json.message ?? ""}`);
      throw new ServiceUnavailableException("FreeKassa API error");
    }
    return json;
  }

  /**
   * FreeKassa requires every request's nonce to exceed the previous one. Two API nodes call it, so
   * a per-process counter would collide: one atomic Redis counter, never below the current time
   * in ms, is shared by both.
   */
  private async nonce(): Promise<number> {
    const value = await this.redis.eval(
      "local v = redis.call('INCR', KEYS[1]) local now = tonumber(ARGV[1]) if v < now then redis.call('SET', KEYS[1], now) v = now end return v",
      1,
      "freekassa:nonce",
      String(Date.now()),
    );
    return Number(value);
  }
}

interface FkOrder {
  merchant_order_id: string;
  fk_order_id: number;
  amount: number | string;
  currency: string;
  status: number;
}
