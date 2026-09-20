import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { AuditLogService } from "../audit-log/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import type { AudienceDto, CreateCampaignDto, CreateTemplateDto, PushContentDto, SendOneDto, UpdateTemplateDto } from "./push-admin.dto";
import type { PushCategory, PushMessage } from "./push-message";

/** How many people are sent to at the same time inside one campaign. */
const SEND_CONCURRENCY = 10;
/** People loaded per page while walking an audience. */
const PAGE_SIZE = 200;
/** Automatic pushes (orders, chat, ...) are kept this long; campaign pushes are kept a year. */
const SYSTEM_RETENTION_DAYS = 90;
const CAMPAIGN_RETENTION_DAYS = 365;

type Locale = "ru" | "en" | "tkm";

interface CampaignText {
  category: string;
  titleRu: string;
  bodyRu: string;
  titleEn: string | null;
  bodyEn: string | null;
  titleTkm: string | null;
  bodyTkm: string | null;
  imageUrl: string | null;
  route: string;
}

function pickText(campaign: CampaignText, locale: string | null | undefined): { title: string; body: string } {
  const l: Locale = locale === "en" || locale === "tkm" ? locale : "ru";
  if (l === "en" && campaign.titleEn && campaign.bodyEn) return { title: campaign.titleEn, body: campaign.bodyEn };
  if (l === "tkm" && campaign.titleTkm && campaign.bodyTkm) return { title: campaign.titleTkm, body: campaign.bodyTkm };
  return { title: campaign.titleRu, body: campaign.bodyRu };
}

const emptyToNull = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

/**
 * Templates, audiences, sending and statistics for admin-driven push notifications. Automatic
 * pushes (orders, chat, ...) go through NotificationsService directly and land in the same
 * PushDelivery table, so the statistics cover both.
 */
@Injectable()
export class PushCampaignService {
  private readonly logger = new Logger(PushCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditLogService,
  ) {}

  // ---- Templates ----

  listTemplates() {
    return this.prisma.pushTemplate.findMany({ orderBy: [{ isEnabled: "desc" }, { name: "asc" }] });
  }

