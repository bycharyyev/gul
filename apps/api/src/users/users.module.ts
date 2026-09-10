import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { ReferralsModule } from "../referrals/referrals.module";

@Module({
  imports: [ReferralsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
