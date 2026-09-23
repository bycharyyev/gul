import { NotFoundException } from "@nestjs/common";
import { AvatarService } from "./avatar.service";

const mkdir = jest.fn().mockResolvedValue(undefined);
const writeFile = jest.fn().mockResolvedValue(undefined);
const unlink = jest.fn().mockResolvedValue(undefined);

jest.mock("node:fs", () => ({
  ...jest.requireActual("node:fs"),
  promises: {
    ...jest.requireActual("node:fs").promises,
    mkdir: (...args: unknown[]) => mkdir(...args),
    writeFile: (...args: unknown[]) => writeFile(...args),
    unlink: (...args: unknown[]) => unlink(...args),
  },
}));

function makePrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

// enabled: false -- these tests exercise the local-disk fallback path, matching how they
// behaved before S3 support was added. S3 upload/delete paths are covered separately.
function makeStorageMock() {
  return {
    enabled: false,
    mode: "local" as const,
    uploadPublic: jest.fn(),
    deletePublic: jest.fn(),
    publicKeyFromUrl: jest.fn().mockReturnValue(null),
  };
}

function makeImageFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "photo.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    buffer: Buffer.from("fake-image-bytes"),
    size: 16,
    stream: undefined as never,
    destination: "",
    filename: "",
    path: "",
    ...overrides,
  };
}

describe("AvatarService", () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AvatarService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrismaMock();
    service = new AvatarService(prisma as never, makeStorageMock() as never);
  });

  describe("upload", () => {
    it("rejects an unsupported mime type", async () => {
      await expect(service.upload("user-1", makeImageFile({ mimetype: "application/pdf" }))).rejects.toThrow(
        "Unsupported file type",
      );
      expect(writeFile).not.toHaveBeenCalled();
    });

    it("rejects an empty file", async () => {
      await expect(
        service.upload("user-1", makeImageFile({ buffer: Buffer.alloc(0), size: 0 })),
      ).rejects.toThrow("File is empty");
    });

    it("deletes the previous avatar file after a successful replace", async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarPath: "old-uuid.png" });
      prisma.user.update.mockResolvedValue({});

      const result = await service.upload("user-1", makeImageFile());

      expect(result.avatarUrl).toMatch(/^\/api\/avatar\/[0-9a-f-]{36}\.jpg$/);
      expect(unlink).toHaveBeenCalledTimes(1);
      expect(unlink.mock.calls[0][0]).toContain("old-uuid.png");
    });

    it("does not attempt to delete anything when there was no previous avatar", async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarPath: null });
      prisma.user.update.mockResolvedValue({});

      await service.upload("user-1", makeImageFile());
      expect(unlink).not.toHaveBeenCalled();
    });

    it("cleans up the newly written file if the DB update fails", async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarPath: null });
      prisma.user.update.mockRejectedValue(new Error("db down"));

      await expect(service.upload("user-1", makeImageFile())).rejects.toThrow("db down");
      expect(unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe("remove", () => {
    it("is a no-op when the user has no avatar", async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarPath: null });
      await service.remove("user-1");
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(unlink).not.toHaveBeenCalled();
    });

    it("clears the path and deletes the file when one exists", async () => {
      prisma.user.findUnique.mockResolvedValue({ avatarPath: "some-uuid.webp" });
      await service.remove("user-1");
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { avatarPath: null } });
      expect(unlink).toHaveBeenCalledTimes(1);
    });
  });

  describe("resolveFilePath", () => {
    it("accepts a well-formed stored filename", () => {
      const path = service.resolveFilePath("3f2504e0-4f89-11d3-9a0c-0305e82c3301.png");
      expect(path).toContain("3f2504e0-4f89-11d3-9a0c-0305e82c3301.png");
    });

    it("rejects a path-traversal attempt instead of building a path from it", () => {
      expect(() => service.resolveFilePath("../../etc/passwd")).toThrow(NotFoundException);
    });

    it("rejects a disallowed extension", () => {
      expect(() => service.resolveFilePath("3f2504e0-4f89-11d3-9a0c-0305e82c3301.exe")).toThrow(NotFoundException);
    });
  });
});
