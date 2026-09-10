import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CargoService } from "./cargo.service";
import { CreateCityDto, UpdateCityDto } from "./dto/upsert-city.dto";
import { UpsertItemTypeDto } from "./dto/upsert-item-type.dto";
import { UpsertBannerDto } from "./dto/upsert-banner.dto";
import { SetTariffBracketsDto } from "./dto/create-tariff.dto";
import { UpdateExchangeRateDto } from "./dto/update-exchange-rate.dto";
import { UpdateShipmentStatusDto } from "./dto/update-shipment-status.dto";
import { AddTrackingEventDto } from "./dto/add-tracking-event.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { ShipmentStatus } from "@prisma/client";

type AuthedUser = { userId: string; role: string };

@ApiTags("admin-cargo")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("ADMIN", "MANAGER")
@Controller("admin/cargo")
export class CargoAdminController {
  constructor(private cargo: CargoService) {}

  @Get("cities")
  cities() {
    return this.cargo.listCitiesAdmin();
  }

  @Post("cities")
  createCity(@Body() dto: CreateCityDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.createCity(dto, user.userId);
  }

  @Patch("cities/:id")
  updateCity(@Param("id") id: string, @Body() dto: UpdateCityDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.updateCity(id, dto, user.userId);
  }

  @Get("item-types")
  itemTypes() {
    return this.cargo.listItemTypesAdmin();
  }

  @Post("item-types")
  upsertItemType(@Body() dto: UpsertItemTypeDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.upsertItemType(dto, user.userId);
  }

  @Get("banners")
  banners() {
    return this.cargo.listBannersAdmin();
  }

  @Post("banners")
  upsertBanner(@Body() dto: UpsertBannerDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.upsertBanner(dto, user.userId);
  }

  @Delete("banners/:id")
  deleteBanner(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.cargo.deleteBanner(id, user.userId);
  }

  // Brackets are global now, not per route -- see CargoService.setTariffBrackets.
  @Post("tariffs")
  setTariffBrackets(@Body() dto: SetTariffBracketsDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.setTariffBrackets(dto, user.userId);
  }

  @Get("exchange-rate")
  getExchangeRate() {
    return this.cargo.getExchangeRateAdmin();
  }

  @Patch("exchange-rate")
  updateExchangeRate(@Body() dto: UpdateExchangeRateDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.updateExchangeRate(dto, user.userId);
  }

  @Get("shipments")
  shipments(@Query("status") status?: ShipmentStatus, @Query("search") search?: string) {
    return this.cargo.listShipmentsAdmin({ status, search });
  }

  @Get("shipments/:id")
  findOne(@Param("id") id: string) {
    return this.cargo.findOneAdmin(id);
  }

  @Patch("shipments/:id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateShipmentStatusDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.updateStatus(id, dto, user.userId);
  }

  @Post("shipments/:id/notes")
  addNote(@Param("id") id: string, @Body() dto: AddTrackingEventDto, @CurrentUser() user: AuthedUser) {
    return this.cargo.addNote(id, dto.note, user.userId);
  }
}
