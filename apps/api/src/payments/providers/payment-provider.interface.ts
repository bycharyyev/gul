import type { Order } from "@prisma/client";

export interface PaymentInitiationResult {
  providerRef: string;
  /** Where to redirect the customer to complete payment; null for instantly-settled providers. */
  redirectUrl: string | null;
}

export type PaymentLookupStatus = "PENDING" | "SUCCEEDED" | "DECLINED" | "UNKNOWN" | "CANCELLED";

export interface PaymentLookupResult {
  status: PaymentLookupStatus;
  /** Required for SUCCEEDED: exact decimal amount and ISO/application currency. */
  amount?: string;
  currency?: string;
  providerStatus?: string;
  providerRef?: string;
  rawPayload?: Record<string, unknown>;
}

export interface VerifiedPaymentWebhook {
  /** Stable provider event id, not a timestamp or a locally generated id. */
  eventId: string;
  status: PaymentLookupStatus;
  /** Required for SUCCEEDED. The core verifies both against the persisted Payment before settlement. */
  amount?: string;
  currency?: string;
  providerTransactionId?: string;
  idempotencyKey?: string;
  providerStatus?: string;
  /** Allowlisted, non-secret diagnostic fields only. Never return headers or signatures. */
  payload?: Record<string, string | number | boolean | null>;
}

export interface PaymentWebhookInput {
  rawBody: Buffer;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Every payment method (card, SBP, MIR, crypto, manual) implements this contract.
 * New providers register in PaymentProviderRegistry — orders/payments code never
 * branches on provider name directly.
 */
export interface PaymentProvider {
  readonly key: string;
  /**
   * `idempotencyKey` is generated and persisted by PaymentsService *before* this is called, so a
   * real gateway integration can pass it through as its own idempotency key -- if the process
   * crashes after the gateway accepts the charge but before we record the result, retrying
   * `initiate` with the same key must not double-charge.
   */
  initiate(order: Order, idempotencyKey: string): Promise<PaymentInitiationResult>;

  /** Optional because a manual/offline provider has no remote transaction to query. */
  lookup?(input: {
    idempotencyKey: string;
    providerTransactionId: string | null;
  }): Promise<PaymentLookupResult>;

  /**
   * One method deliberately combines verification and parsing, so transport code cannot parse or
   * persist an untrusted event before the adapter has authenticated the exact raw bytes.
   */
  verifyAndParseWebhook?(input: PaymentWebhookInput): Promise<VerifiedPaymentWebhook>;
}
