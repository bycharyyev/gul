import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AcceptMarketplaceQuoteDto, CreateMarketplacePurchaseDto, ResolveMarketplaceLinkDto } from "./dto/marketplace-purchase.dto";
import { MarketplacePurchaseService } from "./marketplace-purchase.service";

@ApiTags("cargo-marketplace-purchases")
@Controller("cargo/marketplace-purchases")
export class MarketplacePurchaseController {
  constructor(private service: MarketplacePurchaseService) {}
  @Get("sources") sources() { return this.service.sources(); }

  /** Paste-a-link preview. No network call, so it can answer while the customer is still typing. */
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Post("resolve") @HttpCode(200)
  resolve(@Body() dto: ResolveMarketplaceLinkDto, @CurrentUser() user: { userId: string }) {
    return this.service.resolveLink(user.userId, dto.url);
  }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Get("history")
  history(@CurrentUser() user: { userId: string }) { return this.service.history(user.userId); }

  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Delete("history")
  clearHistory(@CurrentUser() user: { userId: string }) { return this.service.clearHistory(user.userId); }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Post("orders")
  create(@Body() dto: CreateMarketplacePurchaseDto, @Headers("idempotency-key") headerKey: string | undefined, @CurrentUser() user: { userId: string }) {
    if (headerKey) dto.idempotencyKey = headerKey;
    return this.service.create(user.userId, dto);
  }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Get("orders") mine(@CurrentUser() user: { userId: string }) { return this.service.mine(user.userId); }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Get("orders/:id") one(@Param("id") id: string, @CurrentUser() user: { userId: string; role: string }) { return this.service.one(id, user); }
  @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Post("orders/:id/accept-quote")
  accept(@Param("id") id: string, @Body() dto: AcceptMarketplaceQuoteDto, @CurrentUser() user: { userId: string }) { return this.service.accept(id, user.userId, dto); }
}
