import { DEFAULT_TEMPLATES } from "./push-default-templates";
import { PushCampaignService } from "./push-campaign.service";
import { PUSH_CATEGORIES } from "./push-message";

describe("default push templates", () => {
  it("has unique names, so installing twice can never duplicate", () => {
    const names = DEFAULT_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("fits the database columns and only opens screens the app has", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(PUSH_CATEGORIES).toContain(t.category);
      expect(t.route).toMatch(/^\/(?!\/)/);
      for (const lang of [t.ru, t.en, t.tkm]) {
        expect(lang.title.length).toBeGreaterThan(0);
        expect(lang.title.length).toBeLessThanOrEqual(120);
        expect(lang.body.length).toBeGreaterThan(0);
        expect(lang.body.length).toBeLessThanOrEqual(500);
      }
      expect(["/home", "/home/orders", "/gallery", "/feed", "/chats", "/home/cargo", "/profile"]).toContain(t.route);
    }
  });

  it("keeps Cyrillic out of the English and Turkmen text (a typo that looks fine on screen)", () => {
    for (const t of DEFAULT_TEMPLATES) {
      for (const lang of [t.en, t.tkm]) {
        expect(`${lang.title} ${lang.body}`).not.toMatch(/[Ѐ-ӿ]/);
      }
    }
  });

  it("makes no promise about prices, discounts or delivery times", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(`${t.ru.title} ${t.ru.body}`).not.toMatch(/\d+\s?%|скидк\w+ \d|бесплатн|за \d+ (час|мин)/i);
    }
  });

  it("covers holidays, promotions, reminders and service notices", () => {
    const prefixes = new Set(DEFAULT_TEMPLATES.map((t) => t.name.split(":")[0]));
    for (const wanted of ["Праздник", "Акция", "Напоминание", "Сервис", "Безопасность"]) {
      expect(prefixes).toContain(wanted);
    }
    expect(DEFAULT_TEMPLATES.length).toBeGreaterThanOrEqual(20);
  });
});

describe("installing the defaults", () => {
  function setup(existingNames: string[]) {
    const prisma = {
      pushTemplate: {
        findMany: jest.fn().mockResolvedValue(existingNames.map((name) => ({ name }))),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const audit = { record: jest.fn() };
    const service = new PushCampaignService(prisma as never, {} as never, audit as never);
    return { prisma, audit, service };
  }

  it("creates every template on an empty database", async () => {
    const { prisma, service } = setup([]);
    const result = await service.installDefaultTemplates("admin1");
    expect(result).toEqual({ created: DEFAULT_TEMPLATES.length, existing: 0, total: DEFAULT_TEMPLATES.length });
    const data = prisma.pushTemplate.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(DEFAULT_TEMPLATES.length);
    expect(data[0]).toMatchObject({ createdById: "admin1", titleTkm: expect.any(String), titleEn: expect.any(String) });
  });

  it("adds only what is missing and never touches an existing one", async () => {
    const already = DEFAULT_TEMPLATES.slice(0, 5).map((t) => t.name);
    const { prisma, service } = setup(already);
    const result = await service.installDefaultTemplates("admin1");
    expect(result).toEqual({ created: DEFAULT_TEMPLATES.length - 5, existing: 5, total: DEFAULT_TEMPLATES.length });
    const created = prisma.pushTemplate.createMany.mock.calls[0][0].data.map((d: { name: string }) => d.name);
    for (const name of already) expect(created).not.toContain(name);
  });

  it("does nothing when everything is already there", async () => {
    const { prisma, service } = setup(DEFAULT_TEMPLATES.map((t) => t.name));
    await expect(service.installDefaultTemplates("admin1")).resolves.toMatchObject({ created: 0 });
    expect(prisma.pushTemplate.createMany).not.toHaveBeenCalled();
  });
});
