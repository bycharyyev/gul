import { Module } from "@nestjs/common";
import { AssistantSettingsAdminController, AssistantSettingsPublicController } from "./assistant-settings.controller";
import { AssistantSettingsService } from "./assistant-settings.service";

@Module({
  controllers: [AssistantSettingsPublicController, AssistantSettingsAdminController],
  providers: [AssistantSettingsService],
})
export class AssistantSettingsModule {}
