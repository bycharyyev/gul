import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ManagedLinksService } from "./managed-links.service";
import { UpsertManagedLinkDto } from "./dto/upsert-managed-link.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

@ApiTags("managed-links")
@Controller("managed-links")
export class ManagedLinksController {
  constructor(private links: ManagedLinksService) {}

  // ---- Public: what gulyaly.com/l/:slug on the storefront resolves through ----

  @Get(":slug")
  resolve(@Param("slug") slug: string) {
    return this.links.resolve(slug);
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/all")
  listAll() {
    return this.links.listAll();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin")
  create(@Body() dto: UpsertManagedLinkDto) {
    return this.links.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/:id")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertManagedLinkDto>) {
    return this.links.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/:id")
  remove(@Param("id") id: string) {
    return this.links.delete(id);
  }
}
