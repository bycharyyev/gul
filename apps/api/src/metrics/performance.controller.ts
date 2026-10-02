import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { PERF_PERIODS, type PerfPeriod } from "./perf-metrics.service";
import { PerformanceService } from "./performance.service";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/performance")
export class PerformanceController {
  constructor(private performance: PerformanceService) {}

  /** `period`: 5m | 1h | 24h | 7d (default 1h). */
  @Get()
  overview(@Query("period") period?: string) {
    const p = (PERF_PERIODS as string[]).includes(period ?? "") ? (period as PerfPeriod) : "1h";
    return this.performance.overview(p);
  }
}
