import { Module } from "@nestjs/common";
import { HomeSlidesController } from "./home-slides.controller";
import { HomeSlidesService } from "./home-slides.service";

@Module({
  controllers: [HomeSlidesController],
  providers: [HomeSlidesService],
})
export class HomeSlidesModule {}
