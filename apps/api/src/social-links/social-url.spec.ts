import { BadRequestException } from "@nestjs/common";
import { normalizeSocialUrl } from "./social-url";

describe("normalizeSocialUrl", () => {
  it("builds the profile link from a bare name", () => {
    expect(normalizeSocialUrl("TIKTOK", "gulyaly.official")).toBe("https://www.tiktok.com/@gulyaly.official");
    expect(normalizeSocialUrl("TIKTOK", "@gulyaly.official")).toBe("https://www.tiktok.com/@gulyaly.official");
    expect(normalizeSocialUrl("INSTAGRAM", "gulyaly.official")).toBe("https://instagram.com/gulyaly.official");
    expect(normalizeSocialUrl("TELEGRAM", "@gulyaly_bot")).toBe("https://t.me/gulyaly_bot");
    expect(normalizeSocialUrl("YOUTUBE", "gulyaly")).toBe("https://www.youtube.com/@gulyaly");
  });

  it("keeps a full https link as it was typed", () => {
    expect(normalizeSocialUrl("INSTAGRAM", "https://instagram.com/gulyaly.official")).toBe(
      "https://instagram.com/gulyaly.official",
    );
    expect(normalizeSocialUrl("OTHER", "https://gulyaly.com/blog")).toBe("https://gulyaly.com/blog");
  });

  it("adds https to a host-prefixed link", () => {
    expect(normalizeSocialUrl("INSTAGRAM", "instagram.com/gulyaly.official")).toBe(
      "https://instagram.com/gulyaly.official",
    );
    expect(normalizeSocialUrl("OTHER", "gulyaly.com/blog")).toBe("https://gulyaly.com/blog");
  });

  it("builds a WhatsApp link from a phone number", () => {
    expect(normalizeSocialUrl("WHATSAPP", "+993 61 123456")).toBe("https://wa.me/99361123456");
  });

  it("refuses anything that is not http(s)", () => {
    expect(() => normalizeSocialUrl("OTHER", "javascript:alert(1)")).toThrow(BadRequestException);
    expect(() => normalizeSocialUrl("OTHER", "data:text/html,hi")).toThrow(BadRequestException);
    expect(() => normalizeSocialUrl("OTHER", "ftp://gulyaly.com")).toThrow(BadRequestException);
  });

  it("refuses names and numbers that cannot be a profile", () => {
    expect(() => normalizeSocialUrl("TIKTOK", "bad name!")).toThrow(BadRequestException);
    expect(() => normalizeSocialUrl("WHATSAPP", "abc")).toThrow(BadRequestException);
    expect(() => normalizeSocialUrl("OTHER", "nodot")).toThrow(BadRequestException);
  });
});
