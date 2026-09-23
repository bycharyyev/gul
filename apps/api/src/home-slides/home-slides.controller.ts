import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { HomeSlidesService, SLIDE_AD_PRICE_TMT, SLIDE_AD_DURATION_DAYS } from "./home-slides.service";
import { UpsertHomeSlideDto } from "./dto/upsert-home-slide.dto";
import { CreateSlideAdDto } from "./dto/create-slide-ad.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("home-slides")
@Controller("home-slides")
export class HomeSlidesController {
  constructor(private slides: HomeSlidesService) {}

  // ---- Public ----

  @Get()
  listActive() {
    return this.slides.listActive();
  }

  @Get("ad-pricing")
  getAdPricing() {
    return { priceTmt: SLIDE_AD_PRICE_TMT, durationDays: SLIDE_AD_DURATION_DAYS };
  }

  // ---- Seller: paid ad slides ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("seller")
  createSellerAd(@Body() dto: CreateSlideAdDto, @CurrentUser() user: AuthedUser) {
    return this.slides.createSellerAd(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("seller/me")
  listMySellerAds(@CurrentUser() user: AuthedUser) {
    return this.slides.listMySellerAds(user.userId);
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin")
  listAll() {
    return this.slides.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin")
  create(@Body() dto: UpsertHomeSlideDto) {
    return this.slides.createSlide(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertHomeSlideDto>) {
    return this.slides.updateSlide(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  remove(@Param("id") id: string) {
    return this.slides.deleteSlide(id);
  }
}
