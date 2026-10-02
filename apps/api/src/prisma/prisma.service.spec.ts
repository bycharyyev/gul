import { withConnectionLimit } from "./prisma.service";

describe("withConnectionLimit", () => {
  const URL = "postgresql://u:p@db:5432/gul";

  it("adds the limit to a URL without one", () => {
    expect(withConnectionLimit(URL, "6")).toBe(`${URL}?connection_limit=6`);
    expect(withConnectionLimit(`${URL}?schema=public`, "6")).toBe(`${URL}?schema=public&connection_limit=6`);
  });

  it("never overrides a limit the URL already sets", () => {
    expect(withConnectionLimit(`${URL}?connection_limit=3`, "6")).toBe(`${URL}?connection_limit=3`);
  });

  it("leaves the URL alone when no valid limit is configured", () => {
    expect(withConnectionLimit(URL, undefined)).toBe(URL);
    expect(withConnectionLimit(URL, "zero")).toBe(URL);
    expect(withConnectionLimit(URL, "0")).toBe(URL);
    expect(withConnectionLimit(undefined, "6")).toBeUndefined();
  });
});
