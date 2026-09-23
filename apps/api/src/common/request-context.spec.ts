import { BadRequestException, CallHandler, ExecutionContext } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { throwError } from "rxjs";
import { REQUEST_ID_HEADER, RequestIdMiddleware, RequestLoggingInterceptor, type RequestWithId } from "./request-context";

describe("request context", () => {
  it("preserves a safe caller correlation id", () => {
    const request = { header: () => "client-123" } as unknown as RequestWithId;
    const setHeader = jest.fn();
    const response = { setHeader } as unknown as Response;
    const next = jest.fn() as NextFunction;

    new RequestIdMiddleware().use(request, response, next);

    expect(request.requestId).toBe("client-123");
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, "client-123");
    expect(next).toHaveBeenCalled();
  });

  it("replaces an unsafe correlation id", () => {
    const request = { header: () => "bad id\nlog injection" } as unknown as RequestWithId;
    const response = { setHeader: jest.fn() } as unknown as Response;

    new RequestIdMiddleware().use(request, response, jest.fn());

    expect(request.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps the status of failed requests in the completion event", (done) => {
    const interceptor = new RequestLoggingInterceptor();
    const log = jest.spyOn((interceptor as any).logger, "log").mockImplementation();
    const request = { requestId: "req-1", method: "GET", route: { path: "/things/:id" } } as unknown as Request;
    const context = {
      getType: () => "http",
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ statusCode: 200 }) }),
    } as unknown as ExecutionContext;
    const handler = { handle: () => throwError(() => new BadRequestException()) } as CallHandler;

    interceptor.intercept(context, handler).subscribe({
      error: () => {
        expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ requestId: "req-1", statusCode: 400 });
        done();
      },
    });
  });
});
