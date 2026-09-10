import { Module } from "@nestjs/common";
import { SocialFeedController } from "./social-feed.controller";
import { SocialFeedService } from "./social-feed.service";

@Module({ controllers: [SocialFeedController], providers: [SocialFeedService] })
export class SocialFeedModule {}
