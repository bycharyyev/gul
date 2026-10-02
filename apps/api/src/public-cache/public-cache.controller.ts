import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { PublicCacheService } from "./public-cache.service";

/** Staff-only view of how the public cache is doing. Aggregates only -- no keys, no payloads. */
@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/cache")
export class PublicCacheController {
  constructor(private cache: PublicCacheService) {}

  @Get("stats")
  async stats(@Query("days") days?: string) {
    const n = Math.min(Math.max(Number(days) || 1, 1), 7);
    return { node: this.cache.localStats(), daily: await this.cache.dailyStats(n) };
  }
}
