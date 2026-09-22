import { Module } from "@nestjs/common";
import { AnalyticsLinksController } from "./analytics-links.controller";
import { AnalyticsLinksService } from "./analytics-links.service";

@Module({
  controllers: [AnalyticsLinksController],
  providers: [AnalyticsLinksService],
})
export class AnalyticsLinksModule {}
