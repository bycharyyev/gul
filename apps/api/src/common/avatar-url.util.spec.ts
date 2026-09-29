import { toAvatarUrl } from "./avatar-url.util";

describe("toAvatarUrl", () => {
  it("returns null when there is no avatar", () => {
    expect(toAvatarUrl(null)).toBeNull();
  });

  it("passes an absolute S3 URL through unmodified", () => {
    // This is the actual bug: avatarPath under S3 storage is already a full URL
    // (https://open.s3.regru.cloud/avatars/<uuid>.<ext>). Prefixing anything onto it produces a
    // garbage, unparseable src -- every S3-stored avatar rendered as a broken image.
    const absolute = "https://open.s3.regru.cloud/avatars/abc123.jpg";
    expect(toAvatarUrl(absolute)).toBe(absolute);
  });

  it("builds the API-proxy path for a relative local-disk filename", () => {
    expect(toAvatarUrl("abc123.jpg")).toBe("/api/avatar/abc123.jpg");
  });
});
