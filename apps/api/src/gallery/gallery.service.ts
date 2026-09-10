import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { TelegramBotService } from "../telegram-bot/telegram-bot.service";
import { EmailService } from "../email/email.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import type { UpsertGalleryCategoryDto } from "./dto/upsert-gallery-category.dto";
import type { UpsertGalleryProductDto } from "./dto/upsert-gallery-product.dto";
import type { CreateGalleryOrderDto } from "./dto/create-gallery-order.dto";
import type { UpsertStorefrontDto } from "./dto/upsert-storefront.dto";
import { slugify, uniqueSlug } from "./storefront-slug";
import type { GalleryOrderStatus } from "@prisma/client";
import { canTransition } from "../common/state-machine";
import { ADMIN_GALLERY_ORDER_TRANSITIONS, SELLER_GALLERY_ORDER_TRANSITIONS } from "./gallery-order-state-machine";
import { SellerLedgerService } from "../seller-ledger/seller-ledger.service";

const SELLER_SELECT = { id: true, handle: true, shopName: true } as const;
/** A ceiling on sections, so one account cannot fill a shop page with empty shelves. */
const MAX_STOREFRONTS = 30;
const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  seller: { select: SELLER_SELECT },
  // Which shelf of the shop this sits on, so a listing can say so without a second query.
  storefront: { select: { id: true, name: true, slug: true } },
} as const;
const ORDER_INCLUDE = { product: { include: PRODUCT_INCLUDE } } as const;

@Injectable()
export class GalleryService {
  constructor(
    private prisma: PrismaService,
    private telegramBot: TelegramBotService,
    private email: EmailService,
    private auditLog: AuditLogService,
    private ledger: SellerLedgerService,
  ) {}

  // ---- Public ----

