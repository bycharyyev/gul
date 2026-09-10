import { Injectable } from "@nestjs/common";
import type { Order } from "@prisma/client";
import type { OperatorGateway, OperatorTopupResult } from "./operator-gateway.interface";

/** Fail-closed gateway used until a real operator is configured. */
@Injectable()
export class UnconfiguredOperatorGateway implements OperatorGateway {
  async topUp(_order: Order, _idempotencyKey: string): Promise<OperatorTopupResult> {
    return {
      outcome: "UNKNOWN",
      errorMessage: "Operator gateway is not configured; no top-up was sent",
    };
  }
}
