import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { MarketplaceSettingsService } from "../marketplace-settings/marketplace-settings.service";
import { StoriesService } from "./stories.service";
import { UpsertStoryDto } from "./dto/upsert-story.dto";
import { CreateStoryAdDto } from "./dto/create-story-ad.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PublicCacheService } from "../public-cache/public-cache.service";
import { InvalidatesPublicCache } from "../public-cache/invalidates-public-cache.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("stories")
@Controller("stories")
export class StoriesController {
  constructor(
    private stories: StoriesService,
    private marketplaceSettings: MarketplaceSettingsService,
    private cache: PublicCacheService,
  ) {}

  // ---- Public ----

  @Get()
  listActive() {
    // Short TTL: what is "active" also changes with the clock (a slot starting or ending), which
    // no edit invalidates.
    return this.cache.wrap("content", "storys", {}, 30, () => this.stories.listActive());
  }

  @Get("ad-pricing")
  getAdPricing() {
    return this.cache.wrap("content", "ad-pricing", { kind: "story" }, 60, () =>
      this.marketplaceSettings.getAdPricing("story"),
    );
  }

  // ---- Seller: paid ad stories ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("seller")
  @InvalidatesPublicCache("content")
  createSellerAd(@Body() dto: CreateStoryAdDto, @CurrentUser() user: AuthedUser) {
    return this.stories.createSellerAd(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("seller/me")
  listMySellerAds(@CurrentUser() user: AuthedUser) {
    return this.stories.listMySellerAds(user.userId);
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin")
  listAll() {
    return this.stories.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin")
  @InvalidatesPublicCache("content")
  create(@Body() dto: UpsertStoryDto) {
    return this.stories.createStory(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  @InvalidatesPublicCache("content")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertStoryDto>) {
    return this.stories.updateStory(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  @InvalidatesPublicCache("content")
  remove(@Param("id") id: string) {
    return this.stories.deleteStory(id);
  }
}
