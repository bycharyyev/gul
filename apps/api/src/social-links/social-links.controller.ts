import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SocialLinksService } from "./social-links.service";
import { UpsertSocialLinkDto } from "./dto/upsert-social-link.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@ApiTags("social-links")
@Controller("social-links")
export class SocialLinksController {
  constructor(private socialLinks: SocialLinksService) {}

  // ---- Public ----

  @Get()
  listActive() {
    return this.socialLinks.listActive();
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin")
  listAll() {
    return this.socialLinks.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin")
  create(@Body() dto: UpsertSocialLinkDto) {
    return this.socialLinks.createLink(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertSocialLinkDto>) {
    return this.socialLinks.updateLink(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  remove(@Param("id") id: string) {
    return this.socialLinks.deleteLink(id);
  }
}
