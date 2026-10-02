import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { PerfMetricsService } from "./perf-metrics.service";

/**
 * Times every response, on `finish`, for the Performance page.
 *
 * A middleware rather than the existing ApiMetricsInterceptor: interceptors run after guards, so a
 * request refused by the rate limiter (429) or by auth never reached it and was never counted. On
 * `finish` every answer is seen, whoever produced it. Health checks are skipped: the watchdog polls
 * them every 30 s and they would only dilute the latency figures.
 */
@Injectable()
export class PerfMetricsMiddleware implements NestMiddleware {
  constructor(private perf: PerfMetricsService) {}

  use(req: Request & { user?: { userId?: string } }, res: Response, next: NextFunction) {
    if (req.originalUrl.startsWith("/api/health")) return next();
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      // req.user is set by the JWT guard during the request, so it is known by now when there is one.
      this.perf.record(res.statusCode, ms, req.user?.userId ?? null);
    });
    next();
  }
}
