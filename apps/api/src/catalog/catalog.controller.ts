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

@ApiTags("catalog")
@Controller("catalog")
export class CatalogController {
  constructor(private catalog: CatalogService) {}

  // ---- Public ----

  @Get("services")
  listServices() {
    return this.catalog.listServices();
  }

  @Get("services/:id/rates")
  listRates(@Param("id") id: string) {
    return this.catalog.listRates(id);
  }

  @Get("payment-methods")
  listPaymentMethods() {
    return this.catalog.listPaymentMethods();
  }

  // ---- Admin ----

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("admin/services")
  createService(@Body() dto: UpsertServiceDto) {
    return this.catalog.createService(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Patch("admin/services/:id")
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
  deleteService(@Param("id") id: string) {
    return this.catalog.deleteService(id);
  }
}
