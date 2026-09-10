import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { UpdateOrderDetailsDto } from "./dto/update-order-details.dto";
import { SetDeliveryNoteDto } from "./dto/set-delivery-note.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

type AuthedUser = { userId: string; role: string };

@ApiTags("orders")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private orders: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthedUser) {
    return this.orders.create({ userId: user.userId }, dto);
  }

  @Get("me")
  mine(@CurrentUser() user: AuthedUser) {
    return this.orders.findMine(user.userId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthedUser) {
    return this.orders.findOne(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Get()
  findAll(@Query("status") status?: string) {
    return this.orders.findAllForAdmin(status);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto, @CurrentUser() user: AuthedUser) {
    return this.orders.updateStatusAdmin(id, dto.status, user.userId, dto.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Patch(":id")
  updateDetails(@Param("id") id: string, @Body() dto: UpdateOrderDetailsDto) {
    return this.orders.updateDetailsAdmin(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Post(":id/retry-topup")
  retryTopup(@Param("id") id: string) {
    return this.orders.retryTopup(id);
  }

  @UseGuards(RolesGuard)
  @Roles("ADMIN", "MANAGER", "SUPPORT")
  @Patch(":id/delivery-note")
  setDeliveryNote(@Param("id") id: string, @Body() dto: SetDeliveryNoteDto) {
    return this.orders.setDeliveryNote(id, dto.deliveryNote);
  }
}
