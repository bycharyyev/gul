import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ReferralsService } from "./referrals.service";
import { UpdateReferralSettingsDto } from "./dto/update-referral-settings.dto";
import { UpdateUsernameDto } from "./dto/update-username.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("referrals")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("referrals")
export class ReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Get("me")
  me(@CurrentUser() user: AuthedUser) {
    return this.referrals.getMyReferralInfo(user.userId);
  }

}

@ApiTags("admin-referrals")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/referrals")
export class AdminReferralsController {
  constructor(private referrals: ReferralsService) {}

  @Get("settings")
  getSettings() {
    return this.referrals.getSettings();
  }

  @Roles("ADMIN")
  @Patch("settings")
  updateSettings(@Body() dto: UpdateReferralSettingsDto, @CurrentUser() user: AuthedUser) {
    return this.referrals.updateSettings(dto, user.userId);
  }

  @Get("ledger")
  listLedger() {
    return this.referrals.listLedger();
  }

  /// A code is what other people's invitation links already say, so it is not a customer's to
  /// rewrite -- see ReferralsService.changeUsername. Staff can still give a partner who
  /// advertises a code worth reading; that change is audited.
  @Roles("ADMIN")
  @Patch("users/:userId/username")
  changeUsername(
    @Param("userId") userId: string,
    @Body() dto: UpdateUsernameDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.referrals.changeUsername(userId, dto.username, user.userId);
  }

  @Get("leaderboard")
  leaderboard(@Query("from") from?: string, @Query("to") to?: string) {
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return this.referrals.leaderboard(from ? new Date(from) : defaultFrom, to ? new Date(to) : now);
  }
}
