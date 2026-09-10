import { canTransition } from "../common/state-machine";
import { ADMIN_GALLERY_ORDER_TRANSITIONS, SELLER_GALLERY_ORDER_TRANSITIONS } from "./gallery-order-state-machine";

describe("gallery order state machine", () => {
  it("allows normal fulfilment", () => {
    expect(canTransition(ADMIN_GALLERY_ORDER_TRANSITIONS, "PAID", "PROCESSING")).toBe(true);
    expect(canTransition(SELLER_GALLERY_ORDER_TRANSITIONS, "PROCESSING", "DELIVERED")).toBe(true);
  });

  it("does not allow skipping payment or reopening a terminal order", () => {
    expect(canTransition(ADMIN_GALLERY_ORDER_TRANSITIONS, "PENDING_PAYMENT", "DELIVERED")).toBe(false);
    expect(canTransition(SELLER_GALLERY_ORDER_TRANSITIONS, "DELIVERED", "PROCESSING")).toBe(false);
  });

  it("reserves payment confirmation for staff", () => {
    expect(canTransition(ADMIN_GALLERY_ORDER_TRANSITIONS, "PENDING_PAYMENT", "PAID")).toBe(true);
    expect(canTransition(SELLER_GALLERY_ORDER_TRANSITIONS, "PENDING_PAYMENT", "PAID")).toBe(false);
  });
});
