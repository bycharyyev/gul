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

/** API host from Pally's own documentation examples. Override with PALLY_API_URL. */
const DEFAULT_API_URL = "https://pal24.pro";
const DEFAULT_WEB_URL = "https://gulyaly.com";
/** Currencies a Pally bill can be issued in (`currency_in`). */
const SUPPORTED_CURRENCIES = new Set(["RUB", "USD", "EUR"]);

/** Pally bill status -> our normalised status (docs: "Bill Resource"). */
const STATUS: Record<string, PaymentLookupStatus> = {
  NEW: "PENDING",
  PROCESS: "PENDING",
  SUCCESS: "SUCCEEDED",
  // Money arrived but not the billed sum, in either direction. A human decides -- a payment that
  // took the customer's funds is never auto-failed, and an unexpected sum is never auto-settled.
  UNDERPAID: "UNKNOWN",
  OVERPAID: "UNKNOWN",
  FAIL: "DECLINED",
};

export interface PallyConfig {
  apiToken: string;
  shopId: string;
  apiUrl: string;
  webUrl: string;
  /** Empty means "no address filter": Pally documents no sender addresses. */
  allowedIps: string[];
}

export function pallyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PallyConfig | null {
  const apiToken = env.PALLY_API_TOKEN?.trim();
  const shopId = env.PALLY_SHOP_ID?.trim();
  if (!apiToken || !shopId) return null;
  return {
    apiToken,
    shopId,
    apiUrl: (env.PALLY_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, ""),
    webUrl: (env.WEB_PUBLIC_URL?.trim() || DEFAULT_WEB_URL).replace(/\/+$/, ""),
    allowedIps: (env.PALLY_ALLOWED_IPS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Postback signature: strtoupper(md5(OutSum:InvId:apiToken)), over the strings exactly as sent. */
export function pallySignature(outSum: string, invId: string, apiToken: string): string {
  return createHash("md5").update(`${outSum}:${invId}:${apiToken}`).digest("hex").toUpperCase();
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
 * Card / SBP acquiring through Pally (https://pally.info, API documented in the merchant cabinet).
 * A bill is created over the API and the customer pays on Pally's hosted page; the result arrives
 * as a form-encoded postback on /api/payments/webhooks/pally (the shop's Result URL).
 *
 * Trust model, same as the other adapters: a postback must carry a valid signature, and even then
 * the status, amount and currency are re-read from Pally's API (an authenticated server-to-server
 * call) before anything settles -- MD5 over a shared secret is a weak proof and the postback's
 * OutSum may include a commission. Pally documents no sender addresses, so there is no address
 * filter unless PALLY_ALLOWED_IPS is set. The payment core still refuses a success whose amount
 * or currency differ from the Payment it recorded.
 *
 * Our reference on Pally's side (`order_id`, returned as `InvId`) is the payment's idempotency
 * key. Pally does not deduplicate by it: an initiation retried after a crash issues a second
 * bill. Only the link from the attempt that completed ever reaches the customer, both bills map
 * to the same Payment, and a lookup prefers whichever one was paid.
 *
 * Bills are single-use and closed on the first failed attempt (`deactivate_on_fail`), so a FAIL
 * is final and can be recorded as a decline without a later success contradicting it.
 */
@Injectable()
export class PallyPaymentProvider implements PaymentProvider {
  readonly key = "pally";
  private readonly logger = new Logger(PallyPaymentProvider.name);

  constructor(private readonly config: PallyConfig | null = pallyConfigFromEnv()) {}

  isConfigured(): boolean {
    return this.config !== null;
  }

  private cfg(): PallyConfig {
    if (!this.config) throw new ServiceUnavailableException("Pally is not configured");
    return this.config;
  }

  async initiate(order: Order, idempotencyKey: string): Promise<PaymentInitiationResult> {
    const { shopId, webUrl } = this.cfg();
    const currency = String(order.currency);
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      throw new BadRequestException("PAYMENT_CURRENCY_NOT_SUPPORTED");
    }
    // Pally returns the customer with a POST, which a page cannot receive: /payment/pally is a
    // route on the shop's own domain (Pally requires that) that turns it into a normal GET.
    const back = `${webUrl}/payment/pally?orderId=${encodeURIComponent(order.id)}`;
    const result = await this.request<{ bill_id?: string; link_page_url?: string }>("POST", "/api/v1/bill/create", {
      amount: money(order.amountCharged.toString()),
      shop_id: shopId,
      order_id: idempotencyKey,
      currency_in: currency,
      type: "normal",
      locale: "ru",
      description: `Gulyaly ${order.id}`,
      success_url: back,
      fail_url: back,
      return_url: `${webUrl}/`,
      deactivate_on_fail: "1",
    });
    if (!result.bill_id || !result.link_page_url) throw new ServiceUnavailableException("Pally returned no payment page");
    return { providerRef: result.bill_id, redirectUrl: result.link_page_url };
  }

  async lookup(input: { idempotencyKey: string; providerTransactionId: string | null }): Promise<PaymentLookupResult> {
    const bill = await this.findBill(input.idempotencyKey);
    if (!bill) return { status: "PENDING", providerStatus: "NOT_FOUND" };
    return this.normalise(bill);
  }

  async verifyAndParseWebhook({ rawBody, headers }: PaymentWebhookInput): Promise<VerifiedPaymentWebhook> {
    const { apiToken, allowedIps } = this.cfg();

    if (allowedIps.length) {
      // nginx overwrites X-Real-IP with the connecting address, so a caller cannot choose it.
      const ip = String(headers["x-real-ip"] ?? "").trim();
      if (!allowedIps.includes(ip)) {
        this.logger.warn("Pally postback from an address outside PALLY_ALLOWED_IPS refused");
        throw new UnauthorizedException("Untrusted notification source");
      }
    }

    const f = Object.fromEntries(new URLSearchParams(rawBody.toString("utf8")));
    const outSum = f.OutSum ?? "";
    const orderRef = f.InvId ?? "";
    const billId = f.TrsId ?? "";
    const notifiedStatus = f.Status ?? "";
    const sign = f.SignatureValue ?? "";
    if (!sign) throw new UnauthorizedException("Unsigned notification");
    if (!outSum || !orderRef || !billId || !notifiedStatus) throw new BadRequestException("Incomplete notification");
    if (!sameHex(sign, pallySignature(outSum, orderRef, apiToken))) {
      throw new UnauthorizedException("Bad notification signature");
    }

    // Status, amount and currency come from the API, not from the postback. The bill is read by
    // the id the postback names, and must be the one issued for this order reference.
    const bill = await this.billStatus(billId);
    if (!bill) throw new ServiceUnavailableException("Bill not yet visible in the Pally API");
    if (String(bill.order_id ?? "") !== orderRef) throw new UnauthorizedException("Notification for another order");
    const result = this.normalise(bill);
    return {
      // One event per status change of one bill.
      eventId: `${billId}:${notifiedStatus}`,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      providerTransactionId: billId,
      idempotencyKey: orderRef,
      providerStatus: result.providerStatus,
      payload: {
        notifiedStatus,
        notifiedAmount: outSum,
        commission: f.Commission ?? null,
        accountType: f.AccountType ?? null,
        errorCode: f.ErrorCode ?? null,
      },
    };
  }

  private normalise(bill: PallyBill): PaymentLookupResult {
    const providerStatus = String(bill.status ?? "").toUpperCase();
    const status = STATUS[providerStatus] ?? "UNKNOWN";
    return {
      status,
      // The billed sum: unlike a payment's amount it never includes a commission passed on to the payer.
      amount: status === "SUCCEEDED" ? money(bill.amount) : undefined,
      currency: status === "SUCCEEDED" ? String(bill.currency_in ?? "").toUpperCase() : undefined,
      providerStatus: `PALLY_${providerStatus}`,
      providerRef: bill.id ?? undefined,
    };
  }

  /** GET /bill/status by Pally's bill id. Null when Pally has no such bill. */
  private async billStatus(id: string): Promise<PallyBill | null> {
    try {
      return await this.request<PallyBill>("GET", "/api/v1/bill/status", { id });
    } catch (e) {
      if (e instanceof NotFound) return null;
      throw e;
    }
  }

  /**
   * GET /bill/search by our reference. More than one bill can carry it (see the class note): a
   * paid one wins, then one still open, then whatever is left.
   */
  private async findBill(orderId: string): Promise<PallyBill | null> {
    const { shopId } = this.cfg();
    const res = await this.request<{ data?: PallyBill[] }>("GET", "/api/v1/bill/search", { order_id: orderId, shop_id: shopId });
    const bills = (res.data ?? []).filter((b) => String(b.order_id ?? "") === orderId);
    const rank = (b: PallyBill) => {
      const s = STATUS[String(b.status ?? "").toUpperCase()] ?? "UNKNOWN";
      return s === "SUCCEEDED" ? 0 : s === "UNKNOWN" ? 1 : s === "PENDING" ? 2 : 3;
    };
    return bills.sort((a, b) => rank(a) - rank(b))[0] ?? null;
  }

  private async request<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
    const { apiUrl, apiToken } = this.cfg();
    const query = new URLSearchParams(params).toString();
    let res: Response;
    try {
      res = await fetch(method === "GET" ? `${apiUrl}${path}?${query}` : `${apiUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        },
        body: method === "POST" ? query : undefined,
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new ServiceUnavailableException("Pally API unreachable");
    }
    const parsed = (await res.json().catch(() => ({}))) as T & { success?: boolean | string; message?: string };
    const text = `${parsed.message ?? ""}`;
    if (res.status === 403 && /bill_not_found/.test(JSON.stringify(parsed))) throw new NotFound();
    if (!res.ok || parsed.success === false || parsed.success === "false") {
      this.logger.warn(`Pally API ${path} failed: ${res.status} ${text}`);
      // A refusal of this bill (amount, currency, direction) is the caller's to see; anything
      // else -- credentials, an outage -- is ours and worth a retry.
      if (path === "/api/v1/bill/create" && (res.status === 400 || res.status === 422)) {
        throw new BadRequestException("PAYMENT_PROVIDER_REJECTED");
      }
      throw new ServiceUnavailableException("Pally API error");
    }
    return parsed;
  }
}

class NotFound extends Error {}

interface PallyBill {
  id?: string;
  order_id?: string;
  status?: string;
  amount: string | number;
  currency_in?: string;
}
