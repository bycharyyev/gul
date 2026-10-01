import { describe, expect, it } from "vitest";
import { resolveAvatarSrc } from "./avatar";

describe("resolveAvatarSrc", () => {
  it("passes an absolute storage URL through untouched", () => {
    // The bug this guards: prefixing the API origin onto an S3 URL broke every avatar.
    const s3 = "https://open.s3.regru.cloud/avatars/abc.jpg";
    expect(resolveAvatarSrc(s3)).toBe(s3);
  });

  it("prefixes the API origin onto a legacy relative path", () => {
    expect(resolveAvatarSrc("/api/avatar/abc.jpg")).toBe("https://api.test/api/avatar/abc.jpg");
  });

  it("has nothing to show without an avatar", () => {
    expect(resolveAvatarSrc(null)).toBeNull();
  });
});
