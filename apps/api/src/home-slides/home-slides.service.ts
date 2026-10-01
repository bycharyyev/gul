import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpsertHomeSlideDto } from "./dto/upsert-home-slide.dto";
import type { CreateSlideAdDto } from "./dto/create-slide-ad.dto";
import { SellerLedgerService } from "../seller-ledger/seller-ledger.service";
import { MarketplaceSettingsService } from "../marketplace-settings/marketplace-settings.service";

const SERVICE_SELECT = { id: true, name: true, logoUrl: true } as const;
const SELLER_SELECT = { id: true, handle: true, shopName: true } as const;
const PRODUCT_SELECT = { id: true, name: true, sku: true, imageUrl: true, sellerId: true } as const;
const SLIDE_INCLUDE = {
  service: { select: SERVICE_SELECT },
  seller: { select: SELLER_SELECT },
  galleryProduct: { select: PRODUCT_SELECT },
} as const;


@Injectable()
export class HomeSlidesService {
  constructor(
    private prisma: PrismaService,
    private ledger: SellerLedgerService,
    private marketplaceSettings: MarketplaceSettingsService,
  ) {}

  listActive() {
    const now = new Date();
    return this.prisma.homeSlide.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { sortOrder: "asc" },
      include: SLIDE_INCLUDE,
    });
  }

  listAll() {
    return this.prisma.homeSlide.findMany({
      orderBy: { sortOrder: "asc" },
      include: SLIDE_INCLUDE,
    });
  }

  async getSlide(id: string) {
    const slide = await this.prisma.homeSlide.findUnique({ where: { id }, include: SLIDE_INCLUDE });
    if (!slide) throw new NotFoundException("Slide not found");
    return slide;
  }

  private validateLinkTarget(dto: Partial<UpsertHomeSlideDto>, linkType: UpsertHomeSlideDto["linkType"]) {
    if (linkType === "INTERNAL_SERVICE" && !dto.serviceId) {
      throw new BadRequestException("serviceId is required for INTERNAL_SERVICE slides");
    }
    if (linkType === "EXTERNAL_URL" && !dto.externalUrl) {
      throw new BadRequestException("externalUrl is required for EXTERNAL_URL slides");
    }
    if (linkType === "GALLERY_PRODUCT" && !dto.galleryProductId) {
      throw new BadRequestException("galleryProductId is required for GALLERY_PRODUCT slides");
    }
    if (linkType === "SELLER_SHOP" && !dto.sellerId) {
      throw new BadRequestException("sellerId is required for SELLER_SHOP slides");
    }
  }

  // Empty-string foreign keys (left behind by a form field that isn't relevant to the
  // selected linkType) must become undefined, or Prisma tries to satisfy a FK constraint
  // against id "".
  private sanitizeForeignKeys<T extends Partial<UpsertHomeSlideDto>>(dto: T): T {
    const clean = { ...dto };
    for (const key of ["serviceId", "galleryProductId", "sellerId", "externalUrl"] as const) {
      if (clean[key] === "") clean[key] = undefined;
    }
    return clean;
  }

  createSlide(dto: UpsertHomeSlideDto) {
    this.validateLinkTarget(dto, dto.linkType);
    const { startsAt, endsAt, ...rest } = this.sanitizeForeignKeys(dto);
    return this.prisma.homeSlide.create({
      data: {
        ...rest,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        endsAt: endsAt ? new Date(endsAt) : undefined,
      },
    });
  }

  async updateSlide(id: string, dto: Partial<UpsertHomeSlideDto>) {
    const existing = await this.getSlide(id);
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
    return this.prisma.homeSlide.update({
      where: { id },
      data: {
        ...rest,
        startsAt: startsAt === undefined ? undefined : startsAt ? new Date(startsAt) : null,
        endsAt: endsAt === undefined ? undefined : endsAt ? new Date(endsAt) : null,
      },
    });
  }

  async deleteSlide(id: string) {
    await this.getSlide(id);
    await this.prisma.homeSlide.delete({ where: { id } });
  }

  // ---- Seller-purchased hero ads ----

  async createSellerAd(userId: string, dto: CreateSlideAdDto) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new ForbiddenException("No seller profile for this account");

    const product = await this.prisma.galleryProduct.findUnique({ where: { id: dto.galleryProductId } });
    if (!product || product.sellerId !== seller.id) {
      throw new BadRequestException("Product not found or not owned by this seller");
    }

    // Price and run length are settings (E-05); the price is snapshotted onto the ad below.
    const { priceTmt, durationDays } = await this.marketplaceSettings.getAdPricing("slide");
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.seller.updateMany({
        where: { id: seller.id, balanceTmt: { gte: priceTmt } },
        data: { balanceTmt: { decrement: priceTmt } },
      });
      if (result.count === 0) throw new BadRequestException("Недостаточно средств на балансе");

      const slide = await tx.homeSlide.create({
        data: {
          title: dto.title,
          subtitle: dto.subtitle,
          imageUrl: dto.imageUrl,
          ctaLabel: dto.ctaLabel ?? "Смотреть",
          linkType: "GALLERY_PRODUCT",
          galleryProductId: dto.galleryProductId,
          sellerId: seller.id,
          sponsorLabel: seller.shopName,
          priceTmt,
          startsAt: now,
          endsAt,
          isActive: true,
        },
        include: SLIDE_INCLUDE,
      });
      await this.ledger.record(tx, {
        sellerId: seller.id,
        type: "SLIDE_AD_DEBIT",
        amountTmt: -priceTmt,
        referenceType: "HomeSlide",
        referenceId: slide.id,
        idempotencyKey: `home-slide:${slide.id}:purchase`,
      });
      return slide;
    });
  }

  async listMySellerAds(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new ForbiddenException("No seller profile for this account");
    return this.prisma.homeSlide.findMany({
      where: { sellerId: seller.id },
      orderBy: { createdAt: "desc" },
      include: SLIDE_INCLUDE,
    });
  }
}
