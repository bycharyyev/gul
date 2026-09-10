import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { UpdateMeDto } from "./dto/update-me.dto";
import { UpdateLocaleDto } from "./dto/update-locale.dto";
import { ConfirmPasswordResetDto, RequestPasswordResetDto } from "./dto/password-reset.dto";
import { PasswordResetService } from "./password-reset.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { CurrentUser } from "./decorators/current-user.decorator";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private authService: AuthService,
    private passwordReset: PasswordResetService,
  ) {}

  // Every limit on this controller is keyed by IP, and an IP here is not a person: Turkmenistan
  // has effectively one mobile operator and thousands of subscribers leave through a handful of
  // public addresses. A cap tight enough to stop one attacker would stop a whole city with it,
  // and would bite hardest on the day the app takes off.
  //
  // So these are sized to catch a single machine working through many accounts, and the tight
  // limit that actually stops password guessing lives in LoginAttemptsService, keyed on the
  // account being attacked rather than the address doing the attacking.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * Unauthenticated by necessity -- the caller has lost access. Throttled harder than the rest:
   * every request here sends an email, so without a tight cap this is both a credential-guessing
   * surface and a way to use us to flood someone else's inbox.
   *
   * Always answers the same regardless of whether the address is registered; see
   * PasswordResetService.request.
   *
   * Kept the strictest of the group even after the widening: every request here spends real money
   * and a little of our sending reputation, and unlike a login there is no legitimate reason for
   * one address to ask thirty times a minute.
   */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post("password-reset/request")
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.passwordReset.request(dto.email);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @HttpCode(200)
  @Post("password-reset/confirm")
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.passwordReset.confirm(dto.email, dto.code, dto.newPassword);
  }

  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Refreshes are not guesses -- the caller already holds a token. This was the limit most likely
  // to hurt ordinary people behind a shared address, for no security gain at all.
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post("refresh")
  refresh(@Body("refreshToken") refreshToken: string) {
    return this.authService.refresh(refreshToken);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.authService.changePassword(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  getMe(@CurrentUser() user: { userId: string }) {
    return this.authService.getMe(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch("me")
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: { userId: string }) {
    return this.authService.updateMe(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch("me/locale")
  updateLocale(@Body() dto: UpdateLocaleDto, @CurrentUser() user: { userId: string }) {
    return this.authService.updateLocale(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("sessions")
  listSessions(@CurrentUser() user: { userId: string }) {
    return this.authService.listSessions(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete("sessions/:id")
  revokeSession(@Param("id") id: string, @CurrentUser() user: { userId: string }) {
    return this.authService.revokeSession(user.userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Post("logout-all")
  logoutAll(@CurrentUser() user: { userId: string }) {
    return this.authService.revokeAllSessions(user.userId);
  }
}
