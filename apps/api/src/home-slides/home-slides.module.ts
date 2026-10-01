import { Module } from "@nestjs/common";
import { MarketplaceSettingsModule } from "../marketplace-settings/marketplace-settings.module";
import { HomeSlidesController } from "./home-slides.controller";
import { HomeSlidesService } from "./home-slides.service";

@Module({
  imports: [MarketplaceSettingsModule],
  controllers: [HomeSlidesController],
  providers: [HomeSlidesService],
})
export class HomeSlidesModule {}
