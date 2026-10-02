import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CatalogService } from "./catalog.service";
import { UpsertServiceDto } from "./dto/upsert-service.dto";
import { UpsertRateDto } from "./dto/upsert-rate.dto";
import { SetServiceCostDto } from "./dto/set-service-cost.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PublicCacheService } from "../public-cache/public-cache.service";
import { InvalidatesPublicCache } from "../public-cache/invalidates-public-cache.decorator";

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(
    private catalog: CatalogService,
    private cache: PublicCacheService,
  ) {}

  // ---- Public ----

  // Cached briefly in Redis (PublicCacheService) and dropped on every catalog edit. Display only:
  // order creation reads rates from the database and snapshots them, so a cached price is never
  // what anyone is charged.
  @Get("services")
  listServices() {
    return this.cache.wrap("catalog", "services", {}, 30, () => this.catalog.listServices());
  }

  @Get("services/:id/rates")
  listRates(@Param("id") id: string) {
    return this.cache.wrap("catalog", "rates", { id }, 30, () => this.catalog.listRates(id));
  }

  @Get("payment-methods")
  listPaymentMethods() {
    return this.cache.wrap("catalog", "payment-methods", {}, 60, () => this.catalog.listPaymentMethods());
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/services")
  @InvalidatesPublicCache("catalog")
  createService(@Body() dto: UpsertServiceDto) {
    return this.catalog.createService(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/services/:id")
  @InvalidatesPublicCache("catalog")
  updateService(@Param("id") id: string, @Body() dto: Partial<UpsertServiceDto>) {
    return this.catalog.updateService(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/services")
  listAllServices() {
    return this.catalog.listServices(true);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/services/:id/rates")
  @InvalidatesPublicCache("catalog")
  upsertRate(
    @Param("id") id: string,
    @Body() dto: UpsertRateDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.catalog.upsertRate(id, dto, user.userId);
  }

  // Cost basis (E-01). Never part of a Service response -- see ServiceCost in the schema.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get("admin/service-costs")
  listServiceCosts() {
    return this.catalog.listServiceCosts();
  }

  /// ADMIN only: it changes what every future order's margin is computed against.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Put("admin/services/:id/cost")
  setServiceCost(
    @Param("id") id: string,
    @Body() dto: SetServiceCostDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.catalog.setServiceCost(id, dto.costPercent, user.userId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @HttpCode(204)
  @Delete("admin/services/:id")
  @InvalidatesPublicCache("catalog")
  deleteService(@Param("id") id: string) {
    return this.catalog.deleteService(id);
  }
}
