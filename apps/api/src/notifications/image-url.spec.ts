import { absoluteImageUrl } from "./image-url";

const ORIGIN = "https://api.example.com";

describe("absoluteImageUrl", () => {
  it("keeps a full https URL", () => {
    expect(absoluteImageUrl("https://cdn.example/a.png", ORIGIN)).toBe("https://cdn.example/a.png");
  });

  it("expands an /api path and a bare avatar filename", () => {
    expect(absoluteImageUrl("/api/avatar/a.jpg", ORIGIN)).toBe("https://api.example.com/api/avatar/a.jpg");
    expect(absoluteImageUrl("a.jpg", ORIGIN)).toBe("https://api.example.com/api/avatar/a.jpg");
  });

  it("refuses anything a device should not be told to fetch", () => {
    for (const value of ["", "  ", null, undefined, "http://cdn.example/a.png", "data:image/png;base64,AA", "//cdn.example/a.png", "javascript:alert(1)"]) {
      expect(absoluteImageUrl(value, ORIGIN)).toBeUndefined();
    }
  });
});
