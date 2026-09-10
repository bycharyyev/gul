import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { OrderTrackingController } from "./order-tracking.controller";
import { OrdersService } from "./orders.service";
import { MockOperatorGateway } from "./mock-operator.gateway";
import { TopupProcessor } from "./topup.processor";
import { StuckOrdersProcessor } from "./stuck-orders.processor";
import { EmailModule } from "../email/email.module";
import { ReferralsModule } from "../referrals/referrals.module";
import { OPERATOR_GATEWAY } from "./operator-gateway.interface";
import { UnconfiguredOperatorGateway } from "./unconfigured-operator.gateway";
import { selectOperatorGateway } from "./operator-gateway.provider";

@Module({
  imports: [EmailModule, ReferralsModule],
  controllers: [OrdersController, OrderTrackingController],
  providers: [
    OrdersService,
    MockOperatorGateway,
    UnconfiguredOperatorGateway,
    {
      provide: OPERATOR_GATEWAY,
      inject: [MockOperatorGateway, UnconfiguredOperatorGateway],
      useFactory: selectOperatorGateway,
    },
    TopupProcessor,
    StuckOrdersProcessor,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
