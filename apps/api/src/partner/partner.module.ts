import { Module } from "@nestjs/common";
import { PartnerController } from "./partner.controller";
import { ApiKeyGuard } from "./api-key.guard";
import { CatalogModule } from "../catalog/catalog.module";
import { OrdersModule } from "../orders/orders.module";

@Module({
  imports: [CatalogModule, OrdersModule],
  controllers: [PartnerController],
  providers: [ApiKeyGuard],
})
export class PartnerModule {}
