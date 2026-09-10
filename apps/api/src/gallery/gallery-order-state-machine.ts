import type { GalleryOrderStatus } from "@prisma/client";
import type { TransitionMap } from "../common/state-machine";

/** Staff also own the manual payment-confirmation edge used by the current provider. */
export const ADMIN_GALLERY_ORDER_TRANSITIONS: TransitionMap<GalleryOrderStatus> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

/** Sellers can fulfil or cancel a paid order but cannot attest that customer money arrived. */
export const SELLER_GALLERY_ORDER_TRANSITIONS: TransitionMap<GalleryOrderStatus> = {
  PENDING_PAYMENT: [],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};
