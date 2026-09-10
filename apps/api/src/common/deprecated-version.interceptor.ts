import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable } from "rxjs";

/**
 * Tells a caller still on the unversioned path that it is on its way out.
 *
 * The partner surface existed before versioning did, and somebody's program may be pointed at
 * `/api/partner/...` right now. Removing that path to tidy up would break them without warning,
 * and warning them in a document they have never read is the same as not warning them. So the
 * old path keeps working and answers with the two headers that exist for exactly this:
 *
 *   Deprecation: true          -- this path is deprecated (RFC 9745)
 *   Sunset: <http-date>        -- the date it is expected to stop (RFC 8594)
 *   Link: <new path>; rel="successor-version"
 *
 * The date is a promise, not a threat: it must not pass without either moving the callers or
 * moving the date. Anything else teaches integrators that our headers can be ignored.
 */
@Injectable()
export class DeprecatedVersionInterceptor implements NestInterceptor {
  constructor(
    private readonly successorPrefix: string,
    private readonly sunset: Date,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // Only the unversioned path is deprecated. The same handler serves both, so the URL is what
    // separates them -- a caller who already moved must not be told to move again.
    if (!/\/v\d+\//.test(request.originalUrl ?? request.url ?? "")) {
      const response = http.getResponse<Response>();
      response.setHeader("Deprecation", "true");
      response.setHeader("Sunset", this.sunset.toUTCString());
      response.setHeader("Link", `<${this.successorPrefix}>; rel="successor-version"`);
    }

    return next.handle();
  }
}
