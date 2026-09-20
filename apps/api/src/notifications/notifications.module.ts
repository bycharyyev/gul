import { Module } from "@nestjs/common";
import { FirebasePushGateway } from "./firebase-push.gateway";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebasePushGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
