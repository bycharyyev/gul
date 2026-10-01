import { contentMatchesDeclaredType } from "./file-signature";

const bytes = (...parts: (string | number[])[]) =>
  Buffer.concat(parts.map((p) => (typeof p === "string" ? Buffer.from(p, "utf8") : Buffer.from(p))));

describe("contentMatchesDeclaredType", () => {
  it.each([
    ["image/jpeg", bytes([0xff, 0xd8, 0xff, 0xe0])],
    ["image/png", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
    ["image/gif", bytes("GIF89a")],
    ["image/webp", bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")],
    ["video/mp4", bytes([0, 0, 0, 0x18], "ftypmp42")],
    ["video/quicktime", bytes([0, 0, 0, 0x14], "ftypqt  ")],
    ["video/quicktime", bytes([0, 0, 0, 0x08], "moov")],
    ["video/webm", bytes([0x1a, 0x45, 0xdf, 0xa3])],
    ["application/pdf", bytes("%PDF-1.7")],
    ["application/pdf", bytes("junk before the header %PDF-1.4")],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes("PK", [3, 4])],
    ["application/zip", bytes("PK", [5, 6])],
    ["application/msword", bytes([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ["text/plain", bytes("Здравствуйте, это обычный текст")],
    ["text/csv", bytes("﻿phone,amount\n+99361234567,10")],
  ])("accepts real %s", (mimetype, buffer) => {
    expect(contentMatchesDeclaredType(buffer, mimetype)).toBe(true);
  });

  it.each([
    ["an HTML page sent as image/png", "image/png", bytes("<!doctype html><script>x</script>")],
    ["a PNG sent as image/jpeg", "image/jpeg", bytes([0x89, 0x50, 0x4e, 0x47])],
    ["a RIFF that is not WebP (WAV)", "image/webp", bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")],
    ["a shell script sent as video/mp4", "video/mp4", bytes("#!/bin/sh\nrm -rf /")],
    ["an HTML page sent as text/plain", "text/plain", bytes("  <html><body>x</body></html>")],
    ["an SVG sent as text/plain", "text/plain", bytes("<svg onload=alert(1)>")],
    ["binary sent as text/csv", "text/csv", bytes([0x50, 0x00, 0x51])],
    ["a truncated file shorter than the signature", "image/png", bytes([0x89, 0x50])],
    ["any type with no known signature", "image/svg+xml", bytes("<svg/>")],
  ])("rejects %s", (_label, mimetype, buffer) => {
    expect(contentMatchesDeclaredType(buffer, mimetype)).toBe(false);
  });
});
