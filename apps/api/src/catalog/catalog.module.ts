import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  // For PaymentProviderRegistry: the admin payment-method list says which adapters are configured.
  imports: [PaymentsModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
