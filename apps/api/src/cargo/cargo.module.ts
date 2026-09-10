import { Module } from "@nestjs/common";
import { CargoController } from "./cargo.controller";
import { CargoAdminController } from "./cargo-admin.controller";
import { CargoService } from "./cargo.service";
import { EmailModule } from "../email/email.module";
import { MarketplacePurchaseController } from "./marketplace-purchase.controller";
import { MarketplacePurchaseAdminController } from "./marketplace-purchase-admin.controller";
import { MarketplacePurchaseService } from "./marketplace-purchase.service";
import { ManualReviewMarketplaceAdapter } from "./marketplace-source.adapter";

@Module({
  imports: [EmailModule],
  controllers: [CargoController, CargoAdminController, MarketplacePurchaseController, MarketplacePurchaseAdminController],
  providers: [CargoService, MarketplacePurchaseService, ManualReviewMarketplaceAdapter],
})
export class CargoModule {}
