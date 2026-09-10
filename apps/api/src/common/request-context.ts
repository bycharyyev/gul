import { randomUUID } from "node:crypto";
import { Injectable, Logger, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { Observable } from "rxjs";
import { tap } from "rxjs";

export const REQUEST_ID_HEADER = "x-request-id";

export type RequestWithId = Request & { requestId: string };

/**
 * Gives every request one stable correlation id and returns it to the caller. An incoming id is
 * accepted only when it is a short, log-safe token; arbitrary header contents must never become
 * trusted log fields.
 */
@Injectable()
export class RequestIdMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction) {
    const incoming = request.header(REQUEST_ID_HEADER);
    request.requestId = incoming && /^[A-Za-z0-9._:-]{1,100}$/.test(incoming) ? incoming : randomUUID();
    response.setHeader(REQUEST_ID_HEADER, request.requestId);
    next();
  }
}

/** Emits one machine-parseable completion event without recording query strings or resource ids. */
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HttpRequest");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId & { route?: { path?: string } }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    let emitted = false;

    const emit = (statusCode: number) => {
      if (emitted) return;
      emitted = true;
      this.logger.log(
        JSON.stringify({
          event: "http.request.completed",
          requestId: request.requestId,
          method: request.method,
          route: request.route?.path ?? "unmatched",
          statusCode,
          durationMs: Date.now() - startedAt,
        }),
      );
    };

    return next.handle().pipe(
      tap({
        next: () => emit(response.statusCode),
        error: (error: unknown) => emit(statusOf(error)),
      }),
    );
  }
}

function statusOf(error: unknown): number {
  const candidate = error as { getStatus?: () => number; status?: number };
  if (typeof candidate?.getStatus === "function") return candidate.getStatus();
  return typeof candidate?.status === "number" ? candidate.status : 500;
}
