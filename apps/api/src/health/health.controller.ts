import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @Inject(TOPUP_QUEUE) private topupQueue: Queue,
  ) {}

  /** Kept as the plain, unversioned check for backward compat -- existing deploy/failover
   *  scripts curl this exact path. Equivalent to /health/ready. */
  @Get()
  async check() {
    return this.ready();
  }

  /** Process is up and able to respond at all. Deliberately has zero dependencies -- a
   *  liveness probe should only restart the container for a truly wedged process, not because
   *  a dependency it doesn't own (the database, Redis) is having a bad moment. */
  @Get("live")
  live() {
    return { status: "ok" };
  }

  /** Able to actually serve production traffic -- checks the dependencies a request would
   *  actually need. */
  @Get("ready")
  async ready() {
    // BullMQ's own client type doesn't surface ioredis's `.ping`, though the object has one --
    // narrow, local cast rather than widening the whole method's types.
    const [db, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.topupQueue.client.then((c) => (c as unknown as { ping(): Promise<string> }).ping()),
    ]);
    if (db.status === "rejected") throw new ServiceUnavailableException("Database unreachable");
    if (redis.status === "rejected") throw new ServiceUnavailableException("Redis unreachable");
    return { status: "ok" };
  }
}
