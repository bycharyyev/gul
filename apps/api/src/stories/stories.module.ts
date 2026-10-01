import { Module } from "@nestjs/common";
import { MarketplaceSettingsModule } from "../marketplace-settings/marketplace-settings.module";
import { StoriesController } from "./stories.controller";
import { StoriesService } from "./stories.service";

@Module({
  imports: [MarketplaceSettingsModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}
