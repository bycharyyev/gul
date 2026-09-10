import { Module } from "@nestjs/common";
import { SocialLinksController } from "./social-links.controller";
import { SocialLinksService } from "./social-links.service";

@Module({
  controllers: [SocialLinksController],
  providers: [SocialLinksService],
})
export class SocialLinksModule {}
