import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { ManualPaymentProvider } from "./providers/manual-payment.provider";
import { PaymentReconciliationProcessor } from "./payment-reconciliation.processor";
import { PaymentWebhookProcessor } from "./payment-webhook.processor";

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    ManualPaymentProvider,
    PaymentReconciliationProcessor,
    PaymentWebhookProcessor,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
