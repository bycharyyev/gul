import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SellersService } from "./sellers.service";
import { CreateSellerDto } from "./dto/create-seller.dto";
import { UpdateSellerDto } from "./dto/update-seller.dto";
import { CreateSellerApplicationDto } from "./dto/create-seller-application.dto";
import { ApplyAsMeDto } from "./dto/apply-as-me.dto";
import { ReviewApplicationDto } from "./dto/review-application.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { SellerApplicationStatus } from "@prisma/client";

type AuthedUser = { userId: string; role: string };

@ApiTags("sellers")
@Controller("sellers")
export class SellersController {
  constructor(private sellers: SellersService) {}

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin")
  listSellers() {
    return this.sellers.listSellers();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("admin")
  createSeller(@Body() dto: CreateSellerDto) {
    return this.sellers.createSeller(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Patch("admin/:id")
  updateSellerAdmin(@Param("id") id: string, @Body() dto: UpdateSellerDto) {
    return this.sellers.updateSellerAdmin(id, dto);
  }

  // ---- Seller self-service ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("me")
  getMyProfile(@CurrentUser() user: AuthedUser) {
    return this.sellers.getMyProfile(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Patch("me")
  updateMyProfile(@Body() dto: UpdateSellerDto, @CurrentUser() user: AuthedUser) {
    return this.sellers.updateMyProfile(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("me/stats")
  getMyStats(@CurrentUser() user: AuthedUser) {
    return this.sellers.getMyStats(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("me/timeseries")
  getMyTimeseries(@CurrentUser() user: AuthedUser, @Query("days") days?: string) {
    return this.sellers.getMyTimeseries(user.userId, days ? Number(days) : 30);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("me/top-products")
  getMyTopProducts(@CurrentUser() user: AuthedUser, @Query("limit") limit?: string) {
    return this.sellers.getMyTopProducts(user.userId, limit ? Number(limit) : 5);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("me/telegram")
  getTelegramStatus(@CurrentUser() user: AuthedUser) {
    return this.sellers.getTelegramStatus(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("me/telegram/link-code")
  generateTelegramLinkCode(@CurrentUser() user: AuthedUser) {
    return this.sellers.generateTelegramLinkCode(user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @HttpCode(204)
  @Delete("me/telegram")
  unlinkTelegram(@CurrentUser() user: AuthedUser) {
    return this.sellers.unlinkTelegram(user.userId);
  }

  // ---- Seller applications (public self-signup, admin-moderated) ----

  @Post("apply")
  applyForSeller(@Body() dto: CreateSellerApplicationDto) {
    return this.sellers.applyForSeller(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  /**
   * Apply from inside the app, as the account already signed in.
   *
   * The public form cannot serve somebody who already has an account -- it asks for a phone that
   * is by definition taken. This one takes neither phone nor password: both come from the token.
   */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("apply-as-me")
  applyAsMe(@Body() dto: ApplyAsMeDto, @CurrentUser() user: AuthedUser) {
    return this.sellers.applyAsCurrentUser(user.userId, dto);
  }

  @Get("applications")
  listApplications(@Query("status") status?: SellerApplicationStatus) {
    return this.sellers.listApplications(status);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("applications/:id/approve")
  approveApplication(@Param("id") id: string, @Body() dto: ReviewApplicationDto, @CurrentUser() user: AuthedUser) {
    return this.sellers.approveApplication(id, dto, user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post("applications/:id/reject")
  rejectApplication(@Param("id") id: string, @Body() dto: ReviewApplicationDto, @CurrentUser() user: AuthedUser) {
    return this.sellers.rejectApplication(id, dto, user.userId);
  }

  // ---- Public ----

  @Get(":handle")
  getPublicByHandle(@Param("handle") handle: string) {
    return this.sellers.getPublicByHandle(handle);
  }
}
