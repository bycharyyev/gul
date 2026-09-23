import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertStoryDto } from "./dto/upsert-story.dto";
import type { CreateStoryAdDto } from "./dto/create-story-ad.dto";
import { SellerLedgerService } from "../seller-ledger/seller-ledger.service";

const SERVICE_SELECT = { id: true, name: true, logoUrl: true } as const;
const SELLER_SELECT = { id: true, handle: true, shopName: true } as const;
const PRODUCT_SELECT = { id: true, name: true, sku: true, imageUrl: true, sellerId: true } as const;
const STORY_INCLUDE = {
  service: { select: SERVICE_SELECT },
  seller: { select: SELLER_SELECT },
  galleryProduct: { select: PRODUCT_SELECT },
} as const;

// Paid seller ad pricing — fixed for now, tune from here.
export const STORY_AD_PRICE_TMT = 50;
export const STORY_AD_DURATION_DAYS = 3;

@Injectable()
export class StoriesService {
  constructor(private prisma: PrismaService, private ledger: SellerLedgerService) {}

  listActive() {
    const now = new Date();
    return this.prisma.story.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
      include: STORY_INCLUDE,
    });
  }

  listAll() {
    return this.prisma.story.findMany({
      orderBy: { sortOrder: "asc" },
      include: STORY_INCLUDE,
    });
  }

  async getStory(id: string) {
    const story = await this.prisma.story.findUnique({
      where: { id },
      include: STORY_INCLUDE,
    });
    if (!story) throw new NotFoundException("Story not found");
    return story;
  }

  private validateLinkTarget(dto: Partial<UpsertStoryDto>, linkType: UpsertStoryDto["linkType"]) {
    if (linkType === "INTERNAL_SERVICE" && !dto.serviceId) {
      throw new BadRequestException("serviceId is required for INTERNAL_SERVICE stories");
    }
    if ((linkType === "EXTERNAL_URL" || linkType === "PARTNER_AD") && !dto.externalUrl) {
      throw new BadRequestException("externalUrl is required for EXTERNAL_URL/PARTNER_AD stories");
    }
    if (linkType === "GALLERY_PRODUCT" && !dto.galleryProductId) {
      throw new BadRequestException("galleryProductId is required for GALLERY_PRODUCT stories");
    }
    if (linkType === "SELLER_SHOP" && !dto.sellerId) {
      throw new BadRequestException("sellerId is required for SELLER_SHOP stories");
    }
  }

  // Empty-string foreign keys (left behind by a form field that isn't relevant to the
  // selected linkType) must become undefined, or Prisma tries to satisfy a FK constraint
  // against id "".
  private sanitizeForeignKeys<T extends Partial<UpsertStoryDto>>(dto: T): T {
    const clean = { ...dto };
    for (const key of ["serviceId", "galleryProductId", "sellerId", "externalUrl"] as const) {
      if (clean[key] === "") clean[key] = undefined;
    }
    return clean;
  }

  createStory(dto: UpsertStoryDto) {
    this.validateLinkTarget(dto, dto.linkType);
    const { startsAt, endsAt, ...rest } = this.sanitizeForeignKeys(dto);
    return this.prisma.story.create({
      data: {
        ...rest,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
      },
    });
  }

  async updateStory(id: string, dto: Partial<UpsertStoryDto>) {
    const existing = await this.getStory(id);
    const linkType = dto.linkType ?? existing.linkType;
    this.validateLinkTarget(
      {
        serviceId: existing.serviceId ?? undefined,
        externalUrl: existing.externalUrl ?? undefined,
        galleryProductId: existing.galleryProductId ?? undefined,
        sellerId: existing.sellerId ?? undefined,
        ...dto,
      },
      linkType,
    );
    const { startsAt, endsAt, ...rest } = this.sanitizeForeignKeys(dto);
    return this.prisma.story.update({
      where: { id },
      data: {
        ...rest,
        startsAt: startsAt === undefined ? undefined : startsAt ? new Date(startsAt) : null,
        endsAt: endsAt === undefined ? undefined : endsAt ? new Date(endsAt) : null,
      },
    });
  }

  async deleteStory(id: string) {
    await this.getStory(id);
    await this.prisma.story.delete({ where: { id } });
  }

  // ---- Seller-purchased story ads ----

  async createSellerAd(userId: string, dto: CreateStoryAdDto) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new ForbiddenException("No seller profile for this account");

    const product = await this.prisma.galleryProduct.findUnique({ where: { id: dto.galleryProductId } });
    if (!product || product.sellerId !== seller.id) {
      throw new BadRequestException("Product not found or not owned by this seller");
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + STORY_AD_DURATION_DAYS * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.seller.updateMany({
        where: { id: seller.id, balanceTmt: { gte: STORY_AD_PRICE_TMT } },
        data: { balanceTmt: { decrement: STORY_AD_PRICE_TMT } },
      });
      if (result.count === 0) throw new BadRequestException("Недостаточно средств на балансе");

      const story = await tx.story.create({
        data: {
          title: dto.title,
          subtitle: dto.subtitle,
          imageUrl: dto.imageUrl,
          ctaLabel: dto.ctaLabel ?? "Смотреть",
          linkType: "GALLERY_PRODUCT",
          galleryProductId: dto.galleryProductId,
          sellerId: seller.id,
          sponsorLabel: seller.shopName,
          priceTmt: STORY_AD_PRICE_TMT,
          startsAt: now,
          endsAt,
          isActive: true,
        },
        include: STORY_INCLUDE,
      });
      await this.ledger.record(tx, {
        sellerId: seller.id,
        type: "STORY_AD_DEBIT",
        amountTmt: -STORY_AD_PRICE_TMT,
        referenceType: "Story",
        referenceId: story.id,
        idempotencyKey: `story:${story.id}:purchase`,
      });
      return story;
    });
  }

  async listMySellerAds(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new ForbiddenException("No seller profile for this account");
    return this.prisma.story.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: "desc" },
      include: STORY_INCLUDE,
    });
  }
}
