import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import type { RequestWithId } from "../request-context";

/** Normalizes every error into { code, message } so ApiClient can parse it uniformly. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL_ERROR";
    let message = "Unexpected error";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      code = HttpStatus[status] ?? "ERROR";
      const raw = typeof body === "string" ? body : (body as Record<string, unknown>).message;

      // ValidationPipe reports field failures as an ARRAY of English sentences naming the DTO
      // property ("pickupAddress must be longer than or equal to 1 characters"). Passing those
      // through put untranslated, developer-shaped text in front of a Russian-speaking customer.
      // Business rules we author ourselves stay as they are -- "Minimum weight for this cargo
      // type is 5 kg" is worth showing -- while VALIDATION_FAILED gives clients something stable
      // to translate instead of a moving English string.
      if (Array.isArray(raw)) {
        code = "VALIDATION_FAILED";
        message = "Validation failed";
        // The field-level detail still matters when diagnosing a client bug, so keep it in the
        // log beside the request id rather than dropping it entirely.
        this.logger.warn(
          JSON.stringify({ event: "http.validation.failed", requestId: req.requestId, errors: raw }),
        );
      } else {
        message = (raw as string) ?? exception.message;
      }
    } else if (exception instanceof Error) {
      // The message deliberately no longer reaches the client (it leaked internals), so the log
      // is now the ONLY place it exists -- keep the stack with it or a 500 becomes unbudgeable.
      this.logger.error(
        JSON.stringify({ event: "http.request.failed", requestId: req.requestId, error: exception.message }),
        exception.stack,
      );
    }

    res.status(status).json({ code, message, statusCode: status, requestId: req.requestId });
  }
}
