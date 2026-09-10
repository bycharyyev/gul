import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { StorageService } from "../storage/storage.service";
import {
  ALLOWED_UPLOAD_IMAGE_MIME_TYPES,
  ALLOWED_UPLOAD_MEDIA_MIME_TYPES,
  ALLOWED_UPLOAD_VIDEO_MIME_TYPES,
} from "./uploads.constants";

const STORED_NAME_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|webm|mov)$/;

function uploadsDir(): string {
  return path.resolve(process.env.UPLOADS_DIR ?? "./uploads", "images");
}

/** General-purpose public image upload -- used wherever the app has a plain "imageUrl"/"logoUrl"
 *  field (gallery products, stories, home slides, seller shop logo, service logo). Unlike
 *  avatar/documents, there's no owning record here: this just returns a URL for the caller to
 *  put wherever they need it. Any authenticated user can call it (same trust level as avatar
 *  upload) -- authorization for what that URL is then used for belongs to each entity's own
 *  upsert endpoint, not here. */
@Injectable()
export class UploadsService {
  constructor(private storage: StorageService) {}

  async upload(file: Express.Multer.File): Promise<{ url: string }> {
    return this.store(file, ALLOWED_UPLOAD_IMAGE_MIME_TYPES);
  }

  async uploadMedia(
    file: Express.Multer.File,
  ): Promise<{ url: string; mediaType: "IMAGE" | "VIDEO" }> {
    const result = await this.store(file, ALLOWED_UPLOAD_MEDIA_MIME_TYPES);
    return {
      ...result,
      mediaType: ALLOWED_UPLOAD_VIDEO_MIME_TYPES[file.mimetype]
        ? "VIDEO"
        : "IMAGE",
    };
  }

  private async store(
    file: Express.Multer.File,
    allowedMimeTypes: Record<string, string>,
  ): Promise<{ url: string }> {
    if (!file.buffer || file.size === 0)
      throw new BadRequestException("File is empty");

    const ext = allowedMimeTypes[file.mimetype];
    if (!ext) throw new BadRequestException("Unsupported file type");

    // Same guard as avatars and documents: in production a missing S3 config must refuse the
    // upload rather than quietly write to one host's disk, where the other active/active host
    // cannot serve it. See StorageService.mode.
    if (this.storage.mode === "unavailable") {
      throw new ServiceUnavailableException(
        "Хранилище файлов недоступно. Попробуйте позже.",
      );
    }

    const storedName = `${randomUUID()}.${ext}`;

    if (this.storage.enabled) {
      const url = await this.storage.uploadPublic(
        `uploads/${storedName}`,
        file.buffer,
        file.mimetype,
      );
      return { url };
    }

    const dir = uploadsDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, storedName), file.buffer);
    return { url: `/api/uploads/${storedName}` };
  }

  /** Local-disk fallback lookup only -- S3-backed uploads are served directly from their public
   *  URL and never hit this route. */
  resolveFilePath(storedName: string): string {
    if (!STORED_NAME_PATTERN.test(storedName))
      throw new NotFoundException("File not found");
    return path.join(uploadsDir(), storedName);
  }
}
