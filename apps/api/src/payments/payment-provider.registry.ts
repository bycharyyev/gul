import { Injectable, NotFoundException } from "@nestjs/common";
import { ManualPaymentProvider } from "./providers/manual-payment.provider";
import { FreeKassaPaymentProvider } from "./providers/freekassa-payment.provider";
import { HeleketPaymentProvider } from "./providers/heleket-payment.provider";
import { CryptoCloudPaymentProvider } from "./providers/cryptocloud-payment.provider";
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
  /** Every adapter this build knows, configured or not -- what the admin console may choose from. */
  private readonly known: { key: string; label: string; configured: boolean }[];

  constructor(
    manual: ManualPaymentProvider,
    freekassa: FreeKassaPaymentProvider,
    heleket: HeleketPaymentProvider,
    cryptocloud: CryptoCloudPaymentProvider,
  ) {
    this.register(manual);
    // Only with credentials in .env: an unconfigured deployment does not expose it at all
    // (its webhook URL then answers "Unknown payment provider").
    if (freekassa.isConfigured()) this.register(freekassa);
    if (heleket.isConfigured()) this.register(heleket);
    if (cryptocloud.isConfigured()) this.register(cryptocloud);
    this.known = [
      { key: manual.key, label: "Ручное подтверждение", configured: true },
      { key: freekassa.key, label: "FreeKassa (карты / СБП)", configured: freekassa.isConfigured() },
      { key: heleket.key, label: "Heleket (криптовалюта)", configured: heleket.isConfigured() },
      { key: cryptocloud.key, label: "CryptoCloud / Trybit (криптовалюта)", configured: cryptocloud.isConfigured() },
    ];
  }

  /** Adapters an admin can assign to a payment method, with whether each has its keys here. */
  catalog(): { key: string; label: string; configured: boolean }[] {
    return this.known.map((p) => ({ ...p }));
  }

  /** Whether this build has an adapter with this key at all (configured or not). */
  knows(key: string): boolean {
    return this.known.some((p) => p.key === key);
  }

  /** Whether an adapter with this key is registered (configured) on this node. */
  has(key: string): boolean {
    return this.providers.has(key);
  }

  /** The provider's required plain-text webhook answer, if it has one. */
  webhookAck(key: string): string | undefined {
    return this.providers.get(key)?.webhookAck;
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
