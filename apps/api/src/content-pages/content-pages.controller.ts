import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ContentPagesService } from "./content-pages.service";
import { UpsertContentPageDto } from "./dto/upsert-content-page.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { PublicCacheService } from "../public-cache/public-cache.service";
import { InvalidatesPublicCache } from "../public-cache/invalidates-public-cache.decorator";

@ApiTags("content-pages")
@Controller("content-pages")
export class ContentPagesController {
  constructor(
    private pages: ContentPagesService,
    private cache: PublicCacheService,
  ) {}

  // ---- Public ----

  @Get(":slug")
  getBySlug(@Param("slug") slug: string) {
    return this.cache.wrap("content", "page", { slug }, 300, () => this.pages.getBySlug(slug));
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/all")
  listAll() {
    return this.pages.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin")
  @InvalidatesPublicCache("content")
  create(@Body() dto: UpsertContentPageDto) {
    return this.pages.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  @InvalidatesPublicCache("content")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertContentPageDto>) {
    return this.pages.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  @InvalidatesPublicCache("content")
  remove(@Param("id") id: string) {
    return this.pages.delete(id);
  }
}
