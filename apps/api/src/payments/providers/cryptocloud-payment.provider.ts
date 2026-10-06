import { BadRequestException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { Order } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import type {
  PaymentInitiationResult,
  PaymentLookupResult,
  PaymentLookupStatus,
  PaymentProvider,
  PaymentWebhookInput,
  VerifiedPaymentWebhook,
} from "./payment-provider.interface";

/** CryptoCloud became Trybit in May 2026; the API moved with it. Override with CRYPTOCLOUD_API_URL. */
const DEFAULT_API_URL = "https://api.trybit.com/v2";

/** Invoice status (docs: "Invoice information") -> our normalised status. */
const STATUS: Record<string, PaymentLookupStatus> = {
  created: "PENDING",
  paid: "SUCCEEDED",
  overpaid: "SUCCEEDED",
  // Some money arrived but not enough: a human decides, never auto-fail funds the customer sent.
  partial: "UNKNOWN",
  canceled: "CANCELLED",
};

/** Separates our idempotency key from the order currency inside CryptoCloud's `order_id`. */
const REF_SEPARATOR = "__";

export interface CryptoCloudConfig {
  shopId: string;
  apiKey: string;
  secretKey: string;
  apiUrl: string;
}

export function cryptoCloudConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CryptoCloudConfig | null {
  const shopId = env.CRYPTOCLOUD_SHOP_ID?.trim();
  const apiKey = env.CRYPTOCLOUD_API_KEY?.trim();
  const secretKey = env.CRYPTOCLOUD_SECRET_KEY?.trim();
  if (!shopId || !apiKey || !secretKey) return null;
  return { shopId, apiKey, secretKey, apiUrl: (env.CRYPTOCLOUD_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, "") };
}

function money(value: string | number): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new BadRequestException("Invalid amount");
  return n.toFixed(2);
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Verifies an HS256 JWT and its `exp`. Returns false for anything else (alg confusion included). */
export function verifyHs256(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [h, p, s] = parts;
  try {
    const header = JSON.parse(Buffer.from(h, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return false;
    const expected = Buffer.from(b64url(createHmac("sha256", secret).update(`${h}.${p}`).digest()));
    const given = Buffer.from(s);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8")) as { exp?: number };
    return typeof payload.exp !== "number" || payload.exp >= nowSec;
  } catch {
    return false;
  }
}

/** `order_id` we send: "<idempotency key>__<currency>". The currency travels with the invoice
 * because CryptoCloud reports the fiat amount but not which fiat it was. */
export function splitRef(orderId: string): { idempotencyKey: string; currency: string } | null {
  const at = orderId.lastIndexOf(REF_SEPARATOR);
  if (at <= 0) return null;
  const currency = orderId.slice(at + REF_SEPARATOR.length).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  return { idempotencyKey: orderId.slice(0, at), currency };
}

/**
 * Crypto acquiring through CryptoCloud / Trybit (https://docs.trybit.com), kept as a backup to
 * Heleket: an admin switches the CRYPTO payment method between the two in the console.
 *
 * Trust model: the POSTBACK's JWT (HS256, project SECRET KEY, 5-minute life) proves the request
 * came from CryptoCloud recently, but its claims do not name the invoice -- so the invoice is
 * always re-read from the API (authenticated with the API key) and only that answer settles
 * anything. CryptoCloud publishes no sender IP list, which is why the API re-read is mandatory
 * here rather than defence in depth. The payment core then still refuses a success whose amount
 * or currency differ from the Payment it recorded.
 *
 * Success/fail return pages are set in the CryptoCloud project settings (both: /payment/return).
 */
@Injectable()
export class CryptoCloudPaymentProvider implements PaymentProvider {
  readonly key = "cryptocloud";
  private readonly logger = new Logger(CryptoCloudPaymentProvider.name);

  constructor(private readonly config: CryptoCloudConfig | null = cryptoCloudConfigFromEnv()) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  private cfg(): CryptoCloudConfig {
    if (!this.config) throw new ServiceUnavailableException("CryptoCloud is not configured");
    return this.config;
  }

  async initiate(order: Order, idempotencyKey: string): Promise<PaymentInitiationResult> {
    const { shopId } = this.cfg();
    const currency = String(order.currency);
    const invoice = await this.api<{ uuid?: string; link?: string }>("/invoice/create", {
      shop_id: shopId,
      amount: Number(money(order.amountCharged.toString())),
      currency,
      order_id: `${idempotencyKey}${REF_SEPARATOR}${currency}`,
      add_fields: { time_to_pay: { hours: 1, minutes: 0 } },
    });
    if (!invoice.link || !invoice.uuid) throw new ServiceUnavailableException("CryptoCloud returned no payment page");
    return { providerRef: invoice.uuid, redirectUrl: invoice.link };
  }

  async lookup(input: { idempotencyKey: string; providerTransactionId: string | null }): Promise<PaymentLookupResult> {
    if (!input.providerTransactionId) return { status: "PENDING", providerStatus: "NO_INVOICE" };
    const info = await this.info(input.providerTransactionId);
    if (!info) return { status: "PENDING", providerStatus: "NOT_FOUND" };
    return this.normalise(info);
  }

  async verifyAndParseWebhook({ rawBody, headers }: PaymentWebhookInput): Promise<VerifiedPaymentWebhook> {
    const { secretKey } = this.cfg();
    const contentType = String(headers["content-type"] ?? "");
    const text = rawBody.toString("utf8");
    let fields: Record<string, unknown>;
    try {
      fields = contentType.includes("json")
        ? (JSON.parse(text) as Record<string, unknown>)
        : Object.fromEntries(new URLSearchParams(text));
    } catch {
      throw new BadRequestException("Malformed notification");
    }

    const token = typeof fields.token === "string" ? fields.token : "";
    if (!token || !verifyHs256(token, secretKey)) {
      this.logger.warn("CryptoCloud notification with a missing or invalid token refused");
      throw new UnauthorizedException("Bad notification signature");
    }
    const invoiceId = typeof fields.invoice_id === "string" ? fields.invoice_id : "";
    if (!/^[A-Za-z0-9-]{4,40}$/.test(invoiceId)) throw new BadRequestException("Incomplete notification");

    // Everything that matters comes from the API, not from the notification.
    const info = await this.info(invoiceId);
    if (!info) throw new ServiceUnavailableException("Invoice not yet visible in the CryptoCloud API");
    const result = this.normalise(info);
    // An invoice without our reference -- the test invoice CryptoCloud's dashboard creates to
    // check the postback, or one made by hand in their cabinet -- is acknowledged and stored, but
    // matches no Payment, so it settles nothing (normalise() already refuses SUCCEEDED for it).
    // Rejecting it instead would fail CryptoCloud's postback check for the project.
    const ref = splitRef(String(info.order_id ?? ""));
    return {
      eventId: `${info.uuid ?? invoiceId}:${info.status ?? ""}`,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      providerTransactionId: info.uuid ?? `INV-${invoiceId}`,
      idempotencyKey: ref?.idempotencyKey,
      providerStatus: result.providerStatus,
      payload: {
        notifiedStatus: typeof fields.status === "string" ? fields.status : null,
        cryptoCurrency: typeof fields.currency === "string" ? fields.currency : null,
      },
    };
  }

  private normalise(info: CryptoCloudInvoice): PaymentLookupResult {
    const providerStatus = String(info.status ?? "");
    const status = STATUS[providerStatus] ?? "UNKNOWN";
    const ref = splitRef(String(info.order_id ?? ""));
    // A "paid" invoice we cannot attribute a currency to must not settle.
    if (status === "SUCCEEDED" && (!ref || info.amount_in_fiat == null)) {
      return { status: "UNKNOWN", providerStatus: `CRYPTOCLOUD_${providerStatus}_UNATTRIBUTED`, providerRef: info.uuid };
    }
    return {
      status,
      amount: status === "SUCCEEDED" ? money(info.amount_in_fiat as number) : undefined,
      currency: status === "SUCCEEDED" ? ref!.currency : undefined,
      providerStatus: `CRYPTOCLOUD_${providerStatus}`,
      providerRef: info.uuid,
    };
  }

  private async info(uuid: string): Promise<CryptoCloudInvoice | null> {
    const result = await this.api<CryptoCloudInvoice[]>("/invoice/merchant/info", { uuids: [uuid] });
    return Array.isArray(result) && result.length ? result[0] : null;
  }

  private async api<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const { apiKey, apiUrl } = this.cfg();
    let res: Response;
    try {
      res = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Token ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("CryptoCloud API unreachable");
    }
    const parsed = (await res.json().catch(() => ({}))) as { status?: string; result?: T };
    if (!res.ok || parsed.status !== "success" || parsed.result === undefined) {
      this.logger.warn(`CryptoCloud API ${path} failed: ${res.status}`);
      if (res.status >= 400 && res.status < 500 && path === "/invoice/create") {
        throw new BadRequestException("PAYMENT_PROVIDER_REJECTED");
      }
      throw new ServiceUnavailableException("CryptoCloud API error");
    }
    return parsed.result;
  }
}

interface CryptoCloudInvoice {
  uuid?: string;
  status?: string;
  order_id?: string | null;
  amount_in_fiat?: number | null;
}
