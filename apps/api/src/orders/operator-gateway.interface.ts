import type { Order } from "@prisma/client";

export interface OperatorTopupResult {
  outcome: "CONFIRMED" | "DECLINED" | "UNKNOWN";
  operatorRef?: string;
  errorMessage?: string;
}

export const OPERATOR_GATEWAY = "operator-gateway";

/**
 * Talks to the actual mobile operator / reseller API that performs the top-up.
 * Swap MockOperatorGateway for a real implementation per service without
 * touching orders/queue code.
 */
export interface OperatorGateway {
  /**
   * `idempotencyKey` (the order id) is stable across retries of the same order -- a real gateway
   * implementation should pass it through to the operator/reseller API as its own idempotency
   * key where supported, so a retried call after an unknown-outcome crash can't double-charge.
   */
  topUp(order: Order, idempotencyKey: string): Promise<OperatorTopupResult>;
}
