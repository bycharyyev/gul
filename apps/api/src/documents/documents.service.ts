import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { MAX_DOCUMENTS_PER_USER } from "./documents.constants";

/** Resolved lazily (per-call, not at module load) so it reflects `UPLOADS_DIR` once dotenv has run. */
function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? "./uploads");
}

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  listMine(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(userId: string, file: Express.Multer.File) {
    if (!file.buffer || file.size === 0) {
      throw new BadRequestException("File is empty");
    }

    const count = await this.prisma.document.count({ where: { userId } });
    if (count >= MAX_DOCUMENTS_PER_USER) {
      throw new BadRequestException(`Document limit reached (max ${MAX_DOCUMENTS_PER_USER})`);
    }

    // storedName is the opaque key -- never derived from the client-supplied originalName,
    // so a crafted "../../etc/passwd" originalName can't escape uploadsDir (local mode) or
    // collide with another object's key (S3 mode).
    // Refuse rather than silently writing to a single host's disk -- see StorageService.mode.
    if (this.storage.mode === "unavailable") {
      throw new ServiceUnavailableException("Хранилище файлов недоступно. Попробуйте позже.");
    }
    const storedName = randomUUID();
    const storageBackend = this.storage.enabled ? "s3" : "local";

    if (storageBackend === "s3") {
      await this.storage.uploadPrivate(`documents/${storedName}`, file.buffer, file.mimetype);
    } else {
      const dir = uploadsDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, storedName), file.buffer);
    }

    // busboy (which multer uses internally) decodes multipart headers — including the
    // filename — as latin1, not UTF-8, even though browsers send UTF-8 bytes. Re-decoding
    // here undoes that mis-decode; without it, non-ASCII names (e.g. Cyrillic) come out
    // as mojibake. Pure-ASCII names are unaffected (latin1 and UTF-8 agree below 0x80).
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");

    try {
      return await this.prisma.document.create({
        data: {
          userId,
          originalName,
          storedName,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storageBackend,
        },
      });
    } catch (err) {
      // DB insert failed after the file landed on disk/S3 — don't leave an orphan.
      if (storageBackend === "s3") {
        await this.storage.deletePrivate(`documents/${storedName}`);
      } else {
        await fs.unlink(path.join(uploadsDir(), storedName)).catch(() => {});
      }
      throw err;
    }
  }

  async getOwned(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("Document not found");
    return doc;
  }

  /** Only meaningful for storageBackend "local". */
  filePath(doc: { storedName: string }): string {
    return path.join(uploadsDir(), doc.storedName);
  }

  /** Only meaningful for storageBackend "s3" -- short-lived, ownership already checked by getOwned(). */
  presignedUrl(doc: { storedName: string }): Promise<string> {
    return this.storage.presignPrivateGet(`documents/${doc.storedName}`);
  }

  async remove(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!doc) throw new NotFoundException("Document not found");

    try {
      // The delete itself is the race guard: if a concurrent request already removed
      // this row, Prisma throws (record not found) and we 404 instead of double-removing.
      await this.prisma.document.delete({ where: { id } });
    } catch {
      throw new NotFoundException("Document not found");
    }

    if (doc.storageBackend === "s3") {
      await this.storage.deletePrivate(`documents/${doc.storedName}`);
    } else {
      await fs.unlink(this.filePath(doc)).catch(() => {});
    }
  }
}
