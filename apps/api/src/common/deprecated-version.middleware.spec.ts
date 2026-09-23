import { deprecatedVersionHeaders, isVersioned } from "./deprecated-version.middleware";

const SUNSET = new Date("2027-03-10T00:00:00Z");
const middleware = deprecatedVersionHeaders("/api/v1/partner", SUNSET);

function run(url: string) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  };
  let nexted = false;
  middleware({ originalUrl: url, url } as never, res as never, () => {
    nexted = true;
  });
  return { headers, nexted };
}

describe("deprecatedVersionHeaders", () => {
  it("marks the unversioned path and points at its successor", () => {
    const { headers } = run("/api/partner/catalog/services");

    expect(headers.Deprecation).toBe("true");
    expect(headers.Sunset).toBe(SUNSET.toUTCString());
    // Machine-readable, so an integrator does not have to guess the replacement address from a
    // header that only says "stop".
    expect(headers.Link).toBe('</api/v1/partner>; rel="successor-version"');
  });

  it("says nothing to a caller who already moved", () => {
    // The same handler serves both paths. Telling somebody on /v1 to migrate would train them to
    // ignore the header, which is the one thing it cannot survive.
    expect(run("/api/v1/partner/catalog/services").headers).toEqual({});
  });

  it("runs before the guard, so a rejected request is marked too", () => {
    // This is why it is middleware and not an interceptor. Nest runs guards first, so the earlier
    // version never fired for a 401 -- a partner with an expired key saw no sunset notice at all.
    const { headers, nexted } = run("/api/partner/orders");

    expect(headers.Deprecation).toBe("true");
    // Marking is all it does; whether the request is then allowed is the guard's business.
    expect(nexted).toBe(true);
  });

  it("always continues the chain", () => {
    expect(run("/api/v1/partner/orders").nexted).toBe(true);
  });
});

describe("isVersioned", () => {
  it("recognises a version segment", () => {
    expect(isVersioned("/api/v1/partner/x")).toBe(true);
    expect(isVersioned("/api/v12/partner/x")).toBe(true);
  });

  it("is not fooled by the letter v elsewhere in a path", () => {
    expect(isVersioned("/api/partner/catalog/v1-services")).toBe(false);
    expect(isVersioned("/api/partner/vouchers")).toBe(false);
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

  it("keeps the partner surface answering on both paths, and marks the old one", () => {
    expect(read("partner/partner.controller.ts")).toContain('version: [VERSION_NEUTRAL, "1"]');
    expect(read("partner/partner.module.ts")).toContain("deprecatedVersionHeaders");
  });

  it("leaves first-party routes unversioned", () => {
    // Web and admin ship in the same deploy as the API, so a version segment on their routes
    // would be a number nobody ever reads.
    expect(read("chat/chat.controller.ts")).toContain('@Controller("chat")');
  });
});
