import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";
import { ApiMetricsService, CallerTier } from "./api-metrics.service";

/**
 * Records every request that reaches the application.
 *
 * Registered as an APP_INTERCEPTOR, so it covers the whole surface without a decorator on 157
 * routes -- and cannot be forgotten on the 158th.
 *
 * Two things it deliberately does not record: the **raw path** and the **query string**. A raw
 * path carries order ids and, on `/order-tracking`, a recipient's phone number. What goes into
 * Redis is the route *template* the router matched, so `/orders/:id` is one row rather than one
 * row per order.
 *
 * One documented blind spot: a request that matches **no** route is answered by Nest before any
 * interceptor runs, so those 404s are not counted. Acceptable -- a scanner probing random URLs is
 * exactly the traffic not worth spending Redis cardinality on, and every 4xx or 5xx on a real
 * endpoint still is counted.
 */
@Injectable()
export class ApiMetricsInterceptor implements NestInterceptor {
  constructor(private metrics: ApiMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithCaller>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    const finish = (statusCode: number) => {
      this.metrics.record({
        tier: tierOf(request),
        route: routeTemplate(request),
        method: request.method,
        statusCode,
        durationMs: Date.now() - startedAt,
        apiKeyId: request.apiKey?.id,
      });
    };

    // `tap` with both handlers: a failing request is exactly the traffic worth counting, and an
    // exception never reaches the `next` callback.
    return next.handle().pipe(
      tap({
        next: () => finish(response.statusCode),
        error: (error: unknown) => finish(statusOf(error)),
      }),
    );
  }
}

type RequestWithCaller = Request & {
  user?: { userId?: string; role?: string };
  apiKey?: { id: string; ownerLabel?: string };
  route?: { path?: string };
};

/**
 * The route template Express matched, with the global `/api` prefix already stripped by Nest.
 *
 * Falls back to a single `unmatched` bucket rather than the raw URL: a 404 on a random path is
 * still worth counting, but recording each probed path would turn a scanner into unbounded
 * cardinality in Redis.
 */
export function routeTemplate(request: { route?: { path?: string }; method: string }): string {
  const path = request.route?.path;
  if (!path || typeof path !== "string") return "unmatched";
  return path;
}

/** Which trust boundary the caller came through. */
export function tierOf(request: {
  user?: { role?: string };
  apiKey?: { id: string };
}): CallerTier {
  if (request.apiKey) return "partner";
  const role = request.user?.role;
  if (!role) return "public";
  return role === "CUSTOMER" ? "customer" : "staff";
}

/** Nest exceptions carry `getStatus()`; anything else is a 500 by definition. */
export function statusOf(error: unknown): number {
  const candidate = error as { getStatus?: () => number; status?: number };
  if (typeof candidate?.getStatus === "function") return candidate.getStatus();
  if (typeof candidate?.status === "number") return candidate.status;
  return 500;
}
