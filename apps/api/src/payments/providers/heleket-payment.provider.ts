import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { Order } from "@prisma/client";
import { createHash, timingSafeEqual } from "crypto";
import type {
  PaymentInitiationResult,
  PaymentLookupResult,
  PaymentLookupStatus,
  PaymentProvider,
  PaymentWebhookInput,
  VerifiedPaymentWebhook,
} from "./payment-provider.interface";

const API_URL = "https://api.heleket.com/v1";
/** Heleket's documented webhook sender. Override with HELEKET_ALLOWED_IPS (comma list). */
const DEFAULT_NOTIFY_IPS = ["31.133.220.8"];
const DEFAULT_CALLBACK_URL = "https://api.gulyaly.com/api/payments/webhooks/heleket";
const DEFAULT_WEB_URL = "https://gulyaly.com";

/** Heleket payment_status -> our normalised status (docs: "Payment statuses"). */
const STATUS: Record<string, PaymentLookupStatus> = {
  check: "PENDING",
  confirm_check: "PENDING",
  process: "PENDING",
  paid: "SUCCEEDED",
  // Overpaid: the invoice amount was covered; the extra stays on the merchant balance.
  paid_over: "SUCCEEDED",
  // Underpaid: some money arrived, the order is not covered. A human decides -- never auto-fail
  // a payment that took the customer's funds.
  wrong_amount: "UNKNOWN",
  wrong_amount_waiting: "PENDING",
  cancel: "CANCELLED",
  fail: "DECLINED",
  system_fail: "DECLINED",
  refund_process: "UNKNOWN",
  refund_fail: "UNKNOWN",
  refund_paid: "UNKNOWN",
  locked: "UNKNOWN",
};

export interface HeleketConfig {
  merchantId: string;
  apiKey: string;
  allowedIps: string[];
  callbackUrl: string;
  webUrl: string;
}

export function heleketConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HeleketConfig | null {
  const merchantId = env.HELEKET_MERCHANT_ID?.trim();
  const apiKey = env.HELEKET_API_KEY?.trim();
  if (!merchantId || !apiKey) return null;
  const allowedIps = (env.HELEKET_ALLOWED_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    merchantId,
    apiKey,
    allowedIps: allowedIps.length ? allowedIps : DEFAULT_NOTIFY_IPS,
    callbackUrl: env.HELEKET_CALLBACK_URL?.trim() || DEFAULT_CALLBACK_URL,
    webUrl: (env.WEB_PUBLIC_URL?.trim() || DEFAULT_WEB_URL).replace(/\/+$/, ""),
  };
}

const md5 = (s: string) => createHash("md5").update(s).digest("hex");

/** Request/notification signature: md5(base64(json) + apiKey). */
export function heleketSign(json: string, apiKey: string): string {
  return md5(Buffer.from(json, "utf8").toString("base64") + apiKey);
}

/**
 * JSON the way PHP's json_encode writes it (Heleket signs with that): "/" escaped as "\/" and
 * every non-ASCII character as \uXXXX. JSON.stringify does neither, which is the documented
 * reason Node integrations fail signature checks.
 */
