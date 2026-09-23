// Thin wrapper around the two trackers loaded in components/analytics.tsx. Both are optional at
// runtime (a tracker only exists once its provider script has actually loaded), and Yandex
// Metrika's reachGoal needs its own counter id repeated on every call -- there's no ambient
// "the current counter" the way gtag has.
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    ym?: (...args: unknown[]) => void;
  }
}

const YANDEX_METRIKA_ID = process.env.NEXT_PUBLIC_YM_ID;

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  price?: number;
  quantity?: number;
};

function gaEvent(name: string, params: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", name, params);
}

function ymGoal(goal: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.ym || !YANDEX_METRIKA_ID) return;
  window.ym(Number(YANDEX_METRIKA_ID), "reachGoal", goal, params);
}

export function trackViewItem(item: AnalyticsItem, currency = "TMT") {
  gaEvent("view_item", { currency, value: item.price ?? 0, items: [item] });
  ymGoal("view_item", { item_id: item.item_id, item_name: item.item_name });
}

export function trackBeginCheckout(item: AnalyticsItem, value: number, currency = "TMT") {
  gaEvent("begin_checkout", { currency, value, items: [item] });
  ymGoal("begin_checkout", { item_id: item.item_id, item_name: item.item_name });
}

export function trackPurchase(opts: {
  transactionId: string;
  value: number;
  currency: string;
  items: AnalyticsItem[];
}) {
  gaEvent("purchase", {
    transaction_id: opts.transactionId,
    value: opts.value,
    currency: opts.currency,
    items: opts.items,
  });
  ymGoal("purchase", { transaction_id: opts.transactionId, value: opts.value });
}
