import { Module } from "@nestjs/common";
import { MarketplaceSettingsController } from "./marketplace-settings.controller";
import { MarketplaceSettingsService } from "./marketplace-settings.service";

@Module({
  controllers: [MarketplaceSettingsController],
  providers: [MarketplaceSettingsService],
  // GalleryService reads the current rate at order-creation time to snapshot it.
  exports: [MarketplaceSettingsService],
})
export class MarketplaceSettingsModule {}
