import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { ReferralsModule } from "../referrals/referrals.module";
import { EmailModule } from "../email/email.module";
import { PasswordResetService } from "./password-reset.service";
import { LoginAttemptsService } from "./login-attempts.service";
import { QueueModule } from "../queue/queue.module";

@Module({
  imports: [PassportModule, JwtModule.register({}), ReferralsModule, EmailModule, QueueModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PasswordResetService, LoginAttemptsService],
  exports: [AuthService],
})
export class AuthModule {}
