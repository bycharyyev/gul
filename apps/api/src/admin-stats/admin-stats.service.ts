import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import type { CurrencyCode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";

@Injectable()
export class AdminStatsService {
  constructor(
    private prisma: PrismaService,
    @Inject(TOPUP_QUEUE) private topupQueue: Queue,
  ) {}

  /** Shared by every windowed query on this service: 1-365 days, rounded to the nearest whole day. */
  private clampDays(days: number): number {
    return Math.min(Math.max(Math.round(days), 1), 365);
  }

  async getStats() {
    const [ordersByStatusRaw, totalOrders, totalServices, totalStaff, totalCustomers, totalApiKeys, queueCounts] =
      await Promise.all([
        this.prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.order.count(),
        this.prisma.service.count({ where: { isEnabled: true } }),
        this.prisma.user.count({ where: { role: { in: ["SUPPORT", "MANAGER", "ADMIN"] } } }),
        this.prisma.user.count({ where: { role: "CUSTOMER" } }),
        this.prisma.apiKey.count({ where: { isEnabled: true } }),
        this.topupQueue.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      ]);

    const ordersByStatus = Object.fromEntries(
      ordersByStatusRaw.map((row) => [row.status, row._count._all]),
    );

    return {
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      totals: { orders: totalOrders, services: totalServices, staff: totalStaff, customers: totalCustomers, apiKeys: totalApiKeys },
      ordersByStatus,
      queue: queueCounts,
    };
  }

  /**
   * Daily order volume for the last N days. Uses amountTmt (manat topped up) rather than
   * amountCharged, since orders are paid in different currencies and summing those directly
   * would be meaningless — TMT is the one unit that's consistent across every order.
   */
  async getOrdersTimeseries(days: number) {
    const safeDays = this.clampDays(days);

    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; orderCount: bigint; volumeTmt: number | null; completedCount: bigint }>
    >`
      SELECT
        date_trunc('day', "createdAt") as day,
        COUNT(*) as "orderCount",
        COALESCE(SUM("amountTmt"), 0)::float as "volumeTmt",
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as "completedCount"
      FROM "Order"
      WHERE "createdAt" >= NOW() - (${safeDays} || ' days')::interval
      GROUP BY day
      ORDER BY day ASC
    `;

    return rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      orderCount: Number(row.orderCount),
      volumeTmt: row.volumeTmt ?? 0,
      completedCount: Number(row.completedCount),
    }));
  }

  /**
   * The last `days` days against the `days` days before them. Both windows are measured back from
   * the same instant, so they are always the same length -- comparing a finished previous month
   * with a half-finished current one is the classic way to report a fake 50% drop.
   */
  async getPeriodComparison(days: number) {
    const safeDays = this.clampDays(days);
    const now = new Date();
    const start = new Date(now.getTime() - safeDays * 86_400_000);
    const prevStart = new Date(now.getTime() - 2 * safeDays * 86_400_000);

    const [rows, newCurrent, newPrevious] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          curOrders: bigint;
          prevOrders: bigint;
          curCompleted: bigint;
          prevCompleted: bigint;
          curVolume: number | null;
          prevVolume: number | null;
        }>
      >`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" >= ${start}) AS "curOrders",
          COUNT(*) FILTER (WHERE "createdAt" < ${start}) AS "prevOrders",
          COUNT(*) FILTER (WHERE "createdAt" >= ${start} AND status = 'COMPLETED') AS "curCompleted",
          COUNT(*) FILTER (WHERE "createdAt" < ${start} AND status = 'COMPLETED') AS "prevCompleted",
          COALESCE(SUM("amountTmt") FILTER (WHERE "createdAt" >= ${start}), 0)::float AS "curVolume",
          COALESCE(SUM("amountTmt") FILTER (WHERE "createdAt" < ${start}), 0)::float AS "prevVolume"
        FROM "Order"
        WHERE "createdAt" >= ${prevStart} AND "createdAt" < ${now}
      `,
      this.prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: start, lt: now } } }),
      this.prisma.user.count({ where: { role: "CUSTOMER", createdAt: { gte: prevStart, lt: start } } }),
    ]);

    const r = rows[0];
    return {
      days: safeDays,
      current: {
        orders: Number(r?.curOrders ?? 0),
        completedOrders: Number(r?.curCompleted ?? 0),
        volumeTmt: r?.curVolume ?? 0,
        newCustomers: newCurrent,
      },
      previous: {
        orders: Number(r?.prevOrders ?? 0),
        completedOrders: Number(r?.prevCompleted ?? 0),
        volumeTmt: r?.prevVolume ?? 0,
        newCustomers: newPrevious,
      },
    };
  }

  /** Row counts for every table — a quick "what's in the database" overview for admins. */
  async getDatabaseOverview() {
    const [
      customers,
      staff,
      sellers,
      refreshTokens,
      services,
      rates,
      paymentMethods,
      orders,
      payments,
      topupJobs,
      apiKeys,
      stories,
      contentPages,
      galleryCategories,
      galleryProducts,
      galleryOrders,
      supportThreads,
      supportMessages,
      emailLogs,
      auditLogs,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: "CUSTOMER" } }),
      this.prisma.user.count({ where: { role: { in: ["SUPPORT", "MANAGER", "ADMIN"] } } }),
      this.prisma.seller.count(),
      this.prisma.refreshToken.count(),
      this.prisma.service.count(),
      this.prisma.rate.count(),
      this.prisma.paymentMethod.count(),
      this.prisma.order.count(),
      this.prisma.payment.count(),
      this.prisma.topupJob.count(),
      this.prisma.apiKey.count(),
      this.prisma.story.count(),
      this.prisma.contentPage.count(),
      this.prisma.galleryCategory.count(),
      this.prisma.galleryProduct.count(),
      this.prisma.galleryOrder.count(),
      this.prisma.supportThread.count(),
      this.prisma.supportMessage.count(),
      this.prisma.emailLog.count(),
      this.prisma.auditLog.count(),
    ]);

    return [
      { table: "User (клиенты)", count: customers, managePath: "/users" },
      { table: "User (сотрудники)", count: staff, managePath: "/team" },
      { table: "Seller (продавцы)", count: sellers, managePath: "/sellers" },
      { table: "RefreshToken", count: refreshTokens, managePath: null },
      { table: "Service", count: services, managePath: "/catalog" },
      { table: "Rate", count: rates, managePath: "/catalog" },
      { table: "PaymentMethod", count: paymentMethods, managePath: null },
      { table: "Order", count: orders, managePath: "/orders" },
      { table: "Payment", count: payments, managePath: null },
      { table: "TopupJob", count: topupJobs, managePath: null },
      { table: "ApiKey", count: apiKeys, managePath: "/api-keys" },
      { table: "Story", count: stories, managePath: "/stories" },
      { table: "ContentPage", count: contentPages, managePath: "/content-pages" },
      { table: "GalleryCategory", count: galleryCategories, managePath: "/gallery" },
      { table: "GalleryProduct", count: galleryProducts, managePath: "/gallery" },
      { table: "GalleryOrder", count: galleryOrders, managePath: "/gallery-orders" },
      { table: "SupportThread", count: supportThreads, managePath: "/support" },
      { table: "SupportMessage", count: supportMessages, managePath: "/support" },
      { table: "EmailLog", count: emailLogs, managePath: "/mail" },
      { table: "AuditLog", count: auditLogs, managePath: null },
    ];
  }

  /**
   * Gross revenue and cost per stream, windowed `[now - days, now)` except `sellerFloat` (a
   * point-in-time liability). Deliberately never computes a margin or total -- cost of goods
   * isn't tracked anywhere in this schema (docs/analysis/UNIT_ECONOMICS.md finding E-01), so a
   * combined figure here would misrepresent itself as a real number. Every field name says
   * exactly what it is: gmvTmt/feesTmt/grossSalesTmt are money in, costTmt/owedTmt are money out
   * or owed, never "profit" or "revenue" standing in for either.
   */
  async getEconomics(days: number) {
    const safeDays = this.clampDays(days);
    const now = new Date();
    const start = new Date(now.getTime() - safeDays * 86_400_000);

    const [topupRows, galleryGross, adDebits, platformFees, purchaseRows, cargoAgg, referralAgg, sellerFloatAgg] =
      await Promise.all([
        // 1. Top-ups, per Service.code x currency.
        this.prisma.$queryRaw<
          Array<{
            serviceCode: string;
            currency: CurrencyCode;
            count: bigint;
            gmvTmt: number | null;
            feesTmt: number | null;
            avgAmountTmt: number | null;
            costedCount: bigint;
            costedGmvTmt: number | null;
            costTmt: number | null;
          }>
        >`
          SELECT
            s.code AS "serviceCode",
            o.currency AS "currency",
            COUNT(*) AS "count",
            COALESCE(SUM(o."amountTmt"), 0)::float AS "gmvTmt",
            COALESCE(SUM(o."feeAmount"), 0)::float AS "feesTmt",
            COALESCE(AVG(o."amountTmt"), 0)::float AS "avgAmountTmt",
            COUNT(oc."orderId") AS "costedCount",
            COALESCE(SUM(o."amountTmt") FILTER (WHERE oc."orderId" IS NOT NULL), 0)::float AS "costedGmvTmt",
            COALESCE(SUM(oc."costTmt"), 0)::float AS "costTmt"
          FROM "Order" o
          JOIN "Service" s ON s.id = o."serviceId"
          LEFT JOIN "OrderCost" oc ON oc."orderId" = o.id
          WHERE o.status = 'COMPLETED' AND o."createdAt" >= ${start} AND o."createdAt" < ${now}
          GROUP BY s.code, o.currency
          ORDER BY s.code, o.currency
        `,
        // 2. Gallery marketplace sales -- gross, delivered in window.
        this.prisma.galleryOrder.aggregate({
          where: { status: "DELIVERED", deliveredAt: { gte: start, lt: now } },
          _sum: { amountTmt: true },
        }),
        // Ad revenue: story/slide debits are negative on the seller ledger, so revenue is the
        // negation of their sum.
        this.prisma.sellerLedgerEntry.aggregate({
          where: { type: { in: ["STORY_AD_DEBIT", "SLIDE_AD_DEBIT"] }, createdAt: { gte: start, lt: now } },
          _sum: { amountTmt: true },
        }),
        // Platform take: 0 until MARKETPLACE_PLATFORM_FEE entries exist, i.e. until the rate is
        // ever set above 0%.
        this.prisma.sellerLedgerEntry.aggregate({
          where: { type: "MARKETPLACE_PLATFORM_FEE", createdAt: { gte: start, lt: now } },
          _sum: { amountTmt: true },
        }),
        // 3. Marketplace purchases (buy-for-the-customer), delivered in window, against their
        // latest accepted quote. MarketplacePurchaseOrder has no dedicated deliveredAt column, so
        // updatedAt is the closest available "delivered in this window" signal -- it can in
        // principle also move on a later edit to an already-delivered order (e.g. reviewReason),
        // which would be a rare false inclusion, not a rare exclusion.
        this.prisma.$queryRaw<Array<{ count: bigint; serviceFeesTmt: number | null; shippingTmt: number | null }>>`
          SELECT
            COUNT(*) AS "count",
            COALESCE(SUM(q."serviceFeeTmt"), 0)::float AS "serviceFeesTmt",
            COALESCE(SUM(q."shippingTmt"), 0)::float AS "shippingTmt"
          FROM "MarketplacePurchaseOrder" o
          JOIN LATERAL (
            SELECT * FROM "MarketplacePurchaseQuote" mq
            WHERE mq."orderId" = o.id
            ORDER BY mq.version DESC
            LIMIT 1
          ) q ON true
          WHERE o.status = 'DELIVERED' AND o."updatedAt" >= ${start} AND o."updatedAt" < ${now}
        `,
        // 4. Cargo -- tariff revenue for shipments actually paid in window. paidAt is set once, at
        // the PAID transition, and never cleared afterwards, so this also naturally excludes
        // draft/quote-only shipments (they have no paidAt yet); CANCELLED is excluded explicitly
        // since a shipment can be paid and later cancelled.
        this.prisma.shipment.aggregate({
          where: { paidAt: { gte: start, lt: now }, status: { notIn: ["DRAFT", "QUOTE_CREATED", "CANCELLED"] } },
          _sum: { totalPriceTmt: true },
          _count: { _all: true },
        }),
        // 5. Referral cost -- money actually paid out in window.
        this.prisma.referral.aggregate({
          where: { status: "REWARDED", rewardedAt: { gte: start, lt: now } },
          _sum: { rewardAmountTmt: true },
          _count: { _all: true },
        }),
        // 6. Seller float -- NOT windowed, a point-in-time liability.
        this.prisma.seller.aggregate({ _sum: { balanceTmt: true } }),
      ]);

    return {
      days: safeDays,
      topups: topupRows.map((row) => ({
        serviceCode: row.serviceCode,
        currency: row.currency,
        count: Number(row.count),
        gmvTmt: row.gmvTmt ?? 0,
        feesTmt: row.feesTmt ?? 0,
        avgAmountTmt: row.avgAmountTmt ?? 0,
        costedCount: Number(row.costedCount),
        costedGmvTmt: row.costedGmvTmt ?? 0,
        costTmt: row.costTmt ?? 0,
      })),
      gallery: {
        grossSalesTmt: Number(galleryGross._sum.amountTmt ?? 0),
        // `|| 0` also normalizes -0 (negating a 0 sum) back to a plain 0.
        adRevenueTmt: -Number(adDebits._sum.amountTmt ?? 0) || 0,
        platformFeeTmt: -Number(platformFees._sum.amountTmt ?? 0) || 0,
      },
      marketplacePurchases: {
        count: Number(purchaseRows[0]?.count ?? 0),
        serviceFeesTmt: purchaseRows[0]?.serviceFeesTmt ?? 0,
        shippingTmt: purchaseRows[0]?.shippingTmt ?? 0,
      },
      cargo: {
        count: cargoAgg._count._all,
        tariffRevenueTmt: Number(cargoAgg._sum.totalPriceTmt ?? 0),
      },
      referralCost: {
        count: referralAgg._count._all,
        costTmt: Number(referralAgg._sum.rewardAmountTmt ?? 0),
      },
      sellerFloat: {
        owedTmt: Number(sellerFloatAgg._sum.balanceTmt ?? 0),
      },
    };
  }
}
