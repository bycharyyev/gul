import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "./storage.service";

/** Only files written by UploadsService.upload land under this prefix with a uuid name. */
const OWN_UPLOAD_KEY = /^uploads\/[0-9a-f-]{36}\.[a-z0-9]+$/;

/**
 * Deletes an image from the public bucket once a record stops pointing at it.
 *
 * Every admin and seller form that takes an uploaded image calls this after saving: the old URL
 * is removed only when it is one of our own uploads and no column in any table still holds it.
 * Uploads are a shared pool (a story and a home slide can show the same file), so the reference
 * check is what keeps a replacement from breaking an image somebody else is still showing.
 */
@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  /** Call after a save with the value that was stored before and the value now stored. Never
   *  throws: the save has already happened, and a failed cleanup must not report it as failed. */
  async removeIfReplaced(
    previous: string | null | undefined,
    current: string | null | undefined,
  ): Promise<void> {
    if (!previous || previous === current) return;
    try {
      const base = this.storage.publicBase;
      if (!base || !previous.startsWith(`${base}/`)) return;
      const key = previous.slice(base.length + 1);
      if (!OWN_UPLOAD_KEY.test(key)) return;
      if (await this.isReferenced(previous)) return;
      await this.storage.deletePublic(key);
    } catch (err) {
      this.logger.warn(`Could not remove replaced upload: ${err instanceof Error ? err.message : "error"}`);
    }
  }

  private async isReferenced(url: string): Promise<boolean> {
    const counts = await Promise.all([
      this.prisma.service.count({ where: { logoUrl: url } }),
      this.prisma.seller.count({ where: { logoUrl: url } }),
      this.prisma.story.count({ where: { imageUrl: url } }),
      this.prisma.homeSlide.count({ where: { imageUrl: url } }),
      this.prisma.chatRoom.count({ where: { imageUrl: url } }),
      this.prisma.chatMessage.count({ where: { attachmentUrl: url } }),
      this.prisma.supportMessage.count({ where: { attachmentUrl: url } }),
      this.prisma.galleryProduct.count({ where: { imageUrl: url } }),
      this.prisma.storefront.count({ where: { coverUrl: url } }),
      this.prisma.socialPost.count({ where: { OR: [{ mediaUrl: url }, { thumbnailUrl: url }] } }),
      this.prisma.cargoBanner.count({ where: { imageUrl: url } }),
      this.prisma.pushTemplate.count({ where: { imageUrl: url } }),
      this.prisma.pushCampaign.count({ where: { imageUrl: url } }),
      this.prisma.marketplacePurchaseItem.count({ where: { imageUrlSnapshot: url } }),
    ]);
    return counts.some((n) => n > 0);
  }
}
