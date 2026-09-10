const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api";
const TOKEN = "th_admin_access_token";

export type AdminSource = {
  code: string;
  name: string;
  allowedHosts: string[];
  adapterKey: string;
  isEnabled: boolean;
  requiresManualReview: boolean;
};
export type AdminSettings = {
  serviceFeePercent: number;
  shippingPerKgTmt: number;
  minimumFeeTmt: number;
  quoteTtlMinutes: number;
};
export type AdminPurchaseItem = {
  id: string;
  titleSnapshot?: string | null;
  canonicalUrl: string;
  variant?: string | null;
  quantity: number;
  imageUrlSnapshot?: string | null;
  snapshotPayload?: Record<string, unknown>;
  unitPriceSnapshot?: number | string | null;
  estimatedWeightKg?: number | string | null;
  actualWeightKg?: number | string | null;
  reportedTitle?: string | null;
  reportedPrice?: number | string | null;
  reportedCurrency?: string | null;
  reportedSource?: string | null;
};
export type AdminQuote = {
  version: number;
  totalTmt: number | string;
  productSubtotalTmt: number | string;
  serviceFeeTmt: number | string;
  shippingTmt: number | string;
  weightKg: number | string;
  weightConfidence: string;
  expiresAt: string;
};
export type AdminPurchaseOrder = {
  id: string;
  status: string;
  items: AdminPurchaseItem[];
  quotes: AdminQuote[];
  maxAuthorizedTmt: number | string | null;
  authorizedTmt: number | string;
  settledTmt: number | string;
  refundedTmt: number | string;
  acceptedQuoteVersion: number | null;
  createdAt: string;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(". ")
        : body.message || response.statusText,
    );
  }
  return response.json() as Promise<T>;
}
const root = "/admin/cargo/marketplace-purchases";
export const adminPurchaseApi = {
  settings: () => call<AdminSettings>(`${root}/settings`),
  saveSettings: (body: AdminSettings) =>
    call<AdminSettings>(`${root}/settings`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  sources: () => call<AdminSource[]>(`${root}/sources`),
  orders: (query = "") => call<AdminPurchaseOrder[]>(`${root}/orders${query}`),
  one: (id: string) => call<AdminPurchaseOrder>(`${root}/orders/${id}`),
  review: (id: string, body: object) =>
    call<AdminPurchaseOrder>(`${root}/orders/${id}/review`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  actualWeight: (id: string, actualWeightKg: number) =>
    call<{
      version: number;
      totalTmt: number;
      settledTmt: number;
      refundedTmt: number;
    }>(`${root}/orders/${id}/actual-weight`, {
      method: "POST",
      body: JSON.stringify({ actualWeightKg }),
    }),
  confirmAuthorization: (
    id: string,
    body: { externalReference: string; amountTmt: number; provider?: string },
  ) =>
    call<AdminPurchaseOrder>(`${root}/orders/${id}/confirm-authorization`, {
      method: "POST",
      body: JSON.stringify({ provider: "manual", ...body }),
    }),
  confirmRefund: (id: string, body: { externalReference: string }) =>
    call<AdminPurchaseOrder>(`${root}/orders/${id}/confirm-refund`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  status: (id: string, status: string, reason: string) =>
    call<AdminPurchaseOrder>(`${root}/orders/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason }),
    }),
};
