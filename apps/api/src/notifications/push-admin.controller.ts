import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { AudienceDto, CreateCampaignDto, CreateTemplateDto, SendOneDto, UpdateTemplateDto } from "./push-admin.dto";
import { PushCampaignService } from "./push-campaign.service";
import { SUPPORTED_COUNTRIES } from "../common/phone-country";

/**
 * Push management for staff: templates, campaigns to an audience, a message to one person, and
 * statistics. Sending is limited so a stuck browser tab cannot fire the same campaign repeatedly.
 */
@ApiTags("admin-push")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/push")
export class PushAdminController {
  constructor(private readonly push: PushCampaignService) {}

  @Get("countries")
  countries() {
    return SUPPORTED_COUNTRIES.map(({ code, name }) => ({ code, name }));
  }

  // ---- Templates ----

  @Get("templates")
  templates() {
    return this.push.listTemplates();
  }

  @Post("templates")
  createTemplate(@CurrentUser() user: { userId: string }, @Body() dto: CreateTemplateDto) {
    return this.push.createTemplate(dto, user.userId);
  }

  @Patch("templates/:id")
  updateTemplate(@CurrentUser() user: { userId: string }, @Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.push.updateTemplate(id, dto, user.userId);
  }

  @Delete("templates/:id")
  deleteTemplate(@CurrentUser() user: { userId: string }, @Param("id") id: string) {
    return this.push.deleteTemplate(id, user.userId);
  }

  // ---- Campaigns ----

  @Post("audience/preview")
  @HttpCode(200)
  previewAudience(@Body() audience: AudienceDto) {
    return this.push.previewAudience(audience);
  }

  @Get("campaigns")
  campaigns(@Query("limit") limit?: string) {
    return this.push.listCampaigns(limit ? Number(limit) : 50);
  }

  @Get("campaigns/:id")
  campaign(@Param("id") id: string) {
    return this.push.getCampaign(id);
  }

  @Post("campaigns")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  createCampaign(@CurrentUser() user: { userId: string }, @Body() dto: CreateCampaignDto) {
    return this.push.createCampaign(dto, user.userId);
  }

  @Post("campaigns/:id/send")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  send(@CurrentUser() user: { userId: string }, @Param("id") id: string) {
    return this.push.send(id, user.userId);
  }

  @Post("campaigns/:id/cancel")
  @HttpCode(200)
  cancel(@CurrentUser() user: { userId: string }, @Param("id") id: string) {
    return this.push.cancel(id, user.userId);
  }

  // ---- One person ----

  @Get("users")
  searchUsers(@Query("q") q = "") {
    return this.push.searchUsers(q);
  }

  @Post("send-one")
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  sendOne(@CurrentUser() user: { userId: string }, @Body() dto: SendOneDto) {
    return this.push.sendOne(dto, user.userId);
  }

  // ---- Statistics ----

  @Get("stats")
  stats(@Query("days") days?: string) {
    return this.push.overview(days ? Number(days) : 30);
  }
}
