import { of } from "rxjs";
import { DeprecatedVersionInterceptor } from "./deprecated-version.interceptor";

const SUNSET = new Date("2027-03-10T00:00:00Z");

function contextFor(url: string, type = "http") {
  const headers: Record<string, string> = {};
  const response = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  const context = {
    getType: () => type,
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: url, url }),
      getResponse: () => response,
    }),
  } as never;
  return { context, headers };
}

const handler = { handle: () => of("body") };

describe("DeprecatedVersionInterceptor", () => {
  const interceptor = new DeprecatedVersionInterceptor("/api/v1/partner", SUNSET);

  it("marks the unversioned path, and says where to go instead", async () => {
    const { context, headers } = contextFor("/api/partner/catalog/services");

    await new Promise((resolve) =>
      interceptor.intercept(context, handler).subscribe(resolve),
    );

    expect(headers.Deprecation).toBe("true");
    expect(headers.Sunset).toBe(SUNSET.toUTCString());
    // A machine-readable pointer, not only a date: an integrator should not have to guess the
    // replacement address from a header that only says "stop".
    expect(headers.Link).toBe('</api/v1/partner>; rel="successor-version"');
  });

  it("says nothing to a caller who has already moved", async () => {
    // The same handler serves both paths. Telling somebody on /v1 to migrate would train them to
    // ignore the header, which is the one thing it cannot survive.
    const { context, headers } = contextFor("/api/v1/partner/catalog/services");

    await new Promise((resolve) =>
      interceptor.intercept(context, handler).subscribe(resolve),
    );

    expect(headers).toEqual({});
  });

  it("does not confuse a version segment elsewhere in the path with the caller's version", async () => {
    const { context, headers } = contextFor("/api/partner/catalog/v1-services");

    await new Promise((resolve) =>
      interceptor.intercept(context, handler).subscribe(resolve),
    );

    expect(headers.Deprecation).toBe("true");
  });

  it("passes the response through untouched", async () => {
    const { context } = contextFor("/api/partner/catalog/services");

    const body = await new Promise((resolve) =>
      interceptor.intercept(context, handler).subscribe(resolve),
    );

    expect(body).toBe("body");
  });

  it("leaves anything that is not an http request alone", async () => {
    const { context, headers } = contextFor("/api/partner/x", "rpc");

    await new Promise((resolve) =>
      interceptor.intercept(context, handler).subscribe(resolve),
    );

    expect(headers).toEqual({});
  });
});

describe("the versioned surfaces", () => {
  const read = (path: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require("fs").readFileSync(require("path").join(__dirname, "..", path), "utf8");

  it("versions the seller API and keeps no unversioned path for it", () => {
    // Nothing has integrated against it, so there is nothing to keep alive -- and a path kept
    // "just in case" is one somebody eventually depends on.
    const source = read("seller-api/seller-api.controller.ts");
    expect(source).toContain('@Controller({ path: "seller-api", version: "1" })');
    expect(source).not.toContain('@Controller("seller-api")');
  });

  it("keeps the partner surface answering on both paths", () => {
    // This one shipped before versioning existed. Dropping the old path would break a program
    // that is pointed at it right now, with no warning it could have acted on.
    const source = read("partner/partner.controller.ts");
    expect(source).toContain('version: [VERSION_NEUTRAL, "1"]');
    expect(source).toContain("DeprecatedVersionInterceptor");
  });

  it("leaves first-party routes unversioned", () => {
    // Web and admin ship in the same deploy as the API, so a version segment on their routes
    // would be a number nobody ever reads.
    const source = read("chat/chat.controller.ts");
    expect(source).toContain('@Controller("chat")');
  });
});
