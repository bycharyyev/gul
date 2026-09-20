import { Module } from "@nestjs/common";
import { SocialFeedController } from "./social-feed.controller";
import { SocialFeedService } from "./social-feed.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({ imports: [NotificationsModule], controllers: [SocialFeedController], providers: [SocialFeedService] })
export class SocialFeedModule {}
