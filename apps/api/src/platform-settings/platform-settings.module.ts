import { Module } from "@nestjs/common";
import { PlatformSettingsService } from "./platform-settings.service";
import { PlatformSettingsController } from "./platform-settings.controller";

@Module({
  providers: [PlatformSettingsService],
  controllers: [PlatformSettingsController],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