export function phpJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/\//g, "\\/")
    .replace(/[\u007f-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase());
  const right = Buffer.from(b.toLowerCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

/** "100" / "100.5" -> "100.50". */
function money(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException("Invalid amount");
  return n.toFixed(2);
}

/**
 * Crypto acquiring through Heleket (https://doc.heleket.com). The customer is sent to Heleket's
 * hosted invoice, which shows the amount in our currency and lets them pay in a coin of their
 * choice; Heleket converts.
 *
 * Trust model, same as FreeKassa: a notification must come from Heleket's documented address
 * (X-Real-IP, written by our nginx) and carry a valid signature, and even then the status, amount
 * and currency are re-read from Heleket's API (an authenticated server-to-server call) before
 * anything settles. The payment core still refuses a success whose amount or currency differ from
 * the Payment it recorded.
 *
 * Our reference on Heleket's side (`order_id`) is the payment's idempotency key. Heleket returns
 * the existing invoice for a repeated order_id, so a retried initiation cannot create a second one.
 */
@Injectable()
export class HeleketPaymentProvider implements PaymentProvider {
  readonly key = "heleket";
  private readonly logger = new Logger(HeleketPaymentProvider.name);

  constructor(private readonly config: HeleketConfig | null = heleketConfigFromEnv()) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  private cfg(): HeleketConfig {
    if (!this.config) throw new ServiceUnavailableException("Heleket is not configured");
    return this.config;
  }

  async initiate(order: Order, idempotencyKey: string): Promise<PaymentInitiationResult> {
    const { callbackUrl, webUrl } = this.cfg();
    const back = `${webUrl}/payment/return?orderId=${encodeURIComponent(order.id)}`;
    const result = await this.api<{ uuid?: string; url?: string }>("/payment", {
      amount: money(order.amountCharged.toString()),
      currency: String(order.currency),
      order_id: idempotencyKey,
      url_callback: callbackUrl,
      url_return: back,
      url_success: back,
      lifetime: 3600,
    });
    if (!result.url) throw new ServiceUnavailableException("Heleket returned no payment page");
    return { providerRef: result.uuid ?? idempotencyKey, redirectUrl: result.url };
  }

  async lookup(input: { idempotencyKey: string; providerTransactionId: string | null }): Promise<PaymentLookupResult> {
    const info = await this.info(input.idempotencyKey);
    if (!info) return { status: "PENDING", providerStatus: "NOT_FOUND" };
    return this.normalise(info);
  }

  async verifyAndParseWebhook({ rawBody, headers }: PaymentWebhookInput): Promise<VerifiedPaymentWebhook> {
    const { apiKey, allowedIps } = this.cfg();

    const ip = String(headers["x-real-ip"] ?? "").trim();
    if (!allowedIps.includes(ip)) {
      this.logger.warn("Heleket notification from a non-Heleket address refused");
      throw new UnauthorizedException("Untrusted notification source");
    }

    const raw = rawBody.toString("utf8");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new BadRequestException("Malformed notification");
    }
    const sign = typeof data.sign === "string" ? data.sign : "";
    if (!sign) throw new UnauthorizedException("Unsigned notification");
    if (!this.signatureMatches(raw, data, sign, apiKey)) throw new UnauthorizedException("Bad notification signature");

    const orderRef = typeof data.order_id === "string" ? data.order_id : "";
    const uuid = typeof data.uuid === "string" ? data.uuid : "";
    const notifiedStatus = typeof data.status === "string" ? data.status : "";
    if (!orderRef || !uuid || !notifiedStatus) throw new BadRequestException("Incomplete notification");
    // Payout/wallet notifications share the endpoint shape; only invoice payments settle orders.
    if (data.type !== undefined && data.type !== "payment") throw new BadRequestException("Not a payment notification");

    // Status, amount and currency come from the API, not from the notification.
    const info = await this.info(orderRef);
    if (!info) throw new ServiceUnavailableException("Payment not yet visible in the Heleket API");
    const result = this.normalise(info);
    return {
      // One event per status change of one invoice: a later "paid" after "check" is new.
      eventId: `${uuid}:${notifiedStatus}`,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      providerTransactionId: uuid,
      idempotencyKey: orderRef,
      providerStatus: result.providerStatus,
      payload: {
        notifiedStatus,
        payerCurrency: typeof data.payer_currency === "string" ? data.payer_currency : null,
        txid: typeof data.txid === "string" ? data.txid : null,
      },
    };
  }

  /**
   * Heleket signs the body as PHP produced it. Two ways to rebuild that exact string are tried:
   * the raw bytes with the "sign" member cut out (exact whatever the encoder did), and a
   * PHP-style re-encoding of the parsed object without "sign".
   */
  private signatureMatches(raw: string, data: Record<string, unknown>, sign: string, apiKey: string): boolean {
    const candidates: string[] = [];
    const stripped = raw
      .replace(/,\s*"sign"\s*:\s*"[0-9a-fA-F]+"/, "")
      .replace(/"sign"\s*:\s*"[0-9a-fA-F]+"\s*,?/, "");
    candidates.push(stripped);
    const { sign: _omit, ...rest } = data;
    candidates.push(phpJson(rest));
    return candidates.some((json) => sameHex(sign, heleketSign(json, apiKey)));
  }

  private normalise(info: HeleketPayment): PaymentLookupResult {
    const providerStatus = String(info.payment_status ?? info.status ?? "");
    const status = STATUS[providerStatus] ?? "UNKNOWN";
    return {
      status,
      amount: status === "SUCCEEDED" ? money(info.amount) : undefined,
      currency: status === "SUCCEEDED" ? String(info.currency ?? "").toUpperCase() : undefined,
      providerStatus: `HELEKET_${providerStatus}`,
      providerRef: info.uuid ?? undefined,
    };
  }

  /** POST /payment/info by our order_id. Null when Heleket has no such invoice. */
  private async info(orderId: string): Promise<HeleketPayment | null> {
    try {
      return await this.api<HeleketPayment>("/payment/info", { order_id: orderId });
    } catch (e) {
      if (e instanceof NotFound) return null;
      throw e;
    }
  }

  private async api<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const { merchantId, apiKey } = this.cfg();
    const json = JSON.stringify(body);
    let res: Response;
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", merchant: merchantId, sign: heleketSign(json, apiKey) },
        body: json,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("Heleket API unreachable");
    }
    const parsed = (await res.json().catch(() => ({}))) as { state?: number; result?: T; message?: string };
    if (res.status === 404) throw new NotFound();
    if (!res.ok || parsed.state !== 0 || !parsed.result) {
      this.logger.warn(`Heleket API ${path} failed: ${res.status} ${parsed.message ?? ""}`);
      if (res.status >= 400 && res.status < 500 && path === "/payment") {
        throw new BadRequestException("PAYMENT_PROVIDER_REJECTED");
      }
      throw new ServiceUnavailableException("Heleket API error");
    }
    return parsed.result;
  }
}

class NotFound extends Error {}

interface HeleketPayment {
  uuid?: string;
  order_id?: string;
  amount: string | number;
  currency?: string;
  payment_status?: string;
  status?: string;
}
