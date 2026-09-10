import { Module } from "@nestjs/common";
import { ReferralsController, AdminReferralsController } from "./referrals.controller";
import { ReferralsService } from "./referrals.service";

@Module({
  controllers: [ReferralsController, AdminReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
