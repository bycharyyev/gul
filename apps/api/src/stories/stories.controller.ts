import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { StoriesService, STORY_AD_PRICE_TMT, STORY_AD_DURATION_DAYS } from "./stories.service";
import { UpsertStoryDto } from "./dto/upsert-story.dto";
import { CreateStoryAdDto } from "./dto/create-story-ad.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("stories")
@Controller("stories")
export class StoriesController {
  constructor(private stories: StoriesService) {}

  // ---- Public ----

  @Get()
  listActive() {
    return this.stories.listActive();
  }

  @Get("ad-pricing")
  getAdPricing() {
    return { priceTmt: STORY_AD_PRICE_TMT, durationDays: STORY_AD_DURATION_DAYS };
  }

  // ---- Seller: paid ad stories ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post("seller")
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
  create(@Body() dto: UpsertStoryDto) {
    return this.stories.createStory(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertStoryDto>) {
    return this.stories.updateStory(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  remove(@Param("id") id: string) {
    return this.stories.deleteStory(id);
  }
}
