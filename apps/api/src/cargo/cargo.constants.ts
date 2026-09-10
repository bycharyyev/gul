import type { ShipmentStatus } from "@prisma/client";
import type { TransitionMap } from "../common/state-machine";

export type ShipmentStatusValue = ShipmentStatus;

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "DRAFT",
  "QUOTE_CREATED",
  "PENDING_PAYMENT",
  "PAID",
  "PICKUP_REQUESTED",
  "PICKUP_CONFIRMED",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "ON_HOLD",
  "EXCEPTION",
];

/**
 * Whitelisted admin-triggered transitions -- same shape and same reason as
 * orders.service.ts's ADMIN_STATUS_TRANSITIONS. ON_HOLD/EXCEPTION are reachable from most active
 * states but their own way out is resolved manually by an admin picking any forward-or-cancel
 * status, not an automatic transition -- see the second map below.
 */
export const SHIPMENT_STATUS_TRANSITIONS: TransitionMap<ShipmentStatus> = {
  DRAFT: ["CANCELLED"],
  QUOTE_CREATED: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PICKUP_REQUESTED", "CANCELLED"],
  PICKUP_REQUESTED: ["PICKUP_CONFIRMED", "ON_HOLD", "CANCELLED"],
  PICKUP_CONFIRMED: ["PICKED_UP", "ON_HOLD"],
  PICKED_UP: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["ARRIVED_DESTINATION", "EXCEPTION"],
  ARRIVED_DESTINATION: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"],
  READY_FOR_PICKUP: ["DELIVERED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "EXCEPTION"],
  // Resolved manually: an admin picks whichever forward status is actually true once the hold or
  // exception is cleared, so both allow the full set of "normal progress" destinations rather than
  // one fixed next step.
  ON_HOLD: [
    "PICKUP_REQUESTED",
    "PICKUP_CONFIRMED",
    "PICKED_UP",
    "IN_TRANSIT",
    "ARRIVED_DESTINATION",
    "CANCELLED",
  ],
  EXCEPTION: ["PICKED_UP", "IN_TRANSIT", "ARRIVED_DESTINATION", "OUT_FOR_DELIVERY", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};
