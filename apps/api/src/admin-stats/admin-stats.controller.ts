import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminStatsService } from "./admin-stats.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";

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
