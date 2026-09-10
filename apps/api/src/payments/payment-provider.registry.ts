import { Injectable, NotFoundException } from "@nestjs/common";
import { ManualPaymentProvider } from "./providers/manual-payment.provider";
import type { PaymentProvider } from "./providers/payment-provider.interface";

/**
 * Every acquiring integration plugs in here and nowhere else -- orders/payments code resolves a
 * provider by `PaymentMethod.provider` and never branches on its name.
 *
 * No real acquirer is wired up yet (which processor to use is still an open business decision),
 * so `manual` is the only registered provider. Adding one means: implement PaymentProvider in
 * `providers/`, register it below behind its own configuration check, and insert a PaymentMethod
 * row whose `provider` equals that adapter's `key`. Nothing else in the payment pipeline --
 * initiation guard, webhook inbox, reconciliation -- needs to change; see
 * docs/adr/0005-real-provider-adapters.md.
 */
@Injectable()
export class PaymentProviderRegistry {
  private providers = new Map<string, PaymentProvider>();

  constructor(manual: ManualPaymentProvider) {
    this.register(manual);
  }

  register(provider: PaymentProvider) {
    this.providers.set(provider.key, provider);
  }

  resolve(key: string): PaymentProvider {
    const provider = this.providers.get(key);
    if (!provider) throw new NotFoundException(`Unknown payment provider: ${key}`);
    return provider;
  }
}
