import { Injectable, Logger } from "@nestjs/common";
import type { Order } from "@prisma/client";
import type { OperatorGateway, OperatorTopupResult } from "./operator-gateway.interface";

@Injectable()
export class MockOperatorGateway implements OperatorGateway {
  private readonly logger = new Logger(MockOperatorGateway.name);

  async topUp(order: Order, idempotencyKey: string): Promise<OperatorTopupResult> {
    this.logger.log(`Simulating top-up for order ${order.id}`);
    return { outcome: "CONFIRMED", operatorRef: `mock_${idempotencyKey}` };
  }
}
