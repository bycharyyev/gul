import { Body, Controller, Get, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { EmailVerificationService } from "./email-verification.service";
import { ConfirmEmailVerificationDto, RequestEmailVerificationDto } from "./dto/email-verification.dto";
import { UpdateEmailPreferenceDto } from "./dto/email-preference.dto";
import { EmailPreferenceService } from "./email-preference.service";

/**
 * Self-service email verification for the logged-in user. Everything here acts on the caller's
 * own account -- the user id comes from the JWT, never from the request body, so one user can
 * never start or confirm a verification for another.
 */
@ApiTags("account")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("account/email")
export class EmailVerificationController {
  constructor(
    private verification: EmailVerificationService,
    private preferences: EmailPreferenceService,
  ) {}

  @Get()
  status(@CurrentUser() user: { userId: string }) {
    return this.verification.status(user.userId);
  }

  @Post("request")
  request(@CurrentUser() user: { userId: string }, @Body() dto: RequestEmailVerificationDto) {
    return this.verification.request(user.userId, dto.email);
  }

  @Post("confirm")
  confirm(@CurrentUser() user: { userId: string }, @Body() dto: ConfirmEmailVerificationDto) {
    return this.verification.confirm(user.userId, dto.code);
  }

  @Get("preferences")
  getPreferences(@CurrentUser() user: { userId: string }) {
    return this.preferences.get(user.userId);
  }

  @Patch("preferences")
  updatePreferences(@CurrentUser() user: { userId: string }, @Body() dto: UpdateEmailPreferenceDto) {
    return this.preferences.update(user.userId, dto);
  }
}
