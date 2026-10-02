import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { PaymentProviderRegistry } from "./payment-provider.registry";
import { ManualPaymentProvider } from "./providers/manual-payment.provider";
import { FreeKassaPaymentProvider, freeKassaConfigFromEnv } from "./providers/freekassa-payment.provider";
import { REDIS_CLIENT } from "../queue/queue.module";
import type Redis from "ioredis";
import { PaymentReconciliationProcessor } from "./payment-reconciliation.processor";
import { PaymentWebhookProcessor } from "./payment-webhook.processor";

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentProviderRegistry,
    ManualPaymentProvider,
    // Factory: its configuration comes from the environment, not from injection.
    {
      provide: FreeKassaPaymentProvider,
      useFactory: (redis: Redis) => new FreeKassaPaymentProvider(redis, freeKassaConfigFromEnv()),
      inject: [REDIS_CLIENT],
    },
    PaymentReconciliationProcessor,
    PaymentWebhookProcessor,
  ],
  exports: [PaymentsService, PaymentProviderRegistry],
})
export class PaymentsModule {}
