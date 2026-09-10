import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import type { EmailKind, EmailTemplate, EmailTemplateStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_TEMPLATES } from "./default-templates";
import { EMAIL_KINDS, defaultEmailLocale, isEmailLocale, type EmailLocale } from "./email-kinds";
import { TemplateRenderError, render, validateTemplateSource } from "./template-renderer";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  locale: EmailLocale;
  templateId: string;
  templateVersion: number;
}

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // Deliberately non-fatal. A transient database failure must not prevent the API from
    // booting; templates are seeded on a later restart and resolve() falls back to the built-in
    // copy in the meantime.
    try {
      await this.seed();
    } catch (err) {
      this.logger.warn(
        `Template seeding skipped: ${err instanceof Error ? err.message : String(err)}. ` +
          "Built-in defaults will be used until the next boot.",
      );
    }
  }

  /**
   * Writes the built-in templates for any (kind, locale) that has no row yet, as version 1 /
   * ACTIVE. Existing rows are never touched: once a template is in the database the admin panel
   * owns it, and a deploy must not silently revert wording someone edited in production.
   */
  async seed() {
    let created = 0;
    for (const template of DEFAULT_TEMPLATES) {
      const existing = await this.prisma.emailTemplate.findFirst({
        where: { kind: template.kind, locale: template.locale },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.emailTemplate.create({
        data: {
          kind: template.kind,
          locale: template.locale,
          version: 1,
          status: "ACTIVE",
          subject: template.subject,
          preheader: template.preheader,
          html: template.html,
          text: template.text,
        },
      });
      created += 1;
    }
    if (created > 0) this.logger.log(`Seeded ${created} default email template(s)`);
  }

  /**
   * Finds the ACTIVE template for a kind, preferring the requested locale and falling back to
   * the configured default. A fallback is logged (never thrown) -- a user whose language has no
   * translation yet should still get the email, in another language.
   */
  async resolve(kind: EmailKind, requestedLocale: string | null | undefined): Promise<EmailTemplate> {
    const wanted: EmailLocale = isEmailLocale(requestedLocale) ? requestedLocale : defaultEmailLocale();
    const fallbackLocale = defaultEmailLocale();

    // The database read is itself allowed to fail: during the window between a new image
    // starting and its migration running, EmailTemplate may not exist yet. Mail still has to go
    // out, so fall through to the built-in copy rather than erroring.
    try {
      const exact = await this.findActive(kind, wanted);
      if (exact) return exact;

      if (wanted !== fallbackLocale) {
        const fallback = await this.findActive(kind, fallbackLocale);
        if (fallback) {
          this.logger.warn(`EMAIL_LOCALE_FALLBACK kind=${kind} requested=${wanted} used=${fallbackLocale}`);
          return fallback;
        }
      }
    } catch (err) {
      this.logger.warn(
        `Template lookup failed for kind=${kind}, using built-in default: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const builtIn = this.builtInTemplate(kind, wanted) ?? this.builtInTemplate(kind, fallbackLocale);
    if (builtIn) {
      this.logger.warn(`EMAIL_TEMPLATE_BUILTIN_FALLBACK kind=${kind} locale=${builtIn.locale}`);
      return builtIn;
    }
    throw new NotFoundException(`No active email template for kind=${kind}`);
  }

  /**
   * The seed content, shaped as an EmailTemplate without ever having been persisted. Version 0
   * marks it as "not from the database" wherever it is recorded on an EmailLog.
   */
  private builtInTemplate(kind: EmailKind, locale: EmailLocale): EmailTemplate | null {
    const source = DEFAULT_TEMPLATES.find((t) => t.kind === kind && t.locale === locale);
    if (!source) return null;
    const now = new Date();
    return {
      id: `builtin:${kind}:${locale}`,
      kind,
      locale,
      version: 0,
      status: "ACTIVE",
      subject: source.subject,
      preheader: source.preheader,
      html: source.html,
      text: source.text,
      createdById: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  private findActive(kind: EmailKind, locale: EmailLocale) {
    return this.prisma.emailTemplate.findFirst({
      where: { kind, locale, status: "ACTIVE" },
      orderBy: { version: "desc" },
    });
  }

  /**
   * Resolves and renders in one step. Throws before anything reaches SMTP if a required
   * variable is missing, so a broken template surfaces as an error rather than as a customer
   * receiving a literal `{{user.firstName}}`.
   */
  async renderFor(
    kind: EmailKind,
    locale: string | null | undefined,
    variables: Record<string, unknown>,
  ): Promise<RenderedEmail> {
    const template = await this.resolve(kind, locale);
    try {
      return {
        subject: render(template.subject, variables, false),
        html: render(template.html, variables, true),
        text: render(template.text, variables, false),
        locale: template.locale as EmailLocale,
        templateId: template.id,
        templateVersion: template.version,
      };
    } catch (err) {
      if (err instanceof TemplateRenderError) {
        // Deliberately names the template, not the variable values -- those can hold an OTP.
        throw new BadRequestException(
          `Template ${kind}/${template.locale} v${template.version} failed to render: ${err.message}`,
        );
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Admin operations
  // ---------------------------------------------------------------------------

  list(filter: { kind?: EmailKind; locale?: string; status?: EmailTemplateStatus } = {}) {
    return this.prisma.emailTemplate.findMany({
      where: filter,
      orderBy: [{ kind: "asc" }, { locale: "asc" }, { version: "desc" }],
      include: { createdBy: { select: { id: true, fullName: true, username: true } } },
    });
  }

  async get(id: string) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException("Template not found");
    return template;
  }

  /** Checks a body against the variables its kind declares. Used by the editor and on save. */
  validate(kind: EmailKind, input: { subject: string; html: string; text: string }): string[] {
    const allowed = EMAIL_KINDS[kind].variables;
    const problems: string[] = [];
    if (!input.subject.trim()) problems.push("Subject is empty");
    if (!input.html.trim()) problems.push("HTML body is empty");
    if (!input.text.trim()) problems.push("Plain-text body is empty");
    for (const [label, source] of [
      ["subject", input.subject],
      ["html", input.html],
      ["text", input.text],
    ] as const) {
      for (const problem of validateTemplateSource(source, allowed)) {
        problems.push(`${label}: ${problem}`);
      }
    }
    return problems;
  }

  /**
   * Saves an edit as a NEW version rather than mutating the existing row, so an ACTIVE template
   * that mail has already been sent against stays byte-identical and referenceable from EmailLog.
   */
  async createVersion(
    kind: EmailKind,
    locale: string,
    input: { subject: string; preheader?: string | null; html: string; text: string },
    createdById?: string,
  ) {
    if (!isEmailLocale(locale)) throw new BadRequestException(`Unsupported locale: ${locale}`);
    const problems = this.validate(kind, input);
    if (problems.length > 0) throw new BadRequestException(problems.join("; "));

    const latest = await this.prisma.emailTemplate.findFirst({
      where: { kind, locale },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    return this.prisma.emailTemplate.create({
      data: {
        kind,
        locale,
        version: (latest?.version ?? 0) + 1,
        status: "DRAFT",
        subject: input.subject,
        preheader: input.preheader ?? null,
        html: input.html,
        text: input.text,
        createdById,
      },
    });
  }

  /**
   * Promotes one version to ACTIVE and archives whichever version currently holds that slot.
   * Done in a transaction because "exactly one ACTIVE per (kind, locale)" is an invariant the
   * schema itself cannot express -- Prisma has no partial unique index.
   */
  async activate(id: string) {
    const template = await this.get(id);
    if (template.status === "ARCHIVED") {
      throw new BadRequestException("Archived templates cannot be activated; create a new version instead");
    }
    const problems = this.validate(template.kind, template);
    if (problems.length > 0) throw new BadRequestException(problems.join("; "));

    return this.prisma.$transaction(async (tx) => {
      await tx.emailTemplate.updateMany({
        where: { kind: template.kind, locale: template.locale, status: "ACTIVE", id: { not: id } },
        data: { status: "ARCHIVED" },
      });
      return tx.emailTemplate.update({ where: { id }, data: { status: "ACTIVE" } });
    });
  }

  async archive(id: string) {
    const template = await this.get(id);
    if (template.status === "ACTIVE") {
      throw new BadRequestException("Cannot archive the active template; activate another version first");
    }
    return this.prisma.emailTemplate.update({ where: { id }, data: { status: "ARCHIVED" } });
  }

  /** Renders a template against placeholder values, for the admin preview pane. */
  async preview(id: string) {
    const template = await this.get(id);
    const sample = sampleVariables(template.kind);
    return {
      subject: render(template.subject, sample, false),
      html: render(template.html, sample, true),
      text: render(template.text, sample, false),
    };
  }
}

/**
 * Realistic stand-in values, keyed by the exact variable path. Nothing here touches real user
 * data -- a preview must be safe to open for any template without loading someone's order.
 */
const SAMPLE_VALUES: Record<string, string> = {
  "user.firstName": "Aman",
  "otp.code": "481293",
  "otp.expiresIn": "10",
  "order.id": "ord_8f2a41c7",
  "order.serviceName": "TMCELL",
  "order.recipientIdentifier": "+99361234567",
  "order.amountTmt": "50.00",
  "order.amountCharged": "3.10",
  "order.currency": "USD",
  "order.deliveryNote": "Пополнение зачислено на баланс.",
  "order.failureReason": "Оператор отклонил операцию.",
  "order.productName": "Букет «Розовый рассвет»",
  "order.recipientName": "Марал Аннаева",
  "order.recipientPhone": "+99365123456",
  "order.deliveryCity": "Ашхабад",
  "order.deliveryAddress": "ул. Битарап Туркменистан, 12, кв. 4",
  "order.cardMessage": "С днём рождения!",
  "seller.name": "Bucet TM",
  "seller.shopName": "Bucet TM",
  "seller.reason": "Не хватает документов",
  "payout.amountTmt": "250.00",
  "payout.note": "Выплачено на карту.",
  "event.at": "01.09.2026 14:32",
  "event.ip": "203.0.113.10",
  "message.body": "Текст сообщения.",
  unsubscribeUrl: "https://api.gulyaly.pro/api/marketing/unsubscribe?uid=demo&token=demo",
};

/**
 * Builds preview data *from the kind's declared variables* rather than from a hand-maintained
 * object.
 *
 * The previous version listed sample values separately, so adding a variable to a kind left the
 * preview missing it and the template failed to render -- which is exactly what happened when
 * the seller templates gained delivery fields. Deriving from the declaration means the two
 * cannot drift: every declared variable gets a value by construction, falling back to a visible
 * placeholder if no realistic sample is defined for it.
 */
export function sampleVariables(kind: EmailKind): Record<string, unknown> {
  const vars: Record<string, unknown> = {};

  for (const path of EMAIL_KINDS[kind].variables) {
    const value = SAMPLE_VALUES[path] ?? `[${path}]`;
    const segments = path.split(".");
    if (segments.length === 1) {
      vars[segments[0]] = value;
      continue;
    }
    const [root, leaf] = segments;
    const bucket = (vars[root] ??= {}) as Record<string, unknown>;
    bucket[leaf] = value;
  }

  return vars;
}
