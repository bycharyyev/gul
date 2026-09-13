import { Module } from "@nestjs/common";
import { ManagedLinksController } from "./managed-links.controller";
import { ManagedLinksService } from "./managed-links.service";

@Module({
  controllers: [ManagedLinksController],
  providers: [ManagedLinksService],
})
export class ManagedLinksModule {}
