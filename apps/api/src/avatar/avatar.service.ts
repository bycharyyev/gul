import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ALLOWED_AVATAR_MIME_TYPES } from "./avatar.constants";

// Server-generated names only ever look like "<uuid>.<ext>" -- this also doubles as the
// defensive check against path traversal on the public GET, which takes the filename
// straight from the URL.
const STORED_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? "./uploads", "avatars");
}

@Injectable()
export class AvatarService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async upload(userId: string, file: Express.Multer.File): Promise<{ avatarUrl: string }> {
    if (!file.buffer || file.size === 0) throw new BadRequestException("File is empty");

    const ext = ALLOWED_AVATAR_MIME_TYPES[file.mimetype];
    if (!ext) throw new BadRequestException("Unsupported file type");

    const storedName = `${randomUUID()}.${ext}`;
    const previous = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });

    // avatarPath stores either a bare filename (local disk) or a full public URL (S3) --
    // toAvatarUrl() in auth.service.ts tells them apart. Whichever mode is active, this is
    // the value the DB gets: never a mix of the two for one running instance.
    // Refuse rather than silently writing to a single host's disk -- see StorageService.mode.
    if (this.storage.mode === "unavailable") {
      throw new ServiceUnavailableException("Хранилище файлов недоступно. Попробуйте позже.");
    }
    let avatarPath: string;
    if (this.storage.enabled) {
      avatarPath = await this.storage.uploadPublic(`avatars/${storedName}`, file.buffer, file.mimetype);
    } else {
      const dir = uploadsDir();
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, storedName), file.buffer);
      avatarPath = storedName;
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarPath } });
    } catch (err) {
      if (this.storage.enabled) {
        await this.storage.deletePublic(`avatars/${storedName}`);
      } else {
        await fs.unlink(path.join(uploadsDir(), storedName)).catch(() => {});
      }
      throw err;
    }

    if (previous?.avatarPath) {
      await this.deleteStored(previous.avatarPath);
    }

    return { avatarUrl: avatarPath.startsWith("http") ? avatarPath : `/api/avatar/${avatarPath}` };
  }

  async remove(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarPath: true } });
    if (!user?.avatarPath) return;

    await this.prisma.user.update({ where: { id: userId }, data: { avatarPath: null } });
    await this.deleteStored(user.avatarPath);
  }

  private async deleteStored(avatarPath: string): Promise<void> {
    const key = this.storage.publicKeyFromUrl(avatarPath);
    if (key) {
      await this.storage.deletePublic(key);
    } else if (!avatarPath.startsWith("http")) {
      await fs.unlink(path.join(uploadsDir(), avatarPath)).catch(() => {});
    }
  }

  /** Public-serving lookup: the stored filename carries no user identity, so this is
   *  intentionally not scoped to a caller -- avatars are meant to be publicly viewable,
   *  same trust level as a Seller.logoUrl or shop name. */
  resolveFilePath(storedName: string): string {
    if (!STORED_NAME_PATTERN.test(storedName)) throw new NotFoundException("Avatar not found");
    return path.join(uploadsDir(), storedName);
  }
}
