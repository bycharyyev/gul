import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminStatsService } from "./admin-stats.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { getOpenApiDocument } from "../common/openapi-document";

@ApiTags("admin-stats")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/stats")
export class AdminStatsController {
  constructor(private stats: AdminStatsService) {}

  @Get()
  get() {
    return this.stats.getStats();
  }

  // The API's own route map, for the admin console's API page. Staff-only because the public
  // /docs is switched off in production (S-04).
  @Get("openapi")
  getOpenApi() {
    return getOpenApiDocument() ?? { paths: {} };
  }

  @Get("orders-timeseries")
  getTimeseries(@Query("days") days?: string) {
    return this.stats.getOrdersTimeseries(days ? Number(days) : 30);
  }

  @Roles("ADMIN")
  @Get("database")
  getDatabaseOverview() {
    return this.stats.getDatabaseOverview();
  }
}
