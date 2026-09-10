import { Inject, Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { TOPUP_QUEUE } from "../queue/queue.module";

@Injectable()
export class AdminStatsService {
  constructor(
    private prisma: PrismaService,
    @Inject(TOPUP_QUEUE) private topupQueue: Queue,
  ) {}

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
    const safeDays = Math.min(Math.max(Math.round(days), 1), 365);

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
}
