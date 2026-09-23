import { Module } from "@nestjs/common";
import { SellersController } from "./sellers.controller";
import { SellersService } from "./sellers.service";
import { ReferralsModule } from "../referrals/referrals.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [ReferralsModule, EmailModule],
  controllers: [SellersController],
  providers: [SellersService],
  exports: [SellersService],
})
export class SellersModule {}
