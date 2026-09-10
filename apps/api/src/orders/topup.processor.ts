import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { TOPUP_QUEUE } from "../queue/queue.module";
import { OrdersService } from "./orders.service";
import { OPERATOR_GATEWAY, type OperatorGateway } from "./operator-gateway.interface";

@Injectable()
export class TopupProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TopupProcessor.name);
  private worker?: Worker;

  constructor(
    private orders: OrdersService,
    @Inject(OPERATOR_GATEWAY) private gateway: OperatorGateway,
  ) {}

  onModuleInit() {
    const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
    });

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
