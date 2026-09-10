import { EmailTemplateService } from "./email-template.service";

/** A missing/unavailable table must not turn optional email customization into an API outage. */
describe("EmailTemplateService when template storage is unavailable", () => {
  function missingTablePrisma() {
    const error = Object.assign(new Error('The table `public.EmailTemplate` does not exist'), {
      code: "P2021",
    });
    return {
      emailTemplate: {
        findFirst: jest.fn().mockRejectedValue(error),
        create: jest.fn().mockRejectedValue(error),
      },
    };
  }

  it("boots without throwing when the EmailTemplate table does not exist", async () => {
    const service = new EmailTemplateService(missingTablePrisma() as never);
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it("still renders order mail from the built-in copy when the table is unreadable", async () => {
    const service = new EmailTemplateService(missingTablePrisma() as never);

    const rendered = await service.renderFor("ORDER_CREATED", "ru", {
      order: {
        id: "o1",
        serviceName: "TMCELL",
        recipientIdentifier: "+99361234567",
        amountTmt: "10",
        amountCharged: "0.62",
        currency: "USD",
        deliveryNote: null,
        failureReason: null,
      },
    });

    expect(rendered.subject).toContain("o1");
    expect(rendered.html).toContain("TMCELL");
    expect(rendered.text.trim()).not.toBe("");
    // version 0 marks content that did not come from the database.
    expect(rendered.templateVersion).toBe(0);
  });
});

describe("EmailTemplateService locale resolution", () => {
  function prismaWith(rows: Array<{ kind: string; locale: string }>) {
    return {
      emailTemplate: {
        findFirst: jest.fn(({ where }: { where: { kind: string; locale: string } }) => {
          const row = rows.find((r) => r.kind === where.kind && r.locale === where.locale);
          return Promise.resolve(
            row
              ? {
                  id: `db:${row.kind}:${row.locale}`,
                  version: 3,
                  subject: `[${row.locale}] {{order.id}}`,
                  preheader: "p",
                  html: "<p>{{order.id}}</p>",
                  text: "{{order.id}}",
                  ...row,
                }
              : null,
          );
        }),
      },
    };
  }

  it("prefers the user's own locale", async () => {
    const service = new EmailTemplateService(
      prismaWith([
        { kind: "ORDER_CREATED", locale: "ru" },
        { kind: "ORDER_CREATED", locale: "tkm" },
      ]) as never,
    );
    const rendered = await service.renderFor("ORDER_CREATED", "tkm", { order: { id: "o1" } });
    expect(rendered.subject).toBe("[tkm] o1");
    expect(rendered.locale).toBe("tkm");
  });

  it("falls back to the default locale rather than failing when the translation is missing", async () => {
    const service = new EmailTemplateService(prismaWith([{ kind: "ORDER_CREATED", locale: "ru" }]) as never);
    const rendered = await service.renderFor("ORDER_CREATED", "tkm", { order: { id: "o1" } });
    expect(rendered.locale).toBe("ru");
  });
});
