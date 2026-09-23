const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const ACCESS_KEY = "th_access_token";

export type PurchaseSource = { code: string; name: string; allowedHosts: string[]; isEnabled: boolean; requiresManualReview: boolean };
export type PurchaseItem = {
  id?: string; sourceCode: string; url?: string; canonicalUrl?: string;
  titleSnapshot?: string | null; imageUrlSnapshot?: string | null; externalIdSnapshot?: string | null;
  variant?: string | null;
  quantity: number;
  unitPriceSnapshot?: number | string | null; estimatedWeightKg?: number | string | null;
};
/** What the server can tell us about a pasted link without fetching anything. */
export type PurchaseLinkPreview = {
  sourceCode: string;
  sourceName: string;
  canonicalUrl: string;
  externalId: string | null;
  isProductPage: boolean;
  requiresManualReview: boolean;
  /** Present only where the marketplace answers a readable API -- Wildberries today. */
  title: string | null;
  seller: string | null;
  priceCurrent: number | null;
  priceOriginal: number | null;
  priceCurrency: string | null;
};

export type PurchaseSearchEntry = { id: string; sourceCode: string; canonicalUrl: string; externalId: string | null };

export type PurchaseQuote = {
  version: number;
  totalTmt: number | string; productSubtotalTmt: number | string; serviceFeeTmt: number | string;
  shippingTmt: number | string; weightKg: number | string; weightConfidence: "ESTIMATED" | "EXACT"; expiresAt: string;
};
export type PurchaseOrder = {
  id: string;
  status: string;
  currency: string; deliveryAddress: string;
  items: PurchaseItem[];
  quotes: PurchaseQuote[]; maxAuthorizedTmt: number | string | null; acceptedQuoteVersion: number | null;
  authorizedTmt: number | string; settledTmt: number | string; refundedTmt: number | string; consentAcceptedAt: string | null;
  createdAt: string;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window === "undefined" ? null : window.localStorage.getItem(ACCESS_KEY);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    throw new Error(Array.isArray(body.message) ? body.message.join(". ") : body.message || response.statusText);
  }
  return response.json() as Promise<T>;
}

export const purchaseApi = {
  sources: () => call<PurchaseSource[]>("/cargo/marketplace-purchases/sources"),
  // Which marketplace a link belongs to, and which article it points at, is decided server-side.
  // The page used to match hosts itself, which meant the two clients could disagree about the
  // same link -- and neither could name the article number at all.
  resolve: (url: string) =>
    call<PurchaseLinkPreview>("/cargo/marketplace-purchases/resolve", { method: "POST", body: JSON.stringify({ url }) }),
  history: () => call<PurchaseSearchEntry[]>("/cargo/marketplace-purchases/history"),
  create: (body: object, idempotencyKey: string) => call<PurchaseOrder>("/cargo/marketplace-purchases/orders", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) }),
  mine: () => call<PurchaseOrder[]>("/cargo/marketplace-purchases/orders"),
  one: (id: string) => call<PurchaseOrder>(`/cargo/marketplace-purchases/orders/${encodeURIComponent(id)}`),
  acceptQuote: (id: string, body: object) => call<PurchaseOrder>(`/cargo/marketplace-purchases/orders/${encodeURIComponent(id)}/accept-quote`, { method: "POST", body: JSON.stringify(body) }),
};
