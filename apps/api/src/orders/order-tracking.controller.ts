import { Controller, Get, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { OrdersService } from "./orders.service";

@ApiTags("order-tracking")
@Controller("order-tracking")
export class OrderTrackingController {
  constructor(private orders: OrdersService) {}

  @Get()
  track(@Query("orderId") orderId: string, @Query("recipientIdentifier") recipientIdentifier: string) {
    return this.orders.track(orderId, recipientIdentifier);
  }
}
