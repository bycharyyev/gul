import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { SocialCommentStatus, SocialPostStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import {
  CreateSocialCommentDto,
  CreateSocialPostDto,
  ModerateSocialCommentDto,
  ModerateSocialPostDto,
  ReportSocialPostDto,
  UpdateSocialPostDto,
} from "./dto/social-feed.dto";
import { SocialFeedService } from "./social-feed.service";

type User = { userId: string; role: string };
@ApiTags("social-feed")
@Controller("social-feed")
export class SocialFeedController {
  constructor(private readonly feed: SocialFeedService) {}
  @Get() list(@Query("cursor") cursor?: string, @Query("take") take?: string) {
    return this.feed.list(undefined, cursor, take ? Number(take) : 12);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Get("for-you") mineFeed(
    @CurrentUser() user: User,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.feed.list(user, cursor, take ? Number(take) : 12);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Get("mine") mine(
    @CurrentUser() user: User,
    @Query("cursor") cursor?: string,
    @Query("take") take?: string,
  ) {
    return this.feed.listMine(user.userId, cursor, take ? Number(take) : 20);
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post()
  create(@Body() dto: CreateSocialPostDto, @CurrentUser() user: User) {
    return this.feed.create(user.userId, dto);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Patch(":id") update(
    @Param("id") id: string,
    @Body() dto: UpdateSocialPostDto,
    @CurrentUser() user: User,
  ) {
    return this.feed.updateMine(id, user.userId, dto);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Delete(":id") remove(
    @Param("id") id: string,
    @CurrentUser() user: User,
  ) {
    return this.feed.removeMine(id, user.userId);
  }
  @Get(":id/comments") comments(@Param("id") id: string) {
    return this.feed.listComments(id);
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Post(":id/comments")
  comment(
    @Param("id") id: string,
    @Body() dto: CreateSocialCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.feed.comment(user.userId, id, dto);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Post(":id/like") like(
    @Param("id") id: string,
    @Body() body: { active?: boolean },
    @CurrentUser() user: User,
  ) {
    return this.feed.toggle(user.userId, id, "LIKE", body.active !== false);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Post(":id/save") save(
    @Param("id") id: string,
    @Body() body: { active?: boolean },
    @CurrentUser() user: User,
  ) {
    return this.feed.toggle(user.userId, id, "SAVE", body.active !== false);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Post(":id/view") view(
    @Param("id") id: string,
    @CurrentUser() user: User,
  ) {
    return this.feed.record(user.userId, id, "VIEW");
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post(":id/product-click")
  productClick(@Param("id") id: string, @CurrentUser() user: User) {
    return this.feed.record(user.userId, id, "PRODUCT_CLICK");
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post(":id/report")
  report(
    @Param("id") id: string,
    @Body() dto: ReportSocialPostDto,
    @CurrentUser() user: User,
  ) {
    return this.feed.report(user.userId, id, dto.reason);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/posts")
  adminPosts(@Query("status") status?: SocialPostStatus) {
    return this.feed.adminList(status);
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/reports")
  adminReports() {
    return this.feed.adminReportQueue();
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/posts/:id")
  moderatePost(
    @Param("id") id: string,
    @Body() dto: ModerateSocialPostDto,
    @CurrentUser() user: User,
  ) {
    return this.feed.moderatePost(id, dto, user.userId);
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/comments")
  adminComments(@Query("status") status?: SocialCommentStatus) {
    return this.feed.adminComments(status);
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/comments/:id")
  moderateComment(
    @Param("id") id: string,
    @Body() dto: ModerateSocialCommentDto,
    @CurrentUser() user: User,
  ) {
    return this.feed.moderateComment(id, dto, user.userId);
  }
}
