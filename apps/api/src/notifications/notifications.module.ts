import { Module } from "@nestjs/common";
import { FirebasePushGateway } from "./firebase-push.gateway";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushAdminController } from "./push-admin.controller";
import { PushCampaignService } from "./push-campaign.service";
import { PushEventsService } from "./push-events.service";

@Module({
  controllers: [NotificationsController, PushAdminController],
  providers: [NotificationsService, FirebasePushGateway, PushEventsService, PushCampaignService],
  exports: [NotificationsService, PushEventsService],
})
export class NotificationsModule {}
