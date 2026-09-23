import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { MAX_DOCUMENTS_PER_USER } from "./documents.constants";

const mkdir = jest.fn().mockResolvedValue(undefined);
const writeFile = jest.fn().mockResolvedValue(undefined);
const unlink = jest.fn().mockResolvedValue(undefined);

// Preserve the rest of the real `node:fs` module (e.g. `existsSync`, which Prisma's
// generated client uses internally) — only stub the promise-based calls this service uses.
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
    document: {
      findMany: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
  };
}

// enabled: false -- these tests exercise the local-disk fallback path, matching how they
// behaved before S3 support was added.
function makeStorageMock() {
  return {
    enabled: false,
    mode: "local" as const,
    uploadPrivate: jest.fn(),
    deletePrivate: jest.fn(),
    presignPrivateGet: jest.fn(),
  };
}

function makeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "report.pdf",
    encoding: "7bit",
    mimetype: "application/pdf",
    buffer: Buffer.from("hello world"),
    size: 11,
    ...overrides,
  } as Express.Multer.File;
}

describe("DocumentsService", () => {
  const USER_ID = "user-1";
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: DocumentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrismaMock();
    service = new DocumentsService(prisma as never, makeStorageMock() as never);
  });

  describe("upload", () => {
    it("rejects a zero-byte file without touching disk or the DB", async () => {
      const file = makeFile({ size: 0, buffer: Buffer.alloc(0) });
      await expect(service.upload(USER_ID, file)).rejects.toBeInstanceOf(BadRequestException);
      expect(writeFile).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it("rejects once the user is at the document quota", async () => {
      prisma.document.count.mockResolvedValue(MAX_DOCUMENTS_PER_USER);
      const file = makeFile();
      await expect(service.upload(USER_ID, file)).rejects.toBeInstanceOf(BadRequestException);
      expect(writeFile).not.toHaveBeenCalled();
    });

    it("never derives the on-disk filename from the client-supplied originalName", async () => {
      const file = makeFile({ originalname: "../../etc/passwd" });
      prisma.document.create.mockResolvedValue({ id: "doc-1", originalName: file.originalname });

      await service.upload(USER_ID, file);

      const [writtenPath] = writeFile.mock.calls[0] as [string, Buffer];
      expect(writtenPath).not.toContain("passwd");
      expect(writtenPath).not.toContain("..");

      const createArgs = prisma.document.create.mock.calls[0][0];
      expect(createArgs.data.originalName).toBe("../../etc/passwd");
      expect(createArgs.data.storedName).not.toContain("..");
    });

    it("deletes the just-written file if the DB insert fails (no orphan file)", async () => {
      const file = makeFile();
      prisma.document.create.mockRejectedValue(new Error("db down"));

      await expect(service.upload(USER_ID, file)).rejects.toThrow("db down");

      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(unlink).toHaveBeenCalledTimes(1);
      const [writtenPath] = writeFile.mock.calls[0] as [string];
      const [unlinkedPath] = unlink.mock.calls[0] as [string];
      expect(unlinkedPath).toBe(writtenPath);
    });

    it("round-trips a Cyrillic originalName correctly", async () => {
      const realName = "Договор_об_оказании_услуг.pdf";
      // busboy (used internally by multer) decodes multipart headers as latin1, so by the
      // time `file.originalname` reaches us, a UTF-8 name has already been mis-decoded into
      // one JS char per raw UTF-8 byte — reproduce that here rather than the correct string.
      const misDecoded = Buffer.from(realName, "utf8").toString("latin1");
      const file = makeFile({ originalname: misDecoded });
      prisma.document.create.mockResolvedValue({ id: "doc-1" });

      await service.upload(USER_ID, file);

      const createArgs = prisma.document.create.mock.calls[0][0];
      expect(createArgs.data.originalName).toBe(realName);
    });
  });

  describe("getOwned", () => {
    it("404s when the document belongs to another user (does not leak existence)", async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(service.getOwned(USER_ID, "doc-1")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.findFirst).toHaveBeenCalledWith({ where: { id: "doc-1", userId: USER_ID } });
    });
  });

  describe("remove", () => {
    it("deletes the DB row and the file for the owner", async () => {
      const doc = { id: "doc-1", userId: USER_ID, storedName: "abc-123" };
      prisma.document.findFirst.mockResolvedValue(doc);
      prisma.document.delete.mockResolvedValue(doc);

      await service.remove(USER_ID, "doc-1");

      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: "doc-1" } });
      expect(unlink).toHaveBeenCalledTimes(1);
    });

    it("404s for another user's document id", async () => {
      prisma.document.findFirst.mockResolvedValue(null);
      await expect(service.remove(USER_ID, "not-mine")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });

    it("404s cleanly (not 500) on the second of two concurrent deletes", async () => {
      const doc = { id: "doc-1", userId: USER_ID, storedName: "abc-123" };
      prisma.document.findFirst.mockResolvedValue(doc);
      // First delete call succeeds; the second simulates Prisma's "record not found"
      // once the row is already gone.
      prisma.document.delete.mockResolvedValueOnce(doc).mockRejectedValueOnce(new Error("Record to delete does not exist."));

      const [first, second] = await Promise.allSettled([
        service.remove(USER_ID, "doc-1"),
        service.remove(USER_ID, "doc-1"),
      ]);

      expect(first.status).toBe("fulfilled");
      expect(second.status).toBe("rejected");
      if (second.status === "rejected") {
        expect(second.reason).toBeInstanceOf(NotFoundException);
      }
    });
  });
});
