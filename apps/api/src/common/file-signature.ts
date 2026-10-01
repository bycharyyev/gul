/**
 * Does a file's content match the type the client declared?
 *
 * Every upload path filters on `file.mimetype`, which is whatever the client put in the multipart
 * Content-Type -- an HTML page or a script can be sent as "image/png" and stored and served under
 * that type (S-11 in docs/analysis/SECURITY.md). Public uploads are now also decoded by the web
 * app's image optimizer, so "is this really an image" matters more than it did. This checks the
 * leading bytes against the format's signature for every type the API accepts; anything not listed
 * here is refused, so a new allowed type has to add its signature to be uploadable at all.
 *
 * Signatures only: this proves the container format, not that the file is well-formed or benign.
 */

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

function hasBytes(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buffer[offset + i] === byte);
}

const isJpeg = (b: Buffer) => hasBytes(b, [0xff, 0xd8, 0xff]);
const isPng = (b: Buffer) => hasBytes(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isGif = (b: Buffer) => hasBytes(b, ascii("GIF87a")) || hasBytes(b, ascii("GIF89a"));
const isWebp = (b: Buffer) => hasBytes(b, ascii("RIFF")) && hasBytes(b, ascii("WEBP"), 8);

// ISO base media (MP4) always opens with an `ftyp` box; older QuickTime files may open with
// another top-level atom instead.
const isMp4 = (b: Buffer) => hasBytes(b, ascii("ftyp"), 4);
const isQuickTime = (b: Buffer) => ["ftyp", "moov", "mdat", "wide", "free", "skip"].some((atom) => hasBytes(b, ascii(atom), 4));
const isWebm = (b: Buffer) => hasBytes(b, [0x1a, 0x45, 0xdf, 0xa3]);

// The PDF spec allows junk before the header as long as it's within the first 1024 bytes.
const isPdf = (b: Buffer) => b.subarray(0, 1024).includes("%PDF-");
// docx/xlsx are zip archives; an empty zip has only the end-of-central-directory record.
const isZip = (b: Buffer) => hasBytes(b, [0x50, 0x4b, 0x03, 0x04]) || hasBytes(b, [0x50, 0x4b, 0x05, 0x06]);
// Legacy .doc/.xls: OLE compound file.
const isOle = (b: Buffer) => hasBytes(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// Text has no signature, so this rejects what text isn't: binary (NUL bytes) and markup a browser
// could render as a page.
function isPlainText(b: Buffer): boolean {
  const head = b.subarray(0, 8192);
  if (head.includes(0)) return false;
  const start = head.toString("utf8").replace(/^﻿/, "").trimStart().slice(0, 64).toLowerCase();
  return !/^<(?:!doctype|html|head|body|script|svg|iframe|\?xml)/.test(start);
}

const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  "image/jpeg": isJpeg,
  "image/png": isPng,
  "image/gif": isGif,
  "image/webp": isWebp,
  "video/mp4": isMp4,
  "video/quicktime": isQuickTime,
  "video/webm": isWebm,
  "application/pdf": isPdf,
  "application/zip": isZip,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": isZip,
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": isZip,
  "application/msword": isOle,
  "application/vnd.ms-excel": isOle,
  "text/plain": isPlainText,
  "text/csv": isPlainText,
};

export function contentMatchesDeclaredType(buffer: Buffer, mimetype: string): boolean {
  const check = SIGNATURES[mimetype];
  return check ? check(buffer) : false;
}
