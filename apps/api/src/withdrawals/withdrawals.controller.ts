import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { WithdrawalsService } from "./withdrawals.service";
import { CreateWithdrawalDto } from "./dto/create-withdrawal.dto";
import { ReviewWithdrawalDto } from "./dto/review-withdrawal.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { WithdrawalStatus } from "@prisma/client";

type AuthedUser = { userId: string; role: string };

@ApiTags("withdrawals")
@ApiBearerAuth()
@Controller("withdrawals")
export class WithdrawalsController {
  constructor(private withdrawals: WithdrawalsService) {}

  // ---- Seller self-service ----

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Post()
  createRequest(@Body() dto: CreateWithdrawalDto, @CurrentUser() user: AuthedUser) {
    return this.withdrawals.createRequest(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("SELLER")
  @Get("me")
  listMyRequests(@CurrentUser() user: AuthedUser) {
    return this.withdrawals.listMyRequests(user.userId);
  }

  // ---- Admin ----

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN", "MANAGER")
  @Get()
  listAllRequests(@Query("status") status?: WithdrawalStatus) {
    return this.withdrawals.listAllRequests(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post(":id/approve")
  approveRequest(@Param("id") id: string, @Body() dto: ReviewWithdrawalDto, @CurrentUser() user: AuthedUser) {
    return this.withdrawals.approveRequest(id, dto, user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("ADMIN")
  @Post(":id/reject")
  rejectRequest(@Param("id") id: string, @Body() dto: ReviewWithdrawalDto, @CurrentUser() user: AuthedUser) {
    return this.withdrawals.rejectRequest(id, dto, user.userId);
  }
}
