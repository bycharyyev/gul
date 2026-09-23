import type { OrderStatus } from "@prisma/client";
import type { TransitionMap } from "../common/state-machine";

/** Human-triggered transitions. Automatic payment and worker transitions stay in their owners. */
export const ADMIN_ORDER_TRANSITIONS: TransitionMap<OrderStatus> = {
  PENDING_PAYMENT: ["CANCELLED"],
  PAID: ["CANCELLED", "REFUNDED"],
  // PROCESSING means the operator request may already be in flight. Refunding here could give
  // the customer both money and service; resolve the operator outcome first.
  PROCESSING: ["FAILED"],
  COMPLETED: ["REFUNDED"],
  FAILED: ["CANCELLED", "REFUNDED"],
  REFUNDED: [],
  CANCELLED: [],
};
