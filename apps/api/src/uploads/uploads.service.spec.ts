import { BadRequestException } from "@nestjs/common";
import { UploadsService } from "./uploads.service";

function file(mimetype: string): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "sample",
    encoding: "7bit",
    mimetype,
    size: 4,
    buffer: Buffer.from("test"),
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

  it("rejects empty social media files", async () => {
    await expect(
      new UploadsService(storage as never).uploadMedia(emptyFile("video/mp4")),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
