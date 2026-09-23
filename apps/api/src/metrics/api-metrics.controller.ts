import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { ApiMetricsService } from "./api-metrics.service";
import { PrismaService } from "../prisma/prisma.service";

@ApiTags("admin-api-usage")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/api-usage")
export class ApiMetricsController {
  constructor(
    private metrics: ApiMetricsService,
    private prisma: PrismaService,
  ) {}

  /**
   * Traffic and failures for the last `days` days.
   *
   * Partner rows are joined to their key's name here rather than in the metrics service: Redis
   * holds only the id, deliberately, so a renamed or deleted key does not leave a stale label in
   * a month of counters.
   */
  @Get()
  async usage(@Query("days") days?: string) {
    // 1..35 -- 35 is the retention window, so asking for more would silently return less.
    const window = Math.min(Math.max(Number(days) || 7, 1), 35);
    const summary = await this.metrics.summary(window);

    const ids = summary.byApiKey.map((row) => row.apiKeyId);
    const keys = ids.length
      ? await this.prisma.apiKey.findMany({
          where: { id: { in: ids } },
          // Never the hash. See the note in CLAUDE.md about selecting ApiKey fields explicitly.
          select: {
            id: true,
            name: true,
            ownerLabel: true,
            // Which shop, if any. Without this every seller's traffic reads as one more partner
            // in the list, and "who is hammering the API" stops being answerable.
            seller: { select: { id: true, handle: true, shopName: true } },
          },
        })
      : [];
    const byId = new Map(keys.map((k) => [k.id, k]));

    return {
      ...summary,
      byApiKey: summary.byApiKey.map((row) => {
        const key = byId.get(row.apiKeyId);
        return {
          ...row,
          name: key?.name ?? null,
          ownerLabel: key?.ownerLabel ?? null,
          // A deleted key keeps its counters and resolves to nothing here, so it reads as a
          // partner. Reporting it as "unknown" would be more precise and less useful: what the
          // reader wants from this column is which of two surfaces the traffic hit.
          kind: (key?.seller ? "shop" : "partner") as "shop" | "partner",
          shop: key?.seller
            ? { id: key.seller.id, handle: key.seller.handle, shopName: key.seller.shopName }
            : null,
        };
      }),
    };
  }
}