  listCategories() {
    return this.prisma.galleryCategory.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  listProducts(
    options: {
      categoryId?: string;
      sellerId?: string;
      storefrontId?: string;
      search?: string;
    } = {},
  ) {
    const { categoryId, sellerId, storefrontId, search } = options;
    return this.prisma.galleryProduct.findMany({
      where: {
        isEnabled: true,
        category: { isEnabled: true },
        ...(categoryId ? { categoryId } : {}),
        ...(sellerId ? { sellerId } : {}),
        // A disabled section hides what is on it, the same way a disabled category does. The
        // seller turned the shelf off; the products on it did not individually go out of stock.
        ...(storefrontId ? { storefrontId, storefront: { isEnabled: true } } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { sku: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      orderBy: { sortOrder: "asc" },
      include: PRODUCT_INCLUDE,
    });
  }

  // ---- Customer ----

  async createOrder(userId: string, dto: CreateGalleryOrderDto) {
    const product = await this.prisma.galleryProduct.findUnique({ where: { id: dto.productId } });
    if (!product || !product.isEnabled) throw new BadRequestException("Товар недоступен");

    const order = await this.prisma.galleryOrder.create({
      data: {
        userId,
        productId: dto.productId,
        recipientName: dto.recipientName,
        recipientPhone: dto.recipientPhone,
        deliveryCity: dto.deliveryCity,
        deliveryAddress: dto.deliveryAddress,
        cardMessage: dto.cardMessage,
        amountTmt: product.priceTmt,
      },
      include: ORDER_INCLUDE,
    });

    if (product.sellerId) {
      void this.telegramBot.notifyNewOrder(product.sellerId, {
        productName: product.name,
        sku: product.sku,
        amountTmt: order.amountTmt.toString(),
        recipientName: order.recipientName,
        recipientPhone: order.recipientPhone,
        deliveryCity: order.deliveryCity,
        deliveryAddress: order.deliveryAddress,
        cardMessage: order.cardMessage,
      });
      // Email as well as Telegram: a seller who never linked Telegram had no notification at
      // all. Both are fire-and-forget -- neither may fail the order.
      void this.email.sendSellerNewOrder(product.sellerId, {
        id: order.id,
        productName: product.name,
        amountTmt: order.amountTmt.toString(),
        recipientName: order.recipientName,
        recipientPhone: order.recipientPhone,
        deliveryCity: order.deliveryCity,
        deliveryAddress: order.deliveryAddress,
        cardMessage: order.cardMessage,
      });
    }

    return order;
  }

  listMyOrders(userId: string) {
    return this.prisma.galleryOrder.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: ORDER_INCLUDE,
    });
  }

  // ---- Admin: categories ----

  listAllCategories() {
    return this.prisma.galleryCategory.findMany({ orderBy: { sortOrder: "asc" } });
  }

  createCategory(dto: UpsertGalleryCategoryDto) {
    return this.prisma.galleryCategory.create({ data: dto });
  }

  async updateCategory(id: string, dto: Partial<UpsertGalleryCategoryDto>) {
    await this.getCategoryOrThrow(id);
    return this.prisma.galleryCategory.update({ where: { id }, data: dto });
  }

  async deleteCategory(id: string) {
    await this.getCategoryOrThrow(id);
    const productCount = await this.prisma.galleryProduct.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw new BadRequestException("Нельзя удалить категорию с товарами — сначала удалите или перенесите товары");
    }
    await this.prisma.galleryCategory.delete({ where: { id } });
  }

  private async getCategoryOrThrow(id: string) {
    const category = await this.prisma.galleryCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  private async assertSkuFree(sku: string, excludeId?: string) {
    const existing = await this.prisma.galleryProduct.findUnique({ where: { sku } });
    if (existing && existing.id !== excludeId) throw new BadRequestException("Товар с таким артикулом уже существует");
  }

  // ---- Admin: products (sellerId left null — official Gulyaly-managed products) ----

  listAllProducts() {
    return this.prisma.galleryProduct.findMany({ orderBy: { sortOrder: "asc" }, include: PRODUCT_INCLUDE });
  }

  async createProduct(dto: UpsertGalleryProductDto) {
    await this.assertSkuFree(dto.sku);
    return this.prisma.galleryProduct.create({ data: dto, include: PRODUCT_INCLUDE });
  }

  async updateProduct(id: string, dto: Partial<UpsertGalleryProductDto>) {
    const product = await this.prisma.galleryProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    if (dto.sku) await this.assertSkuFree(dto.sku, id);
    return this.prisma.galleryProduct.update({ where: { id }, data: dto, include: PRODUCT_INCLUDE });
  }

  async deleteProduct(id: string) {
    const product = await this.prisma.galleryProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    await this.prisma.galleryProduct.delete({ where: { id } });
  }

  // ---- Admin: orders ----

  listAllOrders(status?: GalleryOrderStatus) {
    return this.prisma.galleryOrder.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        ...ORDER_INCLUDE,
        user: { select: { id: true, phone: true, fullName: true } },
      },
    });
  }

  async updateOrderStatus(
    id: string,
    status: GalleryOrderStatus,
    actorUserId: string,
    actor: "staff" | "seller" = "staff",
  ) {
    const order = await this.prisma.galleryOrder.findUnique({
      where: { id },
      include: { product: { select: { sellerId: true } } },
    });
    if (!order) throw new NotFoundException("Order not found");

    const transitions = actor === "staff" ? ADMIN_GALLERY_ORDER_TRANSITIONS : SELLER_GALLERY_ORDER_TRANSITIONS;
    if (!canTransition(transitions, order.status, status)) {
      throw new BadRequestException(`Cannot move gallery order from ${order.status} to ${status}`);
    }

    if (status !== "DELIVERED") {
      const claimed = await this.prisma.galleryOrder.updateMany({
        where: { id, status: order.status },
        data: { status },
      });
      if (claimed.count === 0) {
        throw new BadRequestException("Gallery order changed concurrently; reload and try again");
      }
      const updated = await this.prisma.galleryOrder.findUniqueOrThrow({
        where: { id },
        include: { product: { select: { name: true } } },
      });
      // Only a cancellation is worth a seller email -- the intermediate states are visible in
      // their panel and mailing every transition would train them to ignore the notifications.
      if (status === "CANCELLED" && order.product?.sellerId && order.status !== "CANCELLED") {
        void this.email.sendSellerOrderCancelled(order.product.sellerId, {
          id: updated.id,
          productName: updated.product.name,
          amountTmt: updated.amountTmt.toString(),
        });
      }
      return updated;
    }

    // Claim the not-yet-DELIVERED -> DELIVERED transition atomically: two concurrent calls for
    // the same order (a double-click, a retried request) would otherwise both read
    // order.status !== "DELIVERED" before either write commits and both credit the seller.
    const credited = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.galleryOrder.updateMany({
        where: { id, status: order.status },
        data: { status, deliveredAt: new Date() },
      });
      if (claimed.count === 0 || !order.product.sellerId) return false;
      await tx.seller.update({
        where: { id: order.product.sellerId },
        data: { balanceTmt: { increment: order.amountTmt } },
      });
      await this.ledger.record(tx, {
        sellerId: order.product.sellerId,
        type: "GALLERY_SALE_CREDIT",
        amountTmt: order.amountTmt,
        referenceType: "GalleryOrder",
        referenceId: order.id,
        idempotencyKey: `gallery-order:${order.id}:delivered`,
      });
      return true;
    });
    if (credited && order.product.sellerId) {
      this.auditLog.record(actorUserId, "seller.balance_credit", "Seller", order.product.sellerId, {
        reason: "gallery_order_delivered",
        orderId: id,
        amountTmt: order.amountTmt,
      });
    }

    return this.prisma.galleryOrder.findUniqueOrThrow({ where: { id } });
  }

  // ---- Storefronts: a shop's own sections ----

  /** Every section this shop has, running or not, with how much is on each. */
  listMyStorefronts(sellerId: string) {
    return this.prisma.storefront.findMany({
      where: { sellerId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { products: true } } },
    });
  }

  async createMyStorefront(sellerId: string, dto: UpsertStorefrontDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException("STOREFRONT_NAME_REQUIRED");
    const count = await this.prisma.storefront.count({ where: { sellerId } });
    if (count >= MAX_STOREFRONTS) throw new BadRequestException("STOREFRONT_LIMIT");

    return this.prisma.storefront.create({
      data: {
        sellerId,
        name,
        slug: await this.freeSlug(sellerId, name),
        description: dto.description?.trim() || null,
        coverUrl: dto.coverUrl || null,
        isEnabled: dto.isEnabled ?? true,
        sortOrder: dto.sortOrder ?? count,
      },
      include: { _count: { select: { products: true } } },
    });
  }

  async updateMyStorefront(sellerId: string, id: string, dto: Partial<UpsertStorefrontDto>) {
    const existing = await this.getOwnedStorefrontOrThrow(sellerId, id);
    const name = dto.name?.trim();
    // The address follows a rename, because the name is where it came from. The old one stops
    // resolving -- a shop that has published a link should rename before sending it, not after.
    const slug =
      name && name !== existing.name ? await this.freeSlug(sellerId, name, id) : undefined;

    return this.prisma.storefront.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(slug ? { slug } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.coverUrl !== undefined ? { coverUrl: dto.coverUrl || null } : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
      include: { _count: { select: { products: true } } },
    });
  }

  /**
   * Removes the section. The products on it stay, and fall back to the shop's general list.
   *
   * The database says the same thing (`ON DELETE SET NULL`); this is here so the answer can tell
   * the seller how many products just moved, rather than leaving them to notice.
   */
  async deleteMyStorefront(sellerId: string, id: string) {
    await this.getOwnedStorefrontOrThrow(sellerId, id);
    const moved = await this.prisma.galleryProduct.count({ where: { storefrontId: id } });
    await this.prisma.storefront.delete({ where: { id } });
    return { deleted: true, movedToGeneral: moved };
  }

  private async getOwnedStorefrontOrThrow(sellerId: string, id: string) {
    const storefront = await this.prisma.storefront.findUnique({ where: { id } });
    if (!storefront) throw new NotFoundException("Storefront not found");
    if (storefront.sellerId !== sellerId) throw new ForbiddenException("Not your storefront");
    return storefront;
  }

  /**
   * A section id this seller may actually use, or null.
   *
   * Every product write goes through here. Without it a seller could put their product on
   * somebody else's shelf just by pasting an id -- the dto is spread straight into the write,
   * and Prisma would accept the foreign key without ever asking whose it was.
   */
  private async ownStorefrontId(
    sellerId: string,
    storefrontId: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (storefrontId === undefined) return undefined;
    if (storefrontId === null || storefrontId === "") return null;
    await this.getOwnedStorefrontOrThrow(sellerId, storefrontId);
    return storefrontId;
  }

  private async freeSlug(sellerId: string, name: string, excludeId?: string) {
    const siblings = await this.prisma.storefront.findMany({
      where: { sellerId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { slug: true },
    });
    return uniqueSlug(slugify(name), new Set(siblings.map((row) => row.slug)));
  }

  /** The sections a visitor can see on a shop's page: running ones, in the shop's own order. */
  publicStorefronts(sellerId: string) {
    return this.prisma.storefront.findMany({
      where: { sellerId, isEnabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        coverUrl: true,
        _count: { select: { products: { where: { isEnabled: true } } } },
      },
    });
  }

  // ---- Seller self-service ----

  listMyProducts(sellerId: string) {
    return this.prisma.galleryProduct.findMany({
      where: { sellerId },
      orderBy: { sortOrder: "asc" },
      include: PRODUCT_INCLUDE,
    });
  }

  async createMyProduct(sellerId: string, dto: UpsertGalleryProductDto) {
    await this.assertSkuFree(dto.sku);
    const storefrontId = await this.ownStorefrontId(sellerId, dto.storefrontId);
    return this.prisma.galleryProduct.create({
      data: { ...dto, storefrontId: storefrontId ?? null, sellerId },
      include: PRODUCT_INCLUDE,
    });
  }

  /** One product, as its own shop sees it. Another shop's product is refused, not returned. */
  async getMyProduct(sellerId: string, id: string) {
    await this.getOwnedProductOrThrow(sellerId, id);
    return this.prisma.galleryProduct.findUniqueOrThrow({
      where: { id },
      include: PRODUCT_INCLUDE,
    });
  }

  private async getOwnedProductOrThrow(sellerId: string, id: string) {
    const product = await this.prisma.galleryProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    if (product.sellerId !== sellerId) throw new ForbiddenException("Not your product");
    return product;
  }

  async updateMyProduct(sellerId: string, id: string, dto: Partial<UpsertGalleryProductDto>) {
    await this.getOwnedProductOrThrow(sellerId, id);
    if (dto.sku) await this.assertSkuFree(dto.sku, id);
    const storefrontId = await this.ownStorefrontId(sellerId, dto.storefrontId);
    return this.prisma.galleryProduct.update({
      where: { id },
      data: { ...dto, ...(storefrontId === undefined ? {} : { storefrontId }) },
      include: PRODUCT_INCLUDE,
    });
  }

  async deleteMyProduct(sellerId: string, id: string) {
    await this.getOwnedProductOrThrow(sellerId, id);
    await this.prisma.galleryProduct.delete({ where: { id } });
  }

  listMyOrdersAsSeller(sellerId: string) {
    return this.prisma.galleryOrder.findMany({
      where: { product: { sellerId } },
      orderBy: { createdAt: "desc" },
      include: {
        ...ORDER_INCLUDE,
        user: { select: { id: true, phone: true, fullName: true } },
      },
    });
  }

  async updateMyOrderStatus(sellerId: string, orderId: string, status: GalleryOrderStatus, actorUserId: string) {
    const order = await this.prisma.galleryOrder.findUnique({
      where: { id: orderId },
      include: { product: { select: { sellerId: true } } },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.product.sellerId !== sellerId) throw new ForbiddenException("Not your order");
    return this.updateOrderStatus(orderId, status, actorUserId, "seller");
  }
}
