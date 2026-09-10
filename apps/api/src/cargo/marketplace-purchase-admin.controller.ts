import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { MarketplacePurchaseStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { ActualMarketplaceWeightDto, ConfirmMarketplaceAuthorizationDto, ConfirmMarketplaceRefundDto, ReviewMarketplacePurchaseDto, UpdateMarketplacePurchaseSettingsDto, UpdateMarketplacePurchaseStatusDto, UpdateMarketplaceSourceDto } from "./dto/marketplace-purchase.dto";
import { MarketplacePurchaseService } from "./marketplace-purchase.service";

@ApiTags("admin-cargo-marketplace-purchases") @ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard) @Roles("ADMIN", "MANAGER")
@Controller("admin/cargo/marketplace-purchases")
export class MarketplacePurchaseAdminController {
  constructor(private service: MarketplacePurchaseService) {}
  @Get("settings") settings() { return this.service.settings(); }
  @Patch("settings") updateSettings(@Body() dto: UpdateMarketplacePurchaseSettingsDto, @CurrentUser() user: { userId: string }) { return this.service.updateSettings(dto, user.userId); }
  @Get("sources") sources() { return this.service.sourcesAdmin(); }
  @Patch("sources/:code") updateSource(@Param("code") code: string, @Body() dto: UpdateMarketplaceSourceDto, @CurrentUser() user: { userId: string }) { return this.service.updateSource(code, dto, user.userId); }
  @Get("orders") orders(@Query("status") status?: MarketplacePurchaseStatus) { return this.service.adminList(status); }
  @Get("orders/:id") one(@Param("id") id: string, @CurrentUser() user: { userId: string; role: string }) { return this.service.one(id, user); }
  @Post("orders/:id/review") review(@Param("id") id: string, @Body() dto: ReviewMarketplacePurchaseDto, @CurrentUser() user: { userId: string }) { return this.service.review(id, dto, user.userId); }
  @Post("orders/:id/actual-weight") actualWeight(@Param("id") id: string, @Body() dto: ActualMarketplaceWeightDto, @CurrentUser() user: { userId: string }) { return this.service.actualWeight(id, dto, user.userId); }
  @Post("orders/:id/confirm-authorization") confirmAuthorization(@Param("id") id: string, @Body() dto: ConfirmMarketplaceAuthorizationDto, @CurrentUser() user: { userId: string }) { return this.service.confirmAuthorization(id, dto.provider, dto.externalReference, dto.amountTmt, user.userId); }
  @Post("orders/:id/confirm-refund") confirmRefund(@Param("id") id: string, @Body() dto: ConfirmMarketplaceRefundDto, @CurrentUser() user: { userId: string }) { return this.service.confirmRefund(id, dto.externalReference, user.userId); }
  @Patch("orders/:id/status") status(@Param("id") id: string, @Body() dto: UpdateMarketplacePurchaseStatusDto, @CurrentUser() user: { userId: string }) { return this.service.updateStatus(id, dto.status, dto.reason, user.userId); }
}
