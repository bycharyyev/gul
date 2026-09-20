import { Module } from "@nestjs/common";
import { FirebasePushGateway } from "./firebase-push.gateway";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { PushEventsService } from "./push-events.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebasePushGateway, PushEventsService],
  exports: [NotificationsService, PushEventsService],
})
export class NotificationsModule {}
