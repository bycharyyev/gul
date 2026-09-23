import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ApiKeysService } from "./api-keys.service";
import { CreateSellerKeyDto } from "./dto/create-seller-key.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { SellersService } from "../sellers/sellers.service";

type AuthedUser = { userId: string; role: string };

/**
 * A shop's own API keys, managed by the person who runs the shop.
 *
 * Separate from the admin key console because the two answer to different people. Staff mint
 * partner keys, decide what a partner may reach and how much traffic they get. A seller mints
 * keys for their own shop and cannot touch either of those: the shop is fixed to theirs, the
 * scopes are limited to the shop surface, and the rate limit is not theirs to raise.
 */
@ApiTags("seller-api-keys")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("SELLER")
@Controller("seller/api-keys")
export class SellerKeysController {
  constructor(
    private keys: ApiKeysService,
    private sellers: SellersService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.keys.listForSeller(sellerId);
  }

  /** Answers with the raw token exactly once. It cannot be retrieved again. */
  @Post()
  async create(@Body() dto: CreateSellerKeyDto, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.keys.createForSeller(sellerId, user.userId, dto);
  }

  @Patch(":id")
  async setEnabled(
    @Param("id") id: string,
    @Body() body: { isEnabled: boolean },
    @CurrentUser() user: AuthedUser,
  ) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.keys.setEnabledForSeller(sellerId, id, !!body.isEnabled);
  }

  /**
   * Issues a new token and keeps the old one working for a day.
   *
   * The grace window is not a setting here: a seller rotating a key because it leaked wants the
   * old one dead, and a seller rotating on schedule wants time to deploy. One day covers the
   * second, and the first is served by deleting the key instead.
   */
  @Post(":id/rotate")
  async rotate(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    return this.keys.rotateForSeller(sellerId, id);
  }

  @HttpCode(204)
  @Delete(":id")
  async remove(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    const sellerId = await this.sellers.requireSellerId(user.userId);
    await this.keys.removeForSeller(sellerId, id);
  }
}