  async createTemplate(dto: CreateTemplateDto, adminId: string) {
    const template = await this.prisma.pushTemplate.create({
      data: {
        name: dto.name.trim(),
        category: dto.category,
        titleRu: dto.titleRu.trim(),
        bodyRu: dto.bodyRu.trim(),
        titleEn: emptyToNull(dto.titleEn),
        bodyEn: emptyToNull(dto.bodyEn),
        titleTkm: emptyToNull(dto.titleTkm),
        bodyTkm: emptyToNull(dto.bodyTkm),
        imageUrl: dto.imageUrl ?? null,
        route: dto.route ?? "/home",
        createdById: adminId,
      },
    });
    this.audit.record(adminId, "push.template.create", "PushTemplate", template.id, { name: template.name });
    return template;
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, adminId: string) {
    const existing = await this.prisma.pushTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");
    const template = await this.prisma.pushTemplate.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        category: dto.category,
        titleRu: dto.titleRu?.trim(),
        bodyRu: dto.bodyRu?.trim(),
        titleEn: dto.titleEn === undefined ? undefined : emptyToNull(dto.titleEn),
        bodyEn: dto.bodyEn === undefined ? undefined : emptyToNull(dto.bodyEn),
        titleTkm: dto.titleTkm === undefined ? undefined : emptyToNull(dto.titleTkm),
        bodyTkm: dto.bodyTkm === undefined ? undefined : emptyToNull(dto.bodyTkm),
        imageUrl: dto.imageUrl,
        route: dto.route,
        isEnabled: dto.isEnabled,
      },
    });
    this.audit.record(adminId, "push.template.update", "PushTemplate", id);
    return template;
  }

  async deleteTemplate(id: string, adminId: string) {
    const result = await this.prisma.pushTemplate.deleteMany({ where: { id } });
    if (result.count === 0) throw new NotFoundException("Template not found");
    this.audit.record(adminId, "push.template.delete", "PushTemplate", id);
    return { deleted: true };
  }

  // ---- Audiences ----

  /**
   * People a campaign can reach: signed in on at least one device (they have a push token) and not
   * blocked. The audience is resolved when the send starts, not when the campaign is written, so a
   * scheduled campaign reaches whoever fits at that moment.
   */
  audienceWhere(audience: AudienceDto, options: { requireApp?: boolean } = {}): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = { isBlocked: false };
    if (options.requireApp !== false) where.pushTokens = { some: {} };
    if (audience.type === "USERS") {
      where.id = { in: audience.userIds ?? [] };
    } else if (audience.type === "FILTER") {
      if (audience.countries?.length) where.country = { in: audience.countries };
      if (audience.locales?.length) where.locale = { in: audience.locales };
      if (audience.roles?.length) where.role = { in: audience.roles as never };
    }
    return where;
  }

  private assertAudience(audience: AudienceDto) {
    if (audience.type === "USERS" && !audience.userIds?.length) {
      throw new BadRequestException("Choose at least one person");
    }
    if (audience.type === "FILTER" && !audience.countries?.length && !audience.locales?.length && !audience.roles?.length) {
      throw new BadRequestException("A filtered audience needs at least one condition; use ALL to reach everyone");
    }
  }

  /** How many people and devices a send would reach, and how many matching people have no app. */
  async previewAudience(audience: AudienceDto) {
    this.assertAudience(audience);
    const reachable = this.audienceWhere(audience);
    const anyone = this.audienceWhere(audience, { requireApp: false });
    const [users, devices, matching] = await Promise.all([
      this.prisma.user.count({ where: reachable }),
      this.prisma.pushToken.count({ where: { user: reachable } }),
      this.prisma.user.count({ where: anyone }),
    ]);
    return { users, devices, withoutApp: Math.max(matching - users, 0) };
  }

  // ---- Campaigns ----

  private async resolveContent(dto: CreateCampaignDto): Promise<CampaignText & { templateId: string | null }> {
    let base: Partial<PushContentDto> = {};
    let templateId: string | null = null;
    if (dto.templateId) {
      const template = await this.prisma.pushTemplate.findUnique({ where: { id: dto.templateId } });
      if (!template) throw new NotFoundException("Template not found");
      if (!template.isEnabled) throw new BadRequestException("This template is switched off");
      templateId = template.id;
      base = {
        category: template.category as PushCategory,
        titleRu: template.titleRu,
        bodyRu: template.bodyRu,
        titleEn: template.titleEn ?? undefined,
        bodyEn: template.bodyEn ?? undefined,
        titleTkm: template.titleTkm ?? undefined,
        bodyTkm: template.bodyTkm ?? undefined,
        imageUrl: template.imageUrl ?? undefined,
        route: template.route,
      };
    }
    const merged = { ...base, ...(dto.content ?? {}) };
    if (!merged.category || !merged.titleRu || !merged.bodyRu) {
      throw new BadRequestException("Pick a template or write the title and text");
    }
    return {
      templateId,
      category: merged.category,
      titleRu: merged.titleRu.trim(),
      bodyRu: merged.bodyRu.trim(),
      titleEn: emptyToNull(merged.titleEn),
      bodyEn: emptyToNull(merged.bodyEn),
      titleTkm: emptyToNull(merged.titleTkm),
      bodyTkm: emptyToNull(merged.bodyTkm),
      imageUrl: merged.imageUrl ?? null,
      route: merged.route ?? "/home",
    };
  }

  async createCampaign(dto: CreateCampaignDto, adminId: string) {
    this.assertAudience(dto.audience);
    const content = await this.resolveContent(dto);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if (scheduledAt && scheduledAt.getTime() <= Date.now() && !dto.sendNow) {
      throw new BadRequestException("Schedule a time in the future, or send now");
    }
    const campaign = await this.prisma.pushCampaign.create({
      data: {
        name: dto.name.trim(),
        ...content,
        audience: dto.audience as unknown as Prisma.InputJsonValue,
        status: scheduledAt && !dto.sendNow ? "SCHEDULED" : "DRAFT",
        scheduledAt: dto.sendNow ? null : scheduledAt,
        createdById: adminId,
      },
    });
    this.audit.record(adminId, "push.campaign.create", "PushCampaign", campaign.id, { audience: dto.audience.type });
    return dto.sendNow ? this.send(campaign.id, adminId) : campaign;
  }

  /**
   * Starts a draft or scheduled campaign. The status change is a compare-and-set, so two admins
   * (or the scheduler on both API nodes) can never start the same campaign twice. Delivery itself
   * continues in the background: the request returns at once with status SENDING.
   */
  async send(id: string, adminId: string | null) {
    const claimed = await this.prisma.pushCampaign.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "SENDING", startedAt: new Date(), lastError: null },
    });
    if (claimed.count === 0) {
      const exists = await this.prisma.pushCampaign.findUnique({ where: { id }, select: { status: true } });
      if (!exists) throw new NotFoundException("Campaign not found");
      throw new BadRequestException(`A ${exists.status.toLowerCase()} campaign cannot be sent`);
    }
    if (adminId) this.audit.record(adminId, "push.campaign.send", "PushCampaign", id);
    void this.run(id);
    return this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
  }

  async cancel(id: string, adminId: string) {
    const result = await this.prisma.pushCampaign.updateMany({
      where: { id, status: { in: ["DRAFT", "SCHEDULED"] } },
      data: { status: "CANCELLED" },
    });
    if (result.count === 0) throw new BadRequestException("Only a draft or scheduled campaign can be cancelled");
    this.audit.record(adminId, "push.campaign.cancel", "PushCampaign", id);
    return { cancelled: true };
  }

  /** Walks the audience page by page and sends to each person in their own language. */
  private async run(id: string) {
    try {
      const campaign = await this.prisma.pushCampaign.findUniqueOrThrow({ where: { id } });
      const where = this.audienceWhere(campaign.audience as unknown as AudienceDto);
      let cursor: string | undefined;
      let recipients = 0;

      for (;;) {
        const page = await this.prisma.user.findMany({
          where,
          orderBy: { id: "asc" },
          take: PAGE_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          select: { id: true, locale: true },
        });
        if (page.length === 0) break;
        cursor = page[page.length - 1]?.id;

        for (let i = 0; i < page.length; i += SEND_CONCURRENCY) {
          await Promise.all(
            page.slice(i, i + SEND_CONCURRENCY).map(async (user) => {
              const text = pickText(campaign, user.locale);
              const message: PushMessage = {
                category: campaign.category as PushCategory,
                title: text.title,
                body: text.body,
                route: campaign.route,
                imageUrl: campaign.imageUrl ?? undefined,
                tag: `campaign:${campaign.id}`,
                data: { campaignId: campaign.id },
              };
              try {
                const result = await this.notifications.sendToUser(user.id, message, { campaignId: campaign.id });
                if (result.requested > 0) recipients += 1;
              } catch (err) {
                this.logger.warn(`Campaign ${id}: send failed (${err instanceof Error ? err.constructor.name : "error"})`);
              }
            }),
          );
        }
        if (page.length < PAGE_SIZE) break;
      }

      await this.prisma.pushCampaign.update({
        where: { id },
        data: { status: "SENT", finishedAt: new Date(), recipientCount: recipients },
      });
    } catch (err) {
      this.logger.error(`Campaign ${id} failed: ${err instanceof Error ? err.message : "error"}`);
      await this.prisma.pushCampaign
        .update({
          where: { id },
          data: { status: "FAILED", finishedAt: new Date(), lastError: (err instanceof Error ? err.message : "error").slice(0, 300) },
        })
        .catch(() => undefined);
    }
  }

  /** Every minute: start campaigns whose time has come. */
  @Cron("* * * * *")
  async runDue() {
    const due = await this.prisma.pushCampaign.findMany({
      where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
      select: { id: true },
      take: 20,
    });
    for (const { id } of due) {
      try {
        await this.send(id, null);
      } catch {
        // Another node claimed it first.
      }
    }
  }

  /** Daily: old push records are only history, and the automatic ones are numerous. */
  @Cron("30 3 * * *")
  async purgeOldDeliveries() {
    const day = 24 * 60 * 60 * 1000;
    const system = await this.prisma.pushDelivery.deleteMany({
      where: { campaignId: null, createdAt: { lt: new Date(Date.now() - SYSTEM_RETENTION_DAYS * day) } },
    });
    const campaign = await this.prisma.pushDelivery.deleteMany({
      where: { campaignId: { not: null }, createdAt: { lt: new Date(Date.now() - CAMPAIGN_RETENTION_DAYS * day) } },
    });
    if (system.count + campaign.count) {
      this.logger.log(`Purged ${system.count + campaign.count} old push delivery record(s)`);
    }
  }

  /** One person: an account id or a phone number. Recorded as a campaign so it has statistics. */
  async sendOne(dto: SendOneDto, adminId: string) {
    const target = dto.target.trim();
    const user = await this.prisma.user.findFirst({
      where: target.startsWith("+") ? { phone: target } : { OR: [{ id: target }, { phone: target }] },
      select: { id: true, phone: true },
    });
    if (!user) throw new NotFoundException("No such person");
    const devices = await this.prisma.pushToken.count({ where: { userId: user.id } });
    if (devices === 0) throw new BadRequestException("This person has not signed in on the app, so there is nowhere to send");
    return this.createCampaign(
      {
        name: `Личное: ${user.phone}`,
        content: dto.content,
        audience: { type: "USERS", userIds: [user.id] },
        sendNow: true,
      },
      adminId,
    );
  }

  /** People to pick from in the "send to one person" form. */
  async searchUsers(query: string) {
    const q = query.trim();
    if (q.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { phone: { contains: q } },
          { username: { contains: q, mode: "insensitive" } },
          { fullName: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 15,
      orderBy: { createdAt: "desc" },
      select: { id: true, phone: true, fullName: true, username: true, country: true, locale: true, _count: { select: { pushTokens: true } } },
    });
    return users.map(({ _count, ...user }) => ({ ...user, devices: _count.pushTokens }));
  }

  // ---- Reading campaigns and statistics ----

  async listCampaigns(limit = 50) {
    const campaigns = await this.prisma.pushCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 200),
    });
    const stats = await this.statsByCampaign(campaigns.map((c) => c.id));
    return campaigns.map((c) => ({ ...c, stats: stats.get(c.id) ?? emptyStats() }));
  }

  async getCampaign(id: string) {
    const campaign = await this.prisma.pushCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    const stats = (await this.statsByCampaign([id])).get(id) ?? emptyStats();
    const byCountry = await this.prisma.$queryRaw<{ country: string | null; sent: bigint; delivered: bigint; opened: bigint }[]>`
      SELECT u."country" AS country,
             COUNT(*) AS sent,
             COUNT(*) FILTER (WHERE d."accepted" > 0) AS delivered,
             COUNT(*) FILTER (WHERE d."openedAt" IS NOT NULL) AS opened
      FROM "PushDelivery" d JOIN "User" u ON u."id" = d."userId"
      WHERE d."campaignId" = ${id}
      GROUP BY u."country" ORDER BY sent DESC`;
    return { ...campaign, stats, byCountry: byCountry.map(toCountryRow) };
  }

  private async statsByCampaign(ids: string[]) {
    const out = new Map<string, ReturnType<typeof emptyStats>>();
    if (ids.length === 0) return out;
    const rows = await this.prisma.$queryRaw<{ campaignId: string; sent: bigint; delivered: bigint; opened: bigint }[]>`
      SELECT "campaignId",
             COUNT(*) AS sent,
             COUNT(*) FILTER (WHERE "accepted" > 0) AS delivered,
             COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL) AS opened
      FROM "PushDelivery"
      WHERE "campaignId" IN (${Prisma.join(ids)})
      GROUP BY "campaignId"`;
    for (const row of rows) out.set(row.campaignId, toStats(row));
    return out;
  }

  /**
   * Everything the app sent in the last `days` days, campaigns and automatic pushes together:
   * totals, by section, by country and by day.
   */
  async overview(days = 30) {
    const since = new Date(Date.now() - Math.min(Math.max(days, 1), 90) * 24 * 60 * 60 * 1000);
    const [totals, byCategory, byCountry, byDay, devices] = await Promise.all([
      this.prisma.$queryRaw<{ sent: bigint; delivered: bigint; opened: bigint }[]>`
        SELECT COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE "accepted" > 0) AS delivered,
               COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL) AS opened
        FROM "PushDelivery" WHERE "createdAt" >= ${since}`,
      this.prisma.$queryRaw<{ category: string; sent: bigint; delivered: bigint; opened: bigint }[]>`
        SELECT "category",
               COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE "accepted" > 0) AS delivered,
               COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL) AS opened
        FROM "PushDelivery" WHERE "createdAt" >= ${since}
        GROUP BY "category" ORDER BY sent DESC`,
      this.prisma.$queryRaw<{ country: string | null; sent: bigint; delivered: bigint; opened: bigint }[]>`
        SELECT u."country" AS country,
               COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE d."accepted" > 0) AS delivered,
               COUNT(*) FILTER (WHERE d."openedAt" IS NOT NULL) AS opened
        FROM "PushDelivery" d JOIN "User" u ON u."id" = d."userId"
        WHERE d."createdAt" >= ${since}
        GROUP BY u."country" ORDER BY sent DESC`,
      this.prisma.$queryRaw<{ day: Date; sent: bigint; delivered: bigint; opened: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day,
               COUNT(*) AS sent,
               COUNT(*) FILTER (WHERE "accepted" > 0) AS delivered,
               COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL) AS opened
        FROM "PushDelivery" WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.pushToken.groupBy({ by: ["platform"], _count: { _all: true } }),
    ]);
    const usersWithApp = await this.prisma.user.count({ where: { pushTokens: { some: {} } } });
    return {
      days,
      totals: toStats(totals[0] ?? { sent: 0n, delivered: 0n, opened: 0n }),
      byCategory: byCategory.map((r) => ({ category: r.category, ...toStats(r) })),
      byCountry: byCountry.map(toCountryRow),
      byDay: byDay.map((r) => ({ day: r.day.toISOString().slice(0, 10), ...toStats(r) })),
      audience: {
        usersWithApp,
        devices: devices.reduce((sum, d) => sum + d._count._all, 0),
        byPlatform: Object.fromEntries(devices.map((d) => [d.platform, d._count._all])),
      },
    };
  }
}

function emptyStats() {
  return { sent: 0, delivered: 0, failed: 0, opened: 0, ignored: 0, openRate: 0 };
}

/**
 * sent      pushes addressed to a person who has the app
 * delivered accepted by the push service for at least one of their devices
 * failed    sent but accepted for none (every device unreachable)
 * opened    the person tapped it
 * ignored   delivered but never tapped -- swiping a notification away is not reported by Android,
 *           so this is "not opened", which is the honest number
 * openRate  opened / delivered
 */
function toStats(row: { sent: bigint | number; delivered: bigint | number; opened: bigint | number }) {
  const sent = Number(row.sent);
  const delivered = Number(row.delivered);
  const opened = Number(row.opened);
  return {
    sent,
    delivered,
    failed: sent - delivered,
    opened,
    ignored: Math.max(delivered - opened, 0),
    openRate: delivered > 0 ? Math.round((opened / delivered) * 1000) / 10 : 0,
  };
}

function toCountryRow(row: { country: string | null; sent: bigint; delivered: bigint; opened: bigint }) {
  return { country: row.country ?? "—", ...toStats(row) };
}
