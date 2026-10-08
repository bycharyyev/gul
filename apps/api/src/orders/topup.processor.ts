import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import { TOPUP_QUEUE, redisConnection } from "../queue/queue.module";
import { OrdersService } from "./orders.service";
import { OPERATOR_GATEWAY, type OperatorGateway } from "./operator-gateway.interface";
import { runsBackgroundWork } from "../common/app-role";

@Injectable()
export class TopupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TopupProcessor.name);
  private worker?: Worker;

  constructor(
    private orders: OrdersService,
    @Inject(OPERATOR_GATEWAY) private gateway: OperatorGateway,
  ) {}

  onModuleInit() {
    // ADR 0008: an APP_ROLE=http process serves requests only; background work runs elsewhere.
    if (!runsBackgroundWork()) return;
    const connection = redisConnection();

    this.worker = new Worker(
      TOPUP_QUEUE,
      async (job: Job<{ orderId: string }>) => {
        await this.orders.processTopup(job.data.orderId, this.gateway);
      },
      { connection },
    );

    this.worker.on("failed", (job, err) => {
      this.logger.error(`Topup job ${job?.id} failed: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
