import { Module } from "@nestjs/common";
import { SubdomainsController } from "./subdomains.controller";
import { SubdomainsService } from "./subdomains.service";

@Module({
  controllers: [SubdomainsController],
  providers: [SubdomainsService],
})
export class SubdomainsModule {}
