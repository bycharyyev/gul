import { Module } from "@nestjs/common";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";
import { SellersModule } from "../sellers/sellers.module";

@Module({
  imports: [SellersModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
