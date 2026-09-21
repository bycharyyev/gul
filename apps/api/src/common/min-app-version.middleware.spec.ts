import { AppVersionPolicyService } from "../notifications/app-version-policy.service";
import { isVersionBelow } from "./app-version";
import { MinAppVersionMiddleware } from "./min-app-version.middleware";

describe("isVersionBelow", () => {
  it("compares numerically, not as text", () => {
    expect(isVersionBelow("1.0.6", "1.0.10")).toBe(true);
    expect(isVersionBelow("1.0.10", "1.0.6")).toBe(false);
    expect(isVersionBelow("1.2.0", "1.10.0")).toBe(true);
  });

  it("equal or newer is never below", () => {
    expect(isVersionBelow("1.0.6", "1.0.6")).toBe(false);
    expect(isVersionBelow("1.0", "1.0.0")).toBe(false);
    expect(isVersionBelow("2.0.0", "1.9.9")).toBe(false);
  });

  it("an empty or garbled value never locks anyone out", () => {
    expect(isVersionBelow("1.0.6", "")).toBe(false);
    expect(isVersionBelow("1.0.6", "abc")).toBe(false);
    expect(isVersionBelow("", "1.0.0")).toBe(false);
    expect(isVersionBelow("1.0.6", "1.0.7+3")).toBe(true);
  });
});

function run(minimum: string, headers: Record<string, string>, url = "/api/orders") {
  const policy = { minimumVersion: jest.fn().mockResolvedValue(minimum) } as unknown as AppVersionPolicyService;
  const middleware = new MinAppVersionMiddleware(policy);
  const req = { header: (name: string) => headers[name.toLowerCase()], originalUrl: url } as never;
  const json = jest.fn();
  const res = { status: jest.fn().mockReturnValue({ json }) } as never;
  const next = jest.fn();
  return { middleware, req, res, next, json, status: (res as { status: jest.Mock }).status };
}

describe("MinAppVersionMiddleware", () => {
  it("answers 426 to a build older than the minimum", async () => {
    const { middleware, req, res, next, json, status } = run("1.0.7", { "x-app-version": "1.0.6" });
    await middleware.use(req, res, next);
    expect(status).toHaveBeenCalledWith(426);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: "APP_UPDATE_REQUIRED", minVersion: "1.0.7" }));
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a current build through", async () => {
    const { middleware, req, res, next } = run("1.0.7", { "x-app-version": "1.0.7" });
    await middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("never judges a caller that sends no version (website, admin, partners)", async () => {
    const { middleware, req, res, next } = run("9.9.9", {});
    await middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("does nothing when no minimum is set, and never blocks the health check", async () => {
    const off = run("", { "x-app-version": "0.0.1" });
    await off.middleware.use(off.req, off.res, off.next);
    expect(off.next).toHaveBeenCalled();

    const health = run("9.9.9", { "x-app-version": "0.0.1" }, "/api/health/ready");
    await health.middleware.use(health.req, health.res, health.next);
    expect(health.next).toHaveBeenCalled();
  });
});

describe("AppVersionPolicyService", () => {
  it("reads the parameter once per cache period and keeps the last value when Firebase fails", async () => {
    const firebase = { enabled: true, remoteConfigValue: jest.fn().mockResolvedValueOnce(" 1.0.7 ").mockRejectedValue(new Error("down")) };
    const policy = new AppVersionPolicyService(firebase as never);
    expect(await policy.minimumVersion()).toBe("1.0.7");
    expect(await policy.minimumVersion()).toBe("1.0.7");
    expect(firebase.remoteConfigValue).toHaveBeenCalledTimes(1);

    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 120_000);
    expect(await policy.minimumVersion()).toBe("1.0.7");
    expect(firebase.remoteConfigValue).toHaveBeenCalledTimes(2);
    jest.restoreAllMocks();
  });

  it("is off when Firebase is not configured", async () => {
    const policy = new AppVersionPolicyService({ enabled: false } as never);
    expect(await policy.minimumVersion()).toBe("");
  });
});
