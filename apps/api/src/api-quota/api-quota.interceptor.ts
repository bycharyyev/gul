import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";
import { tierOf } from "../metrics/api-metrics.interceptor";
import { ApiQuotaService } from "./api-quota.service";

/**
 * A per-caller quota, alongside the existing per-route throttle.
 *
 * These are two different jobs and are deliberately two mechanisms:
 *
 * * `ThrottlerGuard` (unchanged) is **burst protection on a route** -- 10 logins a minute from one
 *   IP, whoever you are. It stops credential stuffing.
 * * This is **a quota on an identity** -- how much of the service one caller may consume across
 *   everything. It stops one partner's runaway loop from starving customers.
 *
 * The identity is the whole point. The existing throttle keys on IP, so a partner behind NAT
 * shares a bucket with every customer behind that same NAT, and a partner cannot be given a quota
 * at all because the limit is attached to nothing they own. Here a partner is their key, a
 * signed-in person is their user id, and only anonymous traffic falls back to an address.
 *
 * An interceptor rather than a guard, and not by preference: a global guard in Nest runs *before*
 * the route's own guards, so `request.user` and `request.apiKey` are not populated yet and every
 * caller would look anonymous. Interceptors run after all guards. Throwing before `next.handle()`
 * rejects the request just as a guard would.
 */
@Injectable()
export class ApiQuotaInterceptor implements NestInterceptor {
  constructor(private quota: ApiQuotaService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<QuotaRequest>();

    // Health checks are what the load balancer and the deploy script use to decide whether this
    // process is alive. Rate-limiting them can only ever cause a false failover.
    if (isHealthCheck(request.path)) return next.handle();

    const tier = tierOf(request);
    const verdict = await this.quota.consume(tier, identityOf(request), request.apiKey?.id);

    // `X-Quota-*`, not `X-RateLimit-*`.
    //
    // @nestjs/throttler already writes the `X-RateLimit-*` headers for its own per-route,
    // per-IP limit -- verified on production. Reusing those names would overwrite them, and the
    // result would actively mislead: a public caller would read "limit 300" from this quota and
    // still be rejected at 120 by the throttler, whose numbers had just been erased.
    //
    // Two limiters, two sets of headers, neither lying. The stricter of the two is whichever
    // rejects first, and a client can now see both.
    const response = http.getResponse<Response>();
    response.setHeader("X-Quota-Limit", String(verdict.limit));
    response.setHeader("X-Quota-Remaining", String(Math.max(0, verdict.limit - verdict.used)));
    response.setHeader("X-Quota-Reset", String(verdict.resetInSeconds));

    if (!verdict.allowed) {
      response.setHeader("Retry-After", String(verdict.resetInSeconds));
      throw new HttpException(
        {
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded: ${verdict.limit} requests per minute`,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return next.handle();
  }
}

type QuotaRequest = Request & {
  user?: { userId?: string; role?: string };
  apiKey?: { id: string };
};

/** The app runs behind the `api` global prefix, so both spellings are checked. */
export function isHealthCheck(path?: string): boolean {
  if (!path) return false;
  return path.startsWith("/health") || path.startsWith("/api/health");
}

/**
 * Who to charge the request to.
 *
 * A partner is their key and a signed-in person is their user id, so neither can be diluted by
 * sharing an address with someone else, nor escape a limit by changing address. Anonymous traffic
 * has nothing else to key on.
 */
export function identityOf(request: {
  user?: { userId?: string };
  apiKey?: { id: string };
  ip?: string;
  socket?: { remoteAddress?: string };
}): string {
  if (request.apiKey?.id) return `key:${request.apiKey.id}`;
  if (request.user?.userId) return `user:${request.user.userId}`;
  return `ip:${request.ip ?? request.socket?.remoteAddress ?? "unknown"}`;
}
