import { Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Body } from "@nestjs/common";
import { ConfirmManualPaymentDto } from "./dto/confirm-manual-payment.dto";

@ApiTags("payments")
@ApiBearerAuth()
@Controller("payments")
export class PaymentsController {
  constructor(private payments: PaymentsService) {}

  /** Public trust boundary: provider adapter authenticates the exact raw bytes before parsing. */
  @Post("webhooks/:provider")
  @HttpCode(200)
  webhook(@Param("provider") provider: string, @Req() req: Request) {
    return this.payments.receiveWebhook(provider, Buffer.isBuffer(req.body) ? req.body : undefined, req.headers);
  }

  @UseGuards(JwtAuthGuard)
  @Post("orders/:id/initiate")
  initiate(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; role: string },
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.payments.initiate(id, user, idempotencyKey);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Get("reconciliation")
  reconciliation(@Query("minutes") minutes?: string) {
    const parsed = minutes ? Number(minutes) : 15;
    return this.payments.listStale(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 5), 1440) : 15);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Post("reconciliation/run")
  runReconciliation(@Query("minutes") minutes?: string) {
    const parsed = minutes ? Number(minutes) : 15;
    return this.payments.reconcileStale(Number.isFinite(parsed) ? Math.min(Math.max(parsed, 5), 1440) : 15);
  }

  // Stands in for a provider webhook until real gateways are wired up.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Post("orders/:id/confirm")
  confirm(
    @Param("id") id: string,
    @CurrentUser() user: { userId: string; role: string },
    @Body() dto: ConfirmManualPaymentDto,
  ) {
    return this.payments.confirmManualPayment(id, user.userId, dto.reason);
  }
}
