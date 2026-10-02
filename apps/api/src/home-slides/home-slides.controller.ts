import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MarketplaceSettingsService } from "../marketplace-settings/marketplace-settings.service";
import { HomeSlidesService } from "./home-slides.service";
import { UpsertHomeSlideDto } from "./dto/upsert-home-slide.dto";
import { CreateSlideAdDto } from "./dto/create-slide-ad.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PublicCacheService } from "../public-cache/public-cache.service";
import { InvalidatesPublicCache } from "../public-cache/invalidates-public-cache.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("home-slides")
@Controller("home-slides")
export class HomeSlidesController {
  constructor(
    private slides: HomeSlidesService,
    private marketplaceSettings: MarketplaceSettingsService,
    private cache: PublicCacheService,
  ) {}

  // ---- Public ----

  @Get()
  listActive() {
    // Short TTL: what is "active" also changes with the clock (a slot starting or ending), which
    // no edit invalidates.
    return this.cache.wrap("content", "slides", {}, 30, () => this.slides.listActive());
  }

  @Get("ad-pricing")
  getAdPricing() {
    return this.cache.wrap("content", "ad-pricing", { kind: "slide" }, 60, () =>
      this.marketplaceSettings.getAdPricing("slide"),
    );
  }

  // ---- Seller: paid ad slides ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("seller")
  @InvalidatesPublicCache("content")
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
  @InvalidatesPublicCache("content")
  create(@Body() dto: UpsertHomeSlideDto) {
    return this.slides.createSlide(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  @InvalidatesPublicCache("content")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertHomeSlideDto>) {
    return this.slides.updateSlide(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  @InvalidatesPublicCache("content")
  remove(@Param("id") id: string) {
    return this.slides.deleteSlide(id);
  }
}
