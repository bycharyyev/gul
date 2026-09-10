import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { SellerLedgerService } from "./seller-ledger.service";

@ApiTags("seller-ledger")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("seller-ledger")
export class SellerLedgerController {
  constructor(private readonly ledger: SellerLedgerService) {}

  @Roles("SELLER")
  @Get("me")
  async mine(@CurrentUser() user: { userId: string }, @Query("take") take?: string) {
    return this.ledger.listForUser(user.userId, Number(take) || 100);
  }

  @Roles("ADMIN", "MANAGER")
  @Get("admin/reconciliation")
  reconcile() {
    return this.ledger.reconcile();
  }
}
