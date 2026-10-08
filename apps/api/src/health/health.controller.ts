import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";
import { appRole, runsBackgroundWork } from "../common/app-role";

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

  /** Which ADR 0008 role this process runs, so a deploy can check an http process is not
   *  running workers (or a worker is) before trusting it. No secrets, no counts. */
  @Get("role")
  role() {
    return { role: appRole(), background: runsBackgroundWork() };
  }

  /** Able to actually serve production traffic -- checks the dependencies a request would
   *  actually need. */
  @Get("ready")
  async ready() {
    // BullMQ's own client type doesn't surface ioredis's `.ping`, though the object has one --
    // narrow, local cast rather than widening the whole method's types.
    // Bounded: a client stuck waiting for a Redis master (a failover in progress) queues the ping
    // forever, and a readiness check that never answers looks to nginx and the watchdog like a
    // dead server rather than an honest 503 (2026-10-08 drill).
    const [db, redis] = await Promise.allSettled([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, READY_TIMEOUT_MS),
      withTimeout(
        this.topupQueue.client.then((c) => (c as unknown as { ping(): Promise<string> }).ping()),
        READY_TIMEOUT_MS,
      ),
    ]);
    if (db.status === "rejected") throw new ServiceUnavailableException("Database unreachable");
    if (redis.status === "rejected") throw new ServiceUnavailableException("Redis unreachable");
    return { status: "ok" };
  }
}

const READY_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
