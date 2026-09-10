import { Injectable } from "@nestjs/common";
import type { Order } from "@prisma/client";
import type { PaymentInitiationResult, PaymentProvider } from "./payment-provider.interface";

/**
 * Placeholder provider used until real gateways (SBP/card/MIR/crypto acquiring)
 * are integrated. Confirmation happens out-of-band (admin marks the order paid,
 * or a future webhook calls PaymentsService.confirmPayment).
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  readonly key = "manual";

  async initiate(order: Order, idempotencyKey: string): Promise<PaymentInitiationResult> {
    return { providerRef: `manual_${idempotencyKey}`, redirectUrl: null };
  }
}
