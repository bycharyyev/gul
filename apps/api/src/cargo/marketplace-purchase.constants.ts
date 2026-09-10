import type { MarketplacePurchaseStatus } from "@prisma/client";
import type { TransitionMap } from "../common/state-machine";

export const CUSTOMER_PURCHASE_TRANSITIONS: TransitionMap<MarketplacePurchaseStatus> = {
  DRAFT: ["CANCELLED"], MANUAL_REVIEW: ["CANCELLED"], QUOTED: ["AUTHORIZATION_PENDING", "CANCELLED"],
  AUTHORIZATION_PENDING: ["CANCELLED", "REFUND_PENDING"],
  AUTHORIZED: ["CANCELLED"], PURCHASING: [], PURCHASED: [], AT_WAREHOUSE: [], FINAL_PAYMENT_DUE: [],
  READY_TO_SHIP: [], SHIPPED: [], DELIVERED: [], CANCELLED: [], REFUND_PENDING: [], REFUNDED: [],
};

export const ADMIN_PURCHASE_TRANSITIONS: TransitionMap<MarketplacePurchaseStatus> = {
  DRAFT: ["MANUAL_REVIEW", "CANCELLED"], MANUAL_REVIEW: ["QUOTED", "CANCELLED"],
  QUOTED: ["CANCELLED"], AUTHORIZATION_PENDING: ["AUTHORIZED", "CANCELLED", "REFUND_PENDING"], AUTHORIZED: ["PURCHASING", "CANCELLED", "REFUND_PENDING"],
  PURCHASING: ["PURCHASED", "REFUND_PENDING"], PURCHASED: ["AT_WAREHOUSE", "REFUND_PENDING"],
  AT_WAREHOUSE: ["FINAL_PAYMENT_DUE", "READY_TO_SHIP", "REFUND_PENDING"],
  FINAL_PAYMENT_DUE: ["READY_TO_SHIP", "REFUND_PENDING"], READY_TO_SHIP: ["SHIPPED", "REFUND_PENDING"],
  SHIPPED: ["DELIVERED", "REFUND_PENDING"], DELIVERED: [], CANCELLED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"], REFUNDED: [],
};

export const MARKETPLACE_HOSTS = {
  OZON: ["ozon.ru", "www.ozon.ru"],
  WILDBERRIES: ["wildberries.ru", "www.wildberries.ru"],
  ALIEXPRESS: ["aliexpress.com", "www.aliexpress.com", "aliexpress.ru"],
  TRENDYOL: ["trendyol.com", "www.trendyol.com"],
  YANDEX_MARKET: ["market.yandex.ru"],
  TAOBAO: ["taobao.com", "www.taobao.com", "item.taobao.com"],
} as const;
