import { Module } from "@nestjs/common";
import { ContentPagesController } from "./content-pages.controller";
import { ContentPagesService } from "./content-pages.service";

@Module({
  controllers: [ContentPagesController],
  providers: [ContentPagesService],
})
export class ContentPagesModule {}
