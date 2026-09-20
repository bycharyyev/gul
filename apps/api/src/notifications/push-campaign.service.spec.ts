import { BadRequestException, NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../auth/decorators/roles.decorator";
import { RolesGuard } from "../auth/guards/roles.guard";
import { PushAdminController } from "./push-admin.controller";
import { PushCampaignService, nextOccurrence } from "./push-campaign.service";

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const prisma = {
    pushTemplate: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    pushCampaign: {
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
    },
    pushDelivery: { deleteMany: jest.fn() },
    pushToken: { count: jest.fn(), groupBy: jest.fn() },
    user: { count: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const notifications = { sendToUser: jest.fn().mockResolvedValue({ requested: 1, delivered: 1, failed: 0 }) };
  const audit = { record: jest.fn() };
  const service = new PushCampaignService(prisma as never, notifications as never, audit as never);
  return { prisma, notifications, audit, service };
}

const content = { category: "feed" as const, titleRu: "Привет", bodyRu: "Текст" };

describe("PushCampaignService", () => {
  describe("audiences", () => {
    it("ALL means everyone with the app who is not blocked", () => {
      const { service } = setup();
      expect(service.audienceWhere({ type: "ALL" })).toEqual({ isBlocked: false, pushTokens: { some: {} } });
    });

    it("FILTER narrows by country, language and role", () => {
      const { service } = setup();
      expect(service.audienceWhere({ type: "FILTER", countries: ["RU", "TR"], locales: ["ru"], roles: ["SELLER"] })).toEqual({
        isBlocked: false,
        pushTokens: { some: {} },
        country: { in: ["RU", "TR"] },
        locale: { in: ["ru"] },
        role: { in: ["SELLER"] },
      });
    });

    it("USERS is exactly the chosen accounts", () => {
      const { service } = setup();
      expect(service.audienceWhere({ type: "USERS", userIds: ["a", "b"] })).toMatchObject({ id: { in: ["a", "b"] } });
    });

    it("refuses an empty selection or a filter with no condition", async () => {
      const { service } = setup();
      await expect(service.previewAudience({ type: "USERS", userIds: [] })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.previewAudience({ type: "FILTER" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("preview counts people, devices and matching people without the app", async () => {
      const { prisma, service } = setup();
      prisma.user.count.mockResolvedValueOnce(80).mockResolvedValueOnce(100);
      prisma.pushToken.count.mockResolvedValue(95);

      await expect(service.previewAudience({ type: "FILTER", countries: ["CN"] })).resolves.toEqual({
        users: 80,
        devices: 95,
        withoutApp: 20,
      });
    });
  });

  describe("creating a campaign", () => {
    it("copies the template's text so editing it later cannot rewrite history", async () => {
      const { prisma, service } = setup();
      prisma.pushTemplate.findUnique.mockResolvedValue({
        id: "t1",
        isEnabled: true,
        category: "gallery",
        titleRu: "Скидка",
        bodyRu: "Скидка 10%",
        titleEn: "Sale",
        bodyEn: "10% off",
        titleTkm: null,
        bodyTkm: null,
        imageUrl: "https://cdn.example/a.png",
        route: "/gallery",
      });
      prisma.pushCampaign.create.mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data }));

      await service.createCampaign({ name: "Sale", templateId: "t1", audience: { type: "ALL" } }, "admin1");

      expect(prisma.pushCampaign.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: "t1",
          category: "gallery",
          titleRu: "Скидка",
          titleEn: "Sale",
          titleTkm: null,
          imageUrl: "https://cdn.example/a.png",
          route: "/gallery",
          status: "DRAFT",
        }),
      });
    });

    it("lets inline text override the template", async () => {
      const { prisma, service } = setup();
      prisma.pushTemplate.findUnique.mockResolvedValue({ id: "t1", isEnabled: true, category: "feed", titleRu: "A", bodyRu: "B", route: "/home" });
      prisma.pushCampaign.create.mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data }));

      await service.createCampaign(
        { name: "x", templateId: "t1", content: { ...content, titleRu: "Новый" }, audience: { type: "ALL" } },
        "admin1",
      );

      expect(prisma.pushCampaign.create.mock.calls[0][0].data).toMatchObject({ titleRu: "Новый", bodyRu: "Текст" });
    });

    it("refuses a switched-off template, a missing one, and a campaign with no text", async () => {
      const { prisma, service } = setup();
      prisma.pushTemplate.findUnique.mockResolvedValueOnce({ id: "t1", isEnabled: false });
      await expect(service.createCampaign({ name: "x", templateId: "t1", audience: { type: "ALL" } }, "a")).rejects.toBeInstanceOf(BadRequestException);
      prisma.pushTemplate.findUnique.mockResolvedValueOnce(null);
      await expect(service.createCampaign({ name: "x", templateId: "nope", audience: { type: "ALL" } }, "a")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.createCampaign({ name: "x", audience: { type: "ALL" } }, "a")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("schedules a future time and refuses a past one", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.create.mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data }));
      const future = new Date(Date.now() + 3_600_000).toISOString();

      await service.createCampaign({ name: "x", content, audience: { type: "ALL" }, scheduledAt: future }, "a");
      expect(prisma.pushCampaign.create.mock.calls[0][0].data).toMatchObject({ status: "SCHEDULED" });

      const past = new Date(Date.now() - 3_600_000).toISOString();
      await expect(service.createCampaign({ name: "x", content, audience: { type: "ALL" }, scheduledAt: past }, "a")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("platforms, delivery options and repeats", () => {
    it("filters the audience and the device count by platform", async () => {
      const { prisma, service } = setup();
      expect(service.audienceWhere({ type: "ALL", platforms: ["IOS"] })).toEqual({
        isBlocked: false,
        pushTokens: { some: { platform: { in: ["IOS"] } } },
      });
      prisma.user.count.mockResolvedValue(3);
      prisma.pushToken.count.mockResolvedValue(3);
      await service.previewAudience({ type: "ALL", platforms: ["ANDROID"] });
      expect(prisma.pushToken.count).toHaveBeenCalledWith({
        where: { user: expect.anything(), platform: { in: ["ANDROID"] } },
      });
    });

    it("stores priority and lifetime, and marks a repeating campaign as the start of a series", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.create.mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data }));
      const first = new Date(Date.now() + 3_600_000).toISOString();
      await service.createCampaign(
        { name: "x", content, audience: { type: "ALL" }, scheduledAt: first, priority: "normal", ttlHours: 6, repeat: "WEEKLY" },
        "a",
      );
      expect(prisma.pushCampaign.create.mock.calls[0][0].data).toMatchObject({ priority: "normal", ttlHours: 6, repeat: "WEEKLY" });
      expect(prisma.pushCampaign.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { seriesId: "c1" } });
    });

    it("refuses a repeat without a start time or with an end before the start", async () => {
      const { service } = setup();
      await expect(
        service.createCampaign({ name: "x", content, audience: { type: "ALL" }, repeat: "DAILY" }, "a"),
      ).rejects.toBeInstanceOf(BadRequestException);
      const first = new Date(Date.now() + 3_600_000);
      await expect(
        service.createCampaign(
          { name: "x", content, audience: { type: "ALL" }, scheduledAt: first.toISOString(), repeat: "DAILY", repeatUntil: new Date(first.getTime() - 1000).toISOString() },
          "a",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("cancelling one occurrence stops the whole series", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
      prisma.pushCampaign.findUnique.mockResolvedValue({ seriesId: "s1" });
      await service.cancel("c2", "a");
      expect(prisma.pushCampaign.updateMany).toHaveBeenLastCalledWith({
        where: { seriesId: "s1", status: { in: ["DRAFT", "SCHEDULED"] } },
        data: { status: "CANCELLED" },
      });
    });

    it("computes the next occurrence, clamping the month end", () => {
      expect(nextOccurrence(new Date("2026-01-10T09:00:00Z"), "DAILY").toISOString()).toBe("2026-01-11T09:00:00.000Z");
      expect(nextOccurrence(new Date("2026-01-10T09:00:00Z"), "WEEKLY").toISOString()).toBe("2026-01-17T09:00:00.000Z");
      expect(nextOccurrence(new Date("2026-01-31T09:00:00Z"), "MONTHLY").toISOString()).toBe("2026-02-28T09:00:00.000Z");
    });
  });

  describe("sending", () => {
    it("starts a draft exactly once", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.updateMany.mockResolvedValue({ count: 0 });
      prisma.pushCampaign.findUnique.mockResolvedValue({ status: "SENT" });
      await expect(service.send("c1", "admin1")).rejects.toThrow("A sent campaign cannot be sent");

      prisma.pushCampaign.findUnique.mockResolvedValue(null);
      await expect(service.send("c1", "admin1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("sends each person their own language, tagged with the campaign, and finishes as SENT", async () => {
      const { prisma, notifications, service } = setup();
      const campaign = {
        id: "c1",
        category: "feed",
        titleRu: "Привет",
        bodyRu: "Текст",
        titleEn: "Hello",
        bodyEn: "Text",
        titleTkm: null,
        bodyTkm: null,
        imageUrl: null,
        route: "/feed",
        audience: { type: "ALL" },
      };
      prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
      prisma.pushCampaign.findUniqueOrThrow.mockResolvedValue(campaign);
      prisma.user.findMany.mockResolvedValue([
        { id: "u1", locale: "ru" },
        { id: "u2", locale: "en" },
        { id: "u3", locale: "tkm" },
      ]);
      notifications.sendToUser
        .mockResolvedValueOnce({ requested: 1, delivered: 1, failed: 0 })
        .mockResolvedValueOnce({ requested: 1, delivered: 1, failed: 0 })
        .mockResolvedValueOnce({ requested: 0, delivered: 0, failed: 0 });

      await service.send("c1", "admin1");
      await flush();
      await flush();

      const titles = Object.fromEntries(notifications.sendToUser.mock.calls.map(([id, message]) => [id, message.title]));
      expect(titles).toEqual({ u1: "Привет", u2: "Hello", u3: "Привет" });
      expect(notifications.sendToUser.mock.calls[0][1]).toMatchObject({ category: "feed", route: "/feed", tag: "campaign:c1" });
      expect(notifications.sendToUser.mock.calls[0][2]).toMatchObject({ campaignId: "c1", priority: "high" });
      expect(prisma.pushCampaign.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: expect.objectContaining({ status: "SENT", recipientCount: 2 }),
      });
    });

    it("keeps going when one person's send fails", async () => {
      const { prisma, notifications, service } = setup();
      prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
      prisma.pushCampaign.findUniqueOrThrow.mockResolvedValue({ id: "c1", category: "feed", titleRu: "a", bodyRu: "b", route: "/", audience: { type: "ALL" } });
      prisma.user.findMany.mockResolvedValue([{ id: "u1", locale: "ru" }, { id: "u2", locale: "ru" }]);
      notifications.sendToUser.mockRejectedValueOnce(new Error("fcm")).mockResolvedValueOnce({ requested: 1, delivered: 1, failed: 0 });

      await service.send("c1", "admin1");
      await flush();
      await flush();

      expect(prisma.pushCampaign.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: expect.objectContaining({ status: "SENT", recipientCount: 1 }),
      });
    });

    it("marks the campaign FAILED with a short reason when something breaks", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
      prisma.pushCampaign.findUniqueOrThrow.mockRejectedValueOnce(new Error("db gone")).mockResolvedValue({ id: "c1" });
      prisma.pushCampaign.update.mockResolvedValue({});

      await service.send("c1", "admin1");
      await flush();
      await flush();

      expect(prisma.pushCampaign.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: expect.objectContaining({ status: "FAILED", lastError: "db gone" }),
      });
    });

    it("cancels only a draft or scheduled campaign", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
      await expect(service.cancel("c1", "a")).resolves.toEqual({ cancelled: true });
      await expect(service.cancel("c1", "a")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("the scheduler starts due campaigns and shrugs off one another node already took", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
      prisma.pushCampaign.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
      prisma.pushCampaign.findUnique.mockResolvedValue({ status: "SENDING" });
      prisma.pushCampaign.findUniqueOrThrow.mockResolvedValue({ id: "c2", category: "feed", titleRu: "a", bodyRu: "b", route: "/", audience: { type: "ALL" } });
      prisma.user.findMany.mockResolvedValue([]);

      await expect(service.runDue()).resolves.toBeUndefined();
      expect(prisma.pushCampaign.updateMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("one person", () => {
    it("refuses a person who has never signed in on the app", async () => {
      const { prisma, service } = setup();
      prisma.user.findFirst.mockResolvedValue({ id: "u1", phone: "+79170000000" });
      prisma.pushToken.count.mockResolvedValue(0);
      await expect(service.sendOne({ target: "+79170000000", content }, "a")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("finds by phone and sends now as a one-person campaign", async () => {
      const { prisma, service } = setup();
      prisma.user.findFirst.mockResolvedValue({ id: "u1", phone: "+79170000000" });
      prisma.pushToken.count.mockResolvedValue(2);
      prisma.pushCampaign.create.mockImplementation(({ data }) => Promise.resolve({ id: "c9", ...data }));
      prisma.pushCampaign.updateMany.mockResolvedValue({ count: 1 });
      prisma.pushCampaign.findUniqueOrThrow.mockResolvedValue({ id: "c9", category: "feed", titleRu: "a", bodyRu: "b", route: "/", audience: { type: "USERS", userIds: ["u1"] } });
      prisma.user.findMany.mockResolvedValue([]);

      await service.sendOne({ target: "+79170000000", content }, "admin1");

      expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { phone: "+79170000000" } }));
      expect(prisma.pushCampaign.create.mock.calls[0][0].data).toMatchObject({ audience: { type: "USERS", userIds: ["u1"] } });
    });

    it("says so when nobody matches", async () => {
      const { prisma, service } = setup();
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.sendOne({ target: "nobody", content }, "a")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("searches people only from two characters, with their device count", async () => {
      const { prisma, service } = setup();
      await expect(service.searchUsers("a")).resolves.toEqual([]);
      prisma.user.findMany.mockResolvedValue([{ id: "u1", phone: "+7", fullName: "A", username: "a", country: "RU", locale: "ru", _count: { pushTokens: 2 } }]);
      await expect(service.searchUsers("aygul")).resolves.toEqual([
        { id: "u1", phone: "+7", fullName: "A", username: "a", country: "RU", locale: "ru", devices: 2 },
      ]);
    });
  });

  describe("statistics", () => {
    it("derives failed, ignored and open rate from sent, delivered and opened", async () => {
      const { prisma, service } = setup();
      prisma.pushCampaign.findUnique.mockResolvedValue({ id: "c1" });
      prisma.$queryRaw
        .mockResolvedValueOnce([{ campaignId: "c1", sent: 10n, delivered: 8n, opened: 2n }])
        .mockResolvedValueOnce([{ country: "RU", sent: 6n, delivered: 5n, opened: 2n }, { country: null, sent: 4n, delivered: 3n, opened: 0n }]);

      const result = await service.getCampaign("c1");

      expect(result.stats).toEqual({ sent: 10, delivered: 8, failed: 2, opened: 2, ignored: 6, openRate: 25 });
      expect(result.byCountry).toEqual([
        { country: "RU", sent: 6, delivered: 5, failed: 1, opened: 2, ignored: 3, openRate: 40 },
        { country: "—", sent: 4, delivered: 3, failed: 1, opened: 0, ignored: 3, openRate: 0 },
      ]);
    });

    it("overview covers totals, sections, countries, days and how many people have the app", async () => {
      const { prisma, service } = setup();
      prisma.$queryRaw
        .mockResolvedValueOnce([{ sent: 3n, delivered: 3n, opened: 1n }])
        .mockResolvedValueOnce([{ category: "orders", sent: 3n, delivered: 3n, opened: 1n }])
        .mockResolvedValueOnce([{ country: "TM", sent: 3n, delivered: 3n, opened: 1n }])
        .mockResolvedValueOnce([{ day: new Date("2026-09-20T00:00:00Z"), sent: 3n, delivered: 3n, opened: 1n }]);
      prisma.pushToken.groupBy.mockResolvedValue([{ platform: "ANDROID", _count: { _all: 4 } }, { platform: "IOS", _count: { _all: 1 } }]);
      prisma.user.count.mockResolvedValue(5);

      const result = await service.overview(30);

      expect(result.totals).toMatchObject({ sent: 3, opened: 1, openRate: 33.3 });
      expect(result.byCategory[0]).toMatchObject({ category: "orders" });
      expect(result.byDay[0]).toMatchObject({ day: "2026-09-20" });
      expect(result.audience).toEqual({ usersWithApp: 5, devices: 5, byPlatform: { ANDROID: 4, IOS: 1 } });
    });
  });

  describe("retention", () => {
    it("keeps automatic pushes 90 days and campaign pushes a year", async () => {
      const { prisma, service } = setup();
      prisma.pushDelivery.deleteMany.mockResolvedValue({ count: 0 });
      await service.purgeOldDeliveries();
      expect(prisma.pushDelivery.deleteMany.mock.calls[0][0].where).toMatchObject({ campaignId: null });
      expect(prisma.pushDelivery.deleteMany.mock.calls[1][0].where).toMatchObject({ campaignId: { not: null } });
    });
  });
});

describe("PushAdminController security", () => {
  it("is for admins and managers only", () => {
    expect(Reflect.getMetadata(ROLES_KEY, PushAdminController)).toEqual(["ADMIN", "MANAGER"]);
    expect(Reflect.getMetadata(GUARDS_METADATA, PushAdminController)).toContain(RolesGuard);
  });

  it("rate limits creating and sending campaigns", () => {
    const reflector = new Reflector();
    const proto = PushAdminController.prototype;
    for (const handler of [proto.createCampaign, proto.send]) {
      expect(reflector.get<number>("THROTTLER:LIMITdefault", handler)).toBe(10);
    }
    expect(reflector.get<number>("THROTTLER:LIMITdefault", proto.sendOne)).toBe(20);
  });
});
