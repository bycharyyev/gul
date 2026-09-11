import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralsService } from "../referrals/referrals.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { EmailService } from "../email/email.service";
import type { CreateSellerDto } from "./dto/create-seller.dto";
import type { UpdateSellerDto } from "./dto/update-seller.dto";
import type { CreateSellerApplicationDto } from "./dto/create-seller-application.dto";
import type { ApplyAsMeDto } from "./dto/apply-as-me.dto";
import type { ReviewApplicationDto } from "./dto/review-application.dto";
import type { SellerApplicationStatus } from "@prisma/client";

const USER_SELECT = { id: true, phone: true, fullName: true, isBlocked: true } as const;

@Injectable()
export class SellersService {
  constructor(
    private prisma: PrismaService,
    private referrals: ReferralsService,
    private auditLog: AuditLogService,
    private email: EmailService,
  ) {}

  // ---- Admin ----

  async createSeller(dto: CreateSellerDto) {
    await this.assertPhoneAndHandleFree(dto.phone, dto.handle);

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: { phone: dto.phone, passwordHash, fullName: dto.fullName, role: "SELLER", username: dto.handle },
    });

    return this.prisma.seller.create({
      data: {
        userId: user.id,
        handle: dto.handle,
        shopName: dto.shopName,
        description: dto.description,
        logoUrl: dto.logoUrl,
      },
      include: { user: { select: USER_SELECT } },
    });
  }

  private async assertPhoneAndHandleFree(phone: string, handle: string) {
    const [existingPhone, existingHandle, handleTakenAsUsername] = await Promise.all([
      this.prisma.user.findUnique({ where: { phone } }),
      this.prisma.seller.findUnique({ where: { handle } }),
      this.referrals.isUsernameTaken(handle),
    ]);
    if (existingPhone) throw new ConflictException("PHONE_ALREADY_REGISTERED");
    if (existingHandle || handleTakenAsUsername) throw new ConflictException("Handle already taken");
  }

  listSellers() {
    return this.prisma.seller.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: USER_SELECT },
        // Sections come with the shop so the console can show what a seller has built without a
        // request per row. Names and sizes only -- staff moderate what a shop shows, and the
        // rest of a section is the seller's own arrangement.
        storefronts: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            isEnabled: true,
            _count: { select: { products: true } },
          },
        },
        _count: { select: { products: true, storefronts: true } },
      },
    });
  }

  async updateSellerAdmin(id: string, dto: UpdateSellerDto) {
    await this.getSellerOrThrow(id);
    if (dto.handle) await this.assertHandleFree(dto.handle, id);
    return this.prisma.seller.update({
      where: { id },
      data: dto,
      include: { user: { select: USER_SELECT } },
    });
  }

  private async getSellerOrThrow(id: string) {
    const seller = await this.prisma.seller.findUnique({ where: { id } });
    if (!seller) throw new NotFoundException("Seller not found");
    return seller;
  }

  private async assertHandleFree(handle: string, excludeId?: string) {
    const existing = await this.prisma.seller.findUnique({ where: { handle } });
    if (existing && existing.id !== excludeId) throw new ConflictException("Handle already taken");
  }

  // ---- Shop API ----

  /** The shop a key acts for, as its own first call should answer it. */
  async getShopForKey(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, handle: true, shopName: true, isEnabled: true, balanceTmt: true },
    });
    if (!seller) throw new NotFoundException("Seller not found");
    return seller;
  }

  /**
   * The account behind a shop.
   *
   * Needed where an action is recorded against a person -- an audited order transition, a message
   * with an author. A key has no person of its own, and the honest answer is the account that
   * owns the shop the key acts for.
   */
  async ownerUserId(sellerId: string): Promise<string> {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { userId: true },
    });
    if (!seller) throw new NotFoundException("Seller not found");
    return seller.userId;
  }

  // ---- Public ----

  async getPublicByHandle(handle: string) {
    const seller = await this.prisma.seller.findUnique({ where: { handle } });
    if (!seller || !seller.isEnabled) throw new NotFoundException("Магазин не найден");
    // Sent with the shop rather than behind a second call: the sections are the shape of the
    // page, and a shop page that renders its products first and rearranges itself when the
    // shelves arrive is worse than one that waits.
    const storefronts = await this.prisma.storefront.findMany({
      where: { sellerId: seller.id, isEnabled: true },
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
    return {
      id: seller.id,
      handle: seller.handle,
      shopName: seller.shopName,
      description: seller.description,
      logoUrl: seller.logoUrl,
      isEnabled: seller.isEnabled,
      storefronts: storefronts.map(({ _count, ...section }) => ({
        ...section,
        productCount: _count.products,
      })),
    };
  }

  // ---- Seller self-service ----

  async getMyProfile(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    return seller;
  }

  async updateMyProfile(userId: string, dto: UpdateSellerDto) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    if (dto.handle) await this.assertHandleFree(dto.handle, seller.id);
    return this.prisma.seller.update({ where: { userId }, data: dto });
  }

  async getMyStats(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");

    const [productCount, ordersByStatusRaw, deliveredOrders] = await Promise.all([
      this.prisma.galleryProduct.count({ where: { sellerId: seller.id } }),
      this.prisma.galleryOrder.groupBy({
        by: ["status"],
        where: { product: { sellerId: seller.id } },
        _count: { _all: true },
      }),
      this.prisma.galleryOrder.aggregate({
        where: { product: { sellerId: seller.id }, status: "DELIVERED" },
        _sum: { amountTmt: true },
      }),
    ]);

    return {
      productCount,
      ordersByStatus: Object.fromEntries(ordersByStatusRaw.map((r) => [r.status, r._count._all])),
      totalRevenueTmt: Number(deliveredOrders._sum.amountTmt ?? 0),
    };
  }

  /** Daily order volume for the last N days, scoped to this seller's own products. */
  async getMyTimeseries(userId: string, days: number) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    const safeDays = Math.min(Math.max(Math.round(days), 1), 365);

    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; orderCount: bigint; volumeTmt: number | null; deliveredCount: bigint }>
    >`
      SELECT
        date_trunc('day', o."createdAt") as day,
        COUNT(*) as "orderCount",
        COALESCE(SUM(o."amountTmt"), 0)::float as "volumeTmt",
        COUNT(*) FILTER (WHERE o.status = 'DELIVERED') as "deliveredCount"
      FROM "GalleryOrder" o
      JOIN "GalleryProduct" p ON p.id = o."productId"
      WHERE p."sellerId" = ${seller.id} AND o."createdAt" >= NOW() - (${safeDays} || ' days')::interval
      GROUP BY day
      ORDER BY day ASC
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      orderCount: Number(row.orderCount),
      volumeTmt: row.volumeTmt ?? 0,
      deliveredCount: Number(row.deliveredCount),
    }));
  }

  /** Best-selling products by delivered revenue, for the seller's own analytics. */
  async getMyTopProducts(userId: string, limit: number) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    const safeLimit = Math.min(Math.max(Math.round(limit), 1), 20);

    const grouped = await this.prisma.galleryOrder.groupBy({
      by: ["productId"],
      where: { product: { sellerId: seller.id }, status: "DELIVERED" },
      _sum: { amountTmt: true },
      _count: { _all: true },
      orderBy: { _sum: { amountTmt: "desc" } },
      take: safeLimit,
    });
    if (grouped.length === 0) return [];

    const products = await this.prisma.galleryProduct.findMany({
      where: { id: { in: grouped.map((g) => g.productId) } },
      select: { id: true, name: true, sku: true, imageUrl: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return grouped
      .map((g) => {
        const product = productMap.get(g.productId);
        if (!product) return null;
        return {
          productId: g.productId,
          name: product.name,
          sku: product.sku,
          imageUrl: product.imageUrl,
          orderCount: g._count._all,
          revenueTmt: Number(g._sum.amountTmt ?? 0),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  /** Resolves a Seller row for the given userId, throwing if the caller has no seller profile. */
  async requireSellerId(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new ForbiddenException("No seller profile for this account");
    return seller.id;
  }

  // ---- Telegram linking ----

  async getTelegramStatus(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    return {
      linked: !!seller.telegramChatId,
      botUsername: process.env.TELEGRAM_BOT_USERNAME ?? null,
    };
  }

  async generateTelegramLinkCode(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");

    const code = randomBytes(12).toString("hex");
    await this.prisma.seller.update({ where: { id: seller.id }, data: { telegramLinkCode: code } });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    return {
      code,
      deepLink: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
    };
  }

  async unlinkTelegram(userId: string) {
    const seller = await this.prisma.seller.findUnique({ where: { userId } });
    if (!seller) throw new NotFoundException("Seller profile not found");
    await this.prisma.seller.update({
      where: { id: seller.id },
      data: { telegramChatId: null, telegramLinkCode: null },
    });
  }

  // ---- Seller applications (public self-signup, admin-moderated) ----

  /**
   * A shop application from somebody already signed in.
   *
   * Separate from `applyForSeller` because of one thing: the identity. The public form has to ask
   * for a phone and a password, since the applicant has no account yet -- and that is exactly why
   * it cannot serve a person who does. `assertPhoneAndHandleFree` rejects a phone that is already
   * registered, so before this existed a customer could never become a seller at all. The public
   * "become a seller" page was unusable for anybody who had ever ordered anything.
   *
   * Here the phone comes off the session and nothing about who is applying is read from the body.
   */
  async applyAsCurrentUser(userId: string, dto: ApplyAsMeDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, email: true, fullName: true, passwordHash: true, role: true },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.role === "SELLER") throw new ConflictException("У вас уже есть магазин");
    if (user.role !== "CUSTOMER") {
      // A staff account running a shop it also moderates is a conflict of interest, not a
      // convenience. If it is ever wanted it should be a deliberate decision, not a side effect.
      throw new ConflictException("Сотрудник не может подать заявку на магазин");
    }

    await this.assertHandleFree(dto.handle);
    if (await this.referrals.isUsernameTaken(dto.handle)) {
      throw new ConflictException("Handle already taken");
    }

    const pendingConflict = await this.prisma.sellerApplication.findFirst({
      where: { status: "PENDING", OR: [{ phone: user.phone }, { handle: dto.handle }] },
    });
    if (pendingConflict) {
      throw new ConflictException("Заявка с таким телефоном или username уже на рассмотрении");
    }

    const application = await this.prisma.sellerApplication.create({
      data: {
        phone: user.phone,
        email: user.email,
        // Never used for this application -- approval promotes the existing account and leaves
        // its password alone. Carried because the column is required and because an application
        // must still be approvable if the account is deleted before review.
        passwordHash: user.passwordHash,
        fullName: user.fullName,
        handle: dto.handle,
        shopName: dto.shopName,
        description: dto.description,
      },
    });

    return { id: application.id, status: application.status };
  }

  async applyForSeller(dto: CreateSellerApplicationDto) {
    await this.assertPhoneAndHandleFree(dto.phone, dto.handle);

    const pendingConflict = await this.prisma.sellerApplication.findFirst({
      where: { status: "PENDING", OR: [{ phone: dto.phone }, { handle: dto.handle }] },
    });
    if (pendingConflict) {
      throw new ConflictException("Заявка с таким телефоном или username уже на рассмотрении");
    }

    const passwordHash = await argon2.hash(dto.password);
    const application = await this.prisma.sellerApplication.create({
      data: {
        phone: dto.phone,
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        handle: dto.handle,
        shopName: dto.shopName,
        description: dto.description,
      },
      select: {
        id: true,
        phone: true,
        email: true,
        fullName: true,
        handle: true,
        shopName: true,
        description: true,
        status: true,
        createdAt: true,
      },
    });

    // Acknowledge immediately. Review can take days, and until approval this is the only channel
    // that reaches the applicant -- silence here is what produces "did you get my application?"
    // support tickets and applicants who give up.
    void this.email.sendSellerApplicationMail("SELLER_APPLICATION_RECEIVED", {
      email: application.email,
      name: application.fullName ?? application.shopName,
    });

    return application;
  }

  listApplications(status?: SellerApplicationStatus) {
    return this.prisma.sellerApplication.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        phone: true,
        fullName: true,
        handle: true,
        shopName: true,
        description: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
  }

  private async getApplicationOrThrow(id: string) {
    const application = await this.prisma.sellerApplication.findUnique({ where: { id } });
    if (!application) throw new NotFoundException("Application not found");
    if (application.status !== "PENDING") throw new BadRequestException("Заявка уже обработана");
    return application;
  }

  async approveApplication(id: string, dto: ReviewApplicationDto, adminId: string) {
    const application = await this.getApplicationOrThrow(id);

    // The account this application belongs to, if there already is one. Applications filed from
    // inside the app name a phone that is already registered on purpose -- approving those must
    // promote that account rather than refuse, which is what used to happen.
    const existing = await this.prisma.user.findUnique({
      where: { phone: application.phone },
      select: { id: true, role: true },
    });

    // The handle is checked either way: it becomes a public @name and must still be free.
    await this.assertHandleFree(application.handle);
    if (await this.referrals.isUsernameTaken(application.handle)) {
      throw new ConflictException("Handle already taken");
    }
    if (existing) {
      if (existing.role === "SELLER") throw new ConflictException("У этого аккаунта уже есть магазин");
      if (existing.role !== "CUSTOMER") {
        throw new ConflictException("Сотрудник не может стать продавцом");
      }
      return this.promoteToSeller(existing.id, application, dto, adminId);
    }

    // The application address is carried onto the account, but deliberately as UNVERIFIED: they
    // typed it into a form, which is not proof they control it. Order and payout mail stays
    // gated on verification; the approval email below asks them to confirm it.
    //
    // `email` is unique on User, so an address already used by another account would make the
    // whole approval fail. Approval must not hinge on that -- fall back to creating the account
    // without it and let them set one themselves.
    const emailTaken = application.email
      ? !!(await this.prisma.user.findUnique({ where: { email: application.email }, select: { id: true } }))
      : false;

    const user = await this.prisma.user.create({
      data: {
        phone: application.phone,
        email: emailTaken ? null : application.email,
        passwordHash: application.passwordHash,
        fullName: application.fullName,
        role: "SELLER",
        username: application.handle,
      },
    });
    const seller = await this.prisma.seller.create({
      data: {
        userId: user.id,
        handle: application.handle,
        shopName: application.shopName,
        description: application.description,
      },
      include: { user: { select: USER_SELECT } },
    });

    await this.prisma.sellerApplication.update({
      where: { id },
      data: { status: "APPROVED", reviewNote: dto.note, reviewedAt: new Date() },
    });

    this.auditLog.record(adminId, "seller.application.approve", "SellerApplication", id, { sellerId: seller.id });

    // The activation moment: without this the applicant has no way to learn they were approved
    // and simply has to keep trying to log in.
    void this.email.sendSellerApplicationMail("SELLER_APPROVED", {
      email: application.email,
      name: application.fullName ?? seller.shopName,
      shopName: seller.shopName,
    });

    return seller;
  }

  /**
   * Turns an existing customer into a seller.
   *
   * Their password, name and email are left exactly as they are. The application carries a
   * password hash because the public form collects one, and applying it here would let anybody
   * who filed an application overwrite the credentials of the account it named -- the one thing
   * this path must never do.
   */
  private async promoteToSeller(
    userId: string,
    application: { id: string; handle: string; shopName: string; description: string | null; email: string | null; fullName: string | null },
    dto: ReviewApplicationDto,
    adminId: string,
  ) {
    const [, seller] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { role: "SELLER" },
      }),
      this.prisma.seller.create({
        data: {
          userId,
          handle: application.handle,
          shopName: application.shopName,
          description: application.description,
        },
        include: { user: { select: USER_SELECT } },
      }),
      this.prisma.sellerApplication.update({
        where: { id: application.id },
        data: { status: "APPROVED", reviewNote: dto.note, reviewedAt: new Date() },
      }),
    ]);

    this.auditLog.record(adminId, "seller.application.approve", "SellerApplication", application.id, {
      sellerId: seller.id,
      promotedExistingUser: userId,
    });

    void this.email.sendSellerApplicationMail("SELLER_APPROVED", {
      email: application.email,
      name: application.fullName ?? seller.shopName,
      shopName: seller.shopName,
    });

    return seller;
  }

  async rejectApplication(id: string, dto: ReviewApplicationDto, adminId: string) {
    const application = await this.getApplicationOrThrow(id);
    const updated = await this.prisma.sellerApplication.update({
      where: { id },
      data: { status: "REJECTED", reviewNote: dto.note, reviewedAt: new Date() },
    });
    this.auditLog.record(adminId, "seller.application.reject", "SellerApplication", id);

    // The reason is what makes a rejection actionable -- without it the applicant cannot fix
    // anything and simply churns.
    void this.email.sendSellerApplicationMail("SELLER_REJECTED", {
      email: application.email,
      name: application.fullName ?? application.shopName,
      reason: dto.note,
    });

    return updated;
  }
}
