import { BadRequestException } from "@nestjs/common";
import { UploadsService } from "./uploads.service";

// Leading bytes real files of each type start with -- the service now checks content against the
// declared type (common/file-signature.ts).
const SAMPLE_BYTES: Record<string, Buffer> = {
  "image/webp": Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
  "video/mp4": Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom")]),
};

function file(mimetype: string, buffer = SAMPLE_BYTES[mimetype] ?? Buffer.from("test")): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "sample",
    encoding: "7bit",
    mimetype,
    size: buffer.length,
    buffer,
  } as Express.Multer.File;
}

function emptyFile(mimetype: string): Express.Multer.File {
  return {
    ...file(mimetype),
    size: 0,
    buffer: Buffer.alloc(0),
  } as Express.Multer.File;
}

describe("UploadsService social media uploads", () => {
  const storage = {
    mode: "s3",
    enabled: true,
    uploadPublic: jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(`https://cdn.test/${key}`),
      ),
  };

  beforeEach(() => storage.uploadPublic.mockClear());

  it("returns IMAGE for allowed image media", async () => {
    await expect(
      new UploadsService(storage as never).uploadMedia(file("image/webp")),
    ).resolves.toMatchObject({ mediaType: "IMAGE" });
  });

  it("returns VIDEO for allowed video media", async () => {
    await expect(
      new UploadsService(storage as never).uploadMedia(file("video/mp4")),
    ).resolves.toMatchObject({ mediaType: "VIDEO" });
  });

  it("rejects unsupported social media files", async () => {
    await expect(
      new UploadsService(storage as never).uploadMedia(file("text/html")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a page declared as an image (content must match the type)", async () => {
    const html = file("image/png", Buffer.from("<!doctype html><script>alert(1)</script>"));
    await expect(new UploadsService(storage as never).upload(html)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.uploadPublic).not.toHaveBeenCalled();
  });

  it("rejects empty social media files", async () => {
    await expect(
      new UploadsService(storage as never).uploadMedia(emptyFile("video/mp4")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
