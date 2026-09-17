import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";
import * as nodemailer from "nodemailer";
import type { Queue } from "bullmq";
import type { Order, EmailKind, EmailStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  EMAIL_QUEUE_CRITICAL,
  EMAIL_QUEUE_MARKETING,
  EMAIL_QUEUE_TRANSACTIONAL,
} from "../queue/queue.module";
import { EMAIL_KINDS, replyToAddress, senderAddress, type EmailPriority } from "./email-kinds";
import { EmailTemplateService } from "./email-template.service";
import { EmailQuotaService } from "./email-quota.service";
import { EmailSuppressionService } from "./email-suppression.service";
// Order templates now live in the database (see default-templates.ts / EmailTemplateService).
// These two stay in code: the marketing broadcast renders admin-supplied body text rather than
// stored wording, and the test mail is a fixed SMTP probe with nothing to translate.
import { marketingTemplate, testEmailTemplate } from "./templates";

/** Which configured transporter a queued job should send through -- a Transporter instance
 *  itself can't be serialized into a Redis job payload. */
export type TransporterVariant = "main" | "marketing";

export interface EmailJobData {
  kind: EmailKind;
  toEmail: string;
  userId?: string | null;
  subject: string;
  html: string;
  /** Rendered text/plain part. Older queued jobs predate this field and fall back to stripping the HTML. */
  text?: string;
  from?: string;
  replyTo?: string;
  transporterVariant?: TransporterVariant;
  headers?: Record<string, string>;
  /** Stable id for the business event, so a replayed event cannot send twice. */
  idempotencyKey?: string;
  /** Provenance, recorded on EmailLog so a complaint can be traced to exact content. */
  locale?: string | null;
  templateId?: string | null;
  templateVersion?: number | null;
}

/** name@domain -> n***@domain, for log lines only. The DB EmailLog keeps the real address --
 *  that's an admin-facing audit trail behind auth, not a server log grep target. */
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

/** SMTP/connection error triage -- see the comment at sendNow()'s catch block for how each class
 *  is handled. Nodemailer surfaces the SMTP reply code as `responseCode`; connection-level
 *  failures (wrong host, relay down) come through as Node's `err.code` instead, with no
 *  `responseCode` at all. */
type ErrorClass = "temporary" | "permanent" | "auth-or-config";

function classifySmtpError(err: unknown): ErrorClass {
  const e = err as { responseCode?: number; code?: string } | undefined;
  const responseCode = e?.responseCode;
  if (responseCode === 535 || responseCode === 534 || responseCode === 530) return "auth-or-config";
  if (typeof responseCode === "number") {
    return responseCode >= 500 ? "permanent" : "temporary";
  }
  const code = e?.code;
  if (code === "EAUTH") return "auth-or-config";
  if (code === "ENOTFOUND" || code === "ECONNREFUSED" || code === "EDNS") return "auth-or-config"; // misconfigured host, not a transient network blip worth retrying blindly
  return "temporary"; // ETIMEDOUT, ECONNRESET, etc. -- worth a retry
}

const SETTINGS_ID = "singleton";

/** Retry policy shared by every queued email job. */
const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 30_000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

// Deliverability: an HTML-only email with no text/plain MIME part is a well-known spam signal
// (most legitimate mail is multipart/alternative; spam disproportionately isn't). This is a
// plain regex-based stripper rather than a real HTML parser -- good enough for our own templates
// (simple, non-adversarial markup), not meant to handle arbitrary third-party HTML.
function htmlToPlainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/li)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
/** Shapes an Order into the `{{order.*}}` variables the stored templates reference. */
function toEmailData(order: Order & { service: { name: string } }) {
  return {
    id: order.id,
    serviceName: order.service.name,
    recipientIdentifier: order.recipientIdentifier,
    amountTmt: order.amountTmt.toString(),
    amountCharged: order.amountCharged.toString(),
    currency: order.currency,
    // Nullable -- the templates wrap both in a presence section, so absence drops the block.
    deliveryNote: order.deliveryNote,
    failureReason: order.failureReason,
  };
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private transporterMarketing: nodemailer.Transporter | null = null;
  private fromAddress: string;
  private fromAddressMarketing: string;
  private apiPublicUrl: string;
  private unsubscribeSecret: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject(EMAIL_QUEUE_CRITICAL) private criticalQueue: Queue<EmailJobData>,
    @Inject(EMAIL_QUEUE_TRANSACTIONAL) private transactionalQueue: Queue<EmailJobData>,
    @Inject(EMAIL_QUEUE_MARKETING) private marketingQueue: Queue<EmailJobData>,
    private templates: EmailTemplateService,
    private quota: EmailQuotaService,
    private suppression: EmailSuppressionService,
  ) {
    const host = this.config.get<string>("MAIL_HOST");
    this.fromAddress = this.config.get<string>("MAIL_FROM") || "Gulyaly <no-reply@gulyaly.example>";
    // Deliberately separate from MAIL_FROM: keeps marketing broadcasts on their own sending
    // domain (own SPF/DKIM), so spam complaints on a newsletter can't drag down deliverability
    // for transactional mail (order confirmations, codes). Falls back to the transactional
    // address if unset, rather than failing, so this stays optional until the newsletter domain
    // is actually provisioned.
    this.fromAddressMarketing = this.config.get<string>("MAIL_FROM_MARKETING") || this.fromAddress;
    this.apiPublicUrl = this.config.get<string>("API_PUBLIC_URL") || "https://api.gulyaly.pro";
    // Reused rather than a dedicated secret -- the HMAC below is domain-separated by a fixed
    // prefix, so there's no cross-purpose collision with this secret's use for JWTs.
    this.unsubscribeSecret = this.config.get<string>("JWT_ACCESS_SECRET") || "";
    if (host) {
      this.transporter = this.buildTransport(
        host,
        this.config.get<string>("MAIL_PORT"),
        this.config.get<string>("MAIL_SECURE"),
        this.config.get<string>("MAIL_USER"),
        this.config.get<string>("MAIL_PASS"),
        this.config.get<string>("MAIL_TLS_CA_BASE64"),
        this.config.get<string>("MAIL_TLS_SERVERNAME"),
      );
      // Marketing gets its own host/port/security too, not just its own login -- it may live on
      // a completely different relay than transactional mail (e.g. transactional moved to a
      // hosted provider while marketing stays on a self-hosted relay). Every MAIL_*_MARKETING
      // var falls back to its transactional counterpart when unset, so this stays a no-op change
      // for a setup that never differentiated the two.
      const marketingHost = this.config.get<string>("MAIL_HOST_MARKETING") || host;
      const marketingUser = this.config.get<string>("MAIL_USER_MARKETING");
      this.transporterMarketing = marketingUser
        ? this.buildTransport(
            marketingHost,
            this.config.get<string>("MAIL_PORT_MARKETING") || this.config.get<string>("MAIL_PORT"),
            this.config.get<string>("MAIL_SECURE_MARKETING") || this.config.get<string>("MAIL_SECURE"),
            marketingUser,
            this.config.get<string>("MAIL_PASS_MARKETING"),
            this.config.get<string>("MAIL_TLS_CA_BASE64_MARKETING") || this.config.get<string>("MAIL_TLS_CA_BASE64"),
            this.config.get<string>("MAIL_TLS_SERVERNAME_MARKETING") || this.config.get<string>("MAIL_TLS_SERVERNAME"),
          )
        : this.transporter;
    } else {
      this.logger.warn("MAIL_HOST is not set — outgoing email is disabled; sends will be recorded as SKIPPED");
    }
  }

  private buildTransport(
    host: string,
    port: string | undefined,
    secure: string | undefined,
    user: string | undefined,
    pass: string | undefined,
    caBase64: string | undefined,
    servername: string | undefined,
  ): nodemailer.Transporter {
    // MAIL_TLS_CA_BASE64 pins a relay's own certificate instead of relying on a public CA --
    // needed only for a relay with a self-signed cert (or reachable by raw IP). A provider with a
    // real trusted certificate (e.g. REG.RU's hosting mail) needs neither var set.
    return nodemailer.createTransport({
      host,
      port: Number(port ?? 587),
      secure: secure === "true",
      auth: user ? { user, pass } : undefined,
      tls: {
        ...(caBase64 ? { ca: Buffer.from(caBase64, "base64") } : {}),
        ...(servername ? { servername } : {}),
      },
    });
  }

  getSettings() {
    return this.prisma.emailSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  updateSettings(input: { transactionalEnabled?: boolean; marketingEnabled?: boolean }) {
    return this.prisma.emailSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...input },
      update: input,
    });
  }

  listLogs(limit = 100) {
    return this.prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { id: true, phone: true, fullName: true } } },
    });
  }

  private async log(
    kind: EmailKind,
    toEmail: string,
    subject: string,
    status: EmailStatus,
    error: string | null,
    userId?: string | null,
    provenance?: { locale?: string | null; templateId?: string | null; templateVersion?: number | null },
  ) {
    try {
      await this.prisma.emailLog.create({
        data: {
          kind,
          toEmail,
          subject,
          status,
          error: error ?? undefined,
          userId: userId ?? undefined,
          locale: provenance?.locale ?? undefined,
          templateId: provenance?.templateId ?? undefined,
          templateVersion: provenance?.templateVersion ?? undefined,
        },
      });
    } catch {
      // logging must never break the caller
    }
  }

  /**
   * Consent and deliverability gate, applied before a job is ever queued.
   *
   * Split by category on purpose: marketing needs an explicit opt-in and honours the suppression
   * list, while authentication and security mail ignores both -- someone who unsubscribed from a
   * newsletter, or whose address once bounced, must still receive the password reset they just
   * asked for. Returns a reason string when the send must be skipped, or null to proceed.
   */
  private async consentBlockReason(kind: EmailKind, toEmail: string, userId?: string | null): Promise<string | null> {
    const spec = EMAIL_KINDS[kind];

    // Both lookups tolerate the table not existing yet (new image, migration not yet applied --
    // see EmailTemplateService.onModuleInit). They fail in opposite directions on purpose: an
    // unreadable suppression list must not silently block a password reset, while unreadable
    // consent must never be treated as consent.
    if (spec.respectsSuppression) {
      try {
        const suppressed = await this.prisma.emailSuppression.findUnique({
          where: { email: toEmail.toLowerCase() },
          select: { reason: true },
        });
        if (suppressed) return `Адрес в списке подавления (${suppressed.reason})`;
      } catch (err) {
        this.logger.warn(`Suppression check unavailable, proceeding: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (spec.requiresOptIn) {
      if (!userId) return "Маркетинговое письмо без привязки к пользователю — нет подтверждённого согласия";
      try {
        const preference = await this.prisma.emailPreference.findUnique({
          where: { userId },
          select: { marketing: true, unsubscribedAt: true },
        });
        if (!preference?.marketing || preference.unsubscribedAt) return "Пользователь не давал согласия на рассылку";
      } catch (err) {
        this.logger.warn(`Consent check unavailable, blocking: ${err instanceof Error ? err.message : err}`);
        return "Не удалось проверить согласие на рассылку";
      }
    }

    return null;
  }

  /**
   * The way application code sends mail: name a kind, hand over its variables, and let the
   * stored template for the recipient's locale supply the wording. Business logic never builds
   * HTML, so wording and translations are editable in the admin panel without a deploy.
   */
  async sendTemplate(
    kind: EmailKind,
    params: {
      toEmail: string | null;
      userId?: string | null;
      locale?: string | null;
      variables: Record<string, unknown>;
      headers?: Record<string, string>;
      idempotencyKey?: string;
    },
  ) {
    const { toEmail, userId, locale, variables, headers, idempotencyKey } = params;
    if (!toEmail) {
      await this.log(kind, "(нет email)", `[${kind}]`, "SKIPPED", "У пользователя не указан email", userId);
      return;
    }

    const blocked = await this.consentBlockReason(kind, toEmail, userId);
    if (blocked) {
      await this.log(kind, toEmail, `[${kind}]`, "SKIPPED", blocked, userId);
      return;
    }

    const rendered = await this.templates.renderFor(kind, locale, variables);
    await this.enqueue({
      kind,
      toEmail,
      userId,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      from: senderAddress(kind),
      replyTo: replyToAddress(),
      transporterVariant: EMAIL_KINDS[kind].category === "MARKETING" ? "marketing" : "main",
      headers,
      idempotencyKey,
      locale: rendered.locale,
      templateId: rendered.templateId,
      templateVersion: rendered.templateVersion,
    });
  }

  /** Puts an email job on the queue instead of sending inline in the calling request -- the
   *  actual SMTP send happens in EmailProcessor's worker, which also applies the rate limit and
   *  retry policy. The "no recipient" case is resolved here rather than as a job, since there's
   *  nothing a worker/retry could do about a user with no email on file. */
  private async enqueue(params: {
    kind: EmailKind;
    toEmail: string | null;
    userId?: string | null;
    subject: string;
    html: string;
    text?: string;
    from?: string;
    replyTo?: string;
    transporterVariant?: TransporterVariant;
    headers?: Record<string, string>;
    idempotencyKey?: string;
    locale?: string | null;
    templateId?: string | null;
    templateVersion?: number | null;
  }) {
    const { kind, toEmail, userId, subject, idempotencyKey } = params;
    if (!toEmail) {
      await this.log(kind, "(нет email)", subject, "SKIPPED", "У пользователя не указан email", userId);
      return;
    }
    if (!this.transporter) {
      await this.log(kind, toEmail, subject, "SKIPPED", "SMTP не настроен", userId, params);
      return;
    }
    await this.queueFor(EMAIL_KINDS[kind].priority).add(
      "send-email",
      { ...params, toEmail },
      {
        ...JOB_OPTIONS,
        // BullMQ refuses a second job with an id it already holds, which is what makes a
        // replayed business event (a retried request, a redelivered webhook) send one email
        // instead of two. Absent a key, fall back to BullMQ's own generated id -- no dedup.
        ...(idempotencyKey ? { jobId: idempotencyKey } : {}),
      },
    );
  }

  private queueFor(priority: EmailPriority): Queue<EmailJobData> {
    if (priority === "critical") return this.criticalQueue;
    if (priority === "marketing") return this.marketingQueue;
    return this.transactionalQueue;
  }

  /** Does the actual SMTP send -- called only by EmailProcessor's worker, never directly from a
   *  request handler. Throwing here means "retry me" to BullMQ; returning normally (even after a
   *  permanent failure that's been logged) means "done, don't retry". */
  async sendNow(job: EmailJobData): Promise<void> {
    const { kind, toEmail, userId, subject, html, text, from, replyTo, transporterVariant, headers } = job;
    const transporter = transporterVariant === "marketing" ? this.transporterMarketing : this.transporter;
    if (!transporter) {
      await this.log(kind, toEmail, subject, "SKIPPED", "SMTP не настроен", userId, job);
      return;
    }
    // Claimed here rather than at enqueue time: a job can sit in the queue across a day
    // boundary, and holding a reservation over that would charge the wrong day's budget.
    const quotaBlock = await this.quota.claim(EMAIL_KINDS[kind].priority);
    if (quotaBlock) {
      this.logger.warn(`EMAIL_QUOTA_EXHAUSTED kind=${kind} priority=${EMAIL_KINDS[kind].priority}: ${quotaBlock}`);
      await this.log(kind, toEmail, subject, "SKIPPED", quotaBlock, userId, job);
      return;
    }

    const startedAt = Date.now();
    const recipientDomain = toEmail.split("@")[1] ?? "unknown";
    try {
      await transporter.sendMail({
        from: from ?? this.fromAddress,
        to: toEmail,
        replyTo,
        subject,
        html,
        // Templates carry their own hand-written plain-text part; htmlToPlainText is the
        // fallback for the ad-hoc sends that have no template behind them.
        text: text ?? htmlToPlainText(html),
        headers,
      });
      await this.log(kind, toEmail, subject, "SENT", null, userId, job);
      this.logger.log(
        `email sent kind=${kind} to=${maskEmail(toEmail)} domain=${recipientDomain} durationMs=${Date.now() - startedAt}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const errorClass = classifySmtpError(err);
      const durationMs = Date.now() - startedAt;
      // Give the slot back unless the server actually accepted and then rejected the message.
      // A permanent 5xx was processed by REG.RU and counts against the day; a connection or auth
      // failure never reached them, and a retry would otherwise burn the budget twice over.
      if (errorClass !== "permanent") await this.quota.release();
      if (errorClass === "auth-or-config") {
        // Retrying with the same bad password/host will never succeed -- fail this job
        // immediately (no BullMQ retry) but log loud and distinct so it's alertable/greppable,
        // rather than silently blending into ordinary bounce noise.
        this.logger.error(
          `SMTP_AUTH_OR_CONFIG_FAILURE kind=${kind} to=${maskEmail(toEmail)} domain=${recipientDomain} durationMs=${durationMs}: ${message}`,
        );
        await this.log(kind, toEmail, subject, "FAILED", `[auth/config] ${message}`, userId, job);
        return;
      }
      if (errorClass === "permanent") {
        // e.g. 550 mailbox does not exist -- retrying won't help, this recipient is done.
        this.logger.warn(
          `email permanently failed kind=${kind} to=${maskEmail(toEmail)} domain=${recipientDomain} durationMs=${durationMs}: ${message}`,
        );
        await this.log(kind, toEmail, subject, "FAILED", message, userId, job);
        // REG.RU exposes no bounce webhook or API, so a permanent rejection at submission time
        // is the only bounce signal available. Recording it stops us from repeatedly mailing a
        // dead address, which is what actually damages sending reputation over time.
        await this.suppression
          .add(toEmail, "HARD_BOUNCE", `${kind}: ${message}`)
          .catch((err) => this.logger.warn(`Could not record suppression: ${err?.message ?? err}`));
        return;
      }
      // Temporary (4xx, timeout, connection reset) -- log and rethrow so BullMQ retries with backoff.
      this.logger.warn(
        `email temporarily failed, will retry kind=${kind} to=${maskEmail(toEmail)} domain=${recipientDomain} durationMs=${durationMs}: ${message}`,
      );
      await this.log(kind, toEmail, subject, "FAILED", `[retrying] ${message}`, userId, job);
      throw err;
    }
  }

  /**
   * Address an order email may go to: present, and confirmed to belong to this user. Sending
   * order details to an unverified address risks mailing a stranger whose address someone
   * mistyped -- and every bounce from one of those costs sending reputation.
   */
  private deliverableAddress(user: { email: string | null; emailVerified: boolean } | null): string | null {
    if (!user?.email || !user.emailVerified) return null;
    return user.email;
  }

  /** Fire-and-forget from order flows — never throws. */
  async sendOrderCreated(orderId: string) {
    try {
      const settings = await this.getSettings();
      if (!settings.transactionalEnabled) return;
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { service: true, user: true } });
      if (!order) return;
      await this.sendTemplate("ORDER_CREATED", {
        toEmail: this.deliverableAddress(order.user),
        userId: order.userId,
        locale: order.user?.locale,
        variables: { order: toEmailData(order) },
        idempotencyKey: `order:${order.id}:ORDER_CREATED`,
      });
    } catch (err) {
      this.logger.error(`sendOrderCreated(${orderId}) failed`, err instanceof Error ? err.stack : undefined);
    }
  }

  /** Fire-and-forget from order flows — never throws. Only COMPLETED/FAILED trigger a customer email. */
  async sendOrderStatusUpdate(orderId: string) {
    try {
      const settings = await this.getSettings();
      if (!settings.transactionalEnabled) return;
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { service: true, user: true } });
      if (!order || (order.status !== "COMPLETED" && order.status !== "FAILED")) return;
      const kind: EmailKind = order.status === "COMPLETED" ? "ORDER_COMPLETED" : "ORDER_FAILED";
      await this.sendTemplate(kind, {
        toEmail: this.deliverableAddress(order.user),
        userId: order.userId,
        locale: order.user?.locale,
        variables: { order: toEmailData(order) },
        idempotencyKey: `order:${order.id}:${kind}`,
      });
    } catch (err) {
      this.logger.error(`sendOrderStatusUpdate(${orderId}) failed`, err instanceof Error ? err.stack : undefined);
    }
  }

  /**
   * Resolves a seller to a deliverable address. Same verified-only rule as customer mail: a
   * seller's account email is unverified until they prove it, and order details are not
   * something to send to an address nobody has confirmed.
   */
  private async sellerRecipient(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { shopName: true, user: { select: { id: true, email: true, emailVerified: true, locale: true } } },
    });
    if (!seller) return null;
    return {
      toEmail: this.deliverableAddress(seller.user),
      userId: seller.user?.id ?? null,
      locale: seller.user?.locale,
      name: seller.shopName,
    };
  }

  /**
   * Seller notifications. These complement the existing Telegram messages rather than replacing
   * them -- a seller who never linked Telegram previously received nothing at all, and email is
   * then the only channel that reaches them.
   *
   * Fire-and-forget like the customer order mail: a notification must never fail the business
   * operation that triggered it.
   */
  async sendSellerNewOrder(
    sellerId: string,
    order: {
      id: string;
      productName: string;
      amountTmt: string;
      recipientName: string;
      recipientPhone: string;
      deliveryCity: string;
      deliveryAddress: string;
      cardMessage?: string | null;
    },
  ) {
    try {
      const recipient = await this.sellerRecipient(sellerId);
      if (!recipient) return;
      await this.sendTemplate("SELLER_NEW_ORDER", {
        toEmail: recipient.toEmail,
        userId: recipient.userId,
        locale: recipient.locale,
        variables: { seller: { name: recipient.name }, order },
        idempotencyKey: `gallery-order:${order.id}:SELLER_NEW_ORDER`,
      });
    } catch (err) {
      this.logger.error(`sendSellerNewOrder(${sellerId}) failed`, err instanceof Error ? err.stack : undefined);
    }
  }

  async sendSellerOrderCancelled(
    sellerId: string,
    order: { id: string; productName: string; amountTmt: string },
  ) {
    try {
      const recipient = await this.sellerRecipient(sellerId);
      if (!recipient) return;
      await this.sendTemplate("SELLER_ORDER_CANCELLED", {
        toEmail: recipient.toEmail,
        userId: recipient.userId,
        locale: recipient.locale,
        variables: { seller: { name: recipient.name }, order },
        idempotencyKey: `gallery-order:${order.id}:SELLER_ORDER_CANCELLED`,
      });
    } catch (err) {
      this.logger.error(`sendSellerOrderCancelled(${sellerId}) failed`, err instanceof Error ? err.stack : undefined);
    }
  }

  async sendSellerPayout(sellerId: string, payout: { id: string; amountTmt: string; note?: string | null }) {
    try {
      const recipient = await this.sellerRecipient(sellerId);
      if (!recipient) return;
      await this.sendTemplate("SELLER_PAYOUT", {
        toEmail: recipient.toEmail,
        userId: recipient.userId,
        locale: recipient.locale,
        variables: { seller: { name: recipient.name }, payout },
        idempotencyKey: `withdrawal:${payout.id}:SELLER_PAYOUT`,
      });
    } catch (err) {
      this.logger.error(`sendSellerPayout(${sellerId}) failed`, err instanceof Error ? err.stack : undefined);
    }
  }

  /**
   * Seller application-stage mail.
   *
   * Sent to the address on the *application*, not to a verified account address -- the applicant
   * has no account yet, and this is the only channel that reaches them before approval (Telegram
   * linking needs an approved Seller to issue a code). The address is self-submitted, so the
   * risk is a typo reaching a stranger; the copy therefore discloses nothing beyond the fact
   * that an application exists, and grants no access.
   */
  async sendSellerApplicationMail(
    kind: "SELLER_APPLICATION_RECEIVED" | "SELLER_APPROVED" | "SELLER_REJECTED",
    params: { email: string | null; name: string; shopName?: string; reason?: string | null },
  ) {
    try {
      if (!params.email) return;
      await this.sendTemplate(kind, {
        toEmail: params.email,
        variables: {
          seller: { name: params.name, shopName: params.shopName, reason: params.reason },
        },
      });
    } catch (err) {
      this.logger.error(`sendSellerApplicationMail(${kind}) failed`, err instanceof Error ? err.stack : undefined);
    }
  }

  /**
   * Operational alert to staff. Sent straight through the transporter, bypassing the queue,
   * the quota and the consent/suppression checks.
   *
   * Each of those exclusions is deliberate: an alert about an exhausted quota must not be the
   * thing the quota blocks, an alert about a stuck queue must not sit in that queue, and the
   * recipient is an operator address rather than a customer, so consent does not apply. Volume
   * is bounded by the dedup in EmailAlertService, not by these mechanisms.
   */
  async sendAlert(toEmail: string, subject: string, body: string): Promise<void> {
    if (!this.transporter) throw new Error("SMTP is not configured");
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: toEmail,
      subject,
      text: body,
      headers: {
        // Marks this as an automated report so a mail client can file it, and so a bounce or
        // vacation responder does not reply to it.
        "Auto-Submitted": "auto-generated",
        "X-Gulyaly-Alert": "1",
      },
    });
    this.logger.log(`alert sent to=${maskEmail(toEmail)} subject=${subject}`);
  }

  /** Sent immediately, not queued -- this is a manual, single, interactive admin action (the
   *  "send test email" button), not an operational flow that needs retry/rate-limit treatment. */
  async sendTest(toEmail: string) {
    const { subject, html } = testEmailTemplate();
    await this.sendNow({ kind: "TEST", toEmail, subject, html });
  }

  async sendMarketingBroadcast(subject: string, bodyText: string) {
    const settings = await this.getSettings();
    if (!settings.marketingEnabled) {
      throw new BadRequestException("Маркетинговые письма отключены в настройках");
    }
    // Only verified addresses, and never one on the suppression list: a broadcast is exactly the
    // kind of send where a stale or complained-about address does real reputational damage.
    const suppressed = await this.prisma.emailSuppression
      .findMany({ select: { email: true } })
      .catch(() => [] as { email: string }[]);
    const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

    // Explicit opt-in, from EmailPreference -- the single source of truth for marketing
    // consent. `User.marketingOptOut` is the legacy flag this replaced; it is still written on
    // unsubscribe so nothing that reads it goes stale, but it is no longer what decides.
    const candidates = await this.prisma.user.findMany({
      where: {
        email: { not: null },
        emailVerified: true,
        emailPreference: { is: { marketing: true, unsubscribedAt: null } },
      },
      select: { id: true, email: true },
    });
    const users = candidates.filter((u) => !suppressedSet.has((u.email as string).toLowerCase()));

    // Identifies this broadcast for the per-recipient job ids below. Content-derived rather than
    // random so an accidental double-submit of the same subject+body dedupes instead of sending
    // the newsletter twice.
    const broadcastId = createHmac("sha256", this.unsubscribeSecret)
      .update(`${subject}\n${bodyText}`)
      .digest("hex")
      .slice(0, 16);

    // One job per recipient, queued in bulk -- pacing/rate limiting is the worker's job (see
    // EmailProcessor's limiter), not something this loop needs to do with a manual delay anymore.
    // Also means a crash/restart mid-broadcast resumes from the queue instead of losing progress.
    await this.marketingQueue.addBulk(
      users.map((u) => {
        const unsubscribeUrl = this.unsubscribeUrl(u.id);
        const { subject: subj, html } = marketingTemplate(subject, bodyText, unsubscribeUrl);
        return {
          name: "send-email",
          data: {
            kind: "MARKETING" as EmailKind,
            toEmail: u.email as string,
            userId: u.id,
            subject: subj,
            html,
            from: this.fromAddressMarketing,
            transporterVariant: "marketing" as TransporterVariant,
            // RFC 8058 one-click unsubscribe: List-Unsubscribe-Post tells mail clients (Gmail
            // etc.) it's safe to POST to the URL directly with no confirmation page. mailto is
            // the fallback for clients that only support the older list-unsubscribe convention.
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${this.fromAddressMarketing.replace(/^.*<|>.*$/g, "")}?subject=unsubscribe>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          },
          // One job per (broadcast, recipient): re-running the same broadcast cannot mail the
          // same person twice, and a partially-enqueued broadcast can be safely re-issued.
          opts: { ...JOB_OPTIONS, jobId: `broadcast:${broadcastId}:${u.id}` },
        };
      }),
    );
    return { recipientCount: users.length };
  }

  /**
   * Operational snapshot for the admin dashboard and for alerting.
   *
   * Reports whether credentials are *present*, never what they are. `smtpReachable` performs a
   * real TLS+AUTH handshake via nodemailer's verify(), so a wrong password shows up here instead
   * of only surfacing when a customer fails to get an OTP.
   */
  async health() {
    const quota = await this.quota.usage();

    const queues = await Promise.all(
      (
        [
          ["critical", this.criticalQueue],
          ["transactional", this.transactionalQueue],
          ["marketing", this.marketingQueue],
        ] as const
      ).map(async ([name, queue]) => {
        try {
          const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
          return { name, ...counts };
        } catch {
          return { name, unavailable: true };
        }
      }),
    );

    let smtpReachable: boolean | null = null;
    let smtpError: string | null = null;
    if (this.transporter) {
      try {
        await this.transporter.verify();
        smtpReachable = true;
      } catch (err) {
        smtpReachable = false;
        smtpError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      smtpConfigured: !!this.transporter,
      smtpUserConfigured: !!this.config.get<string>("MAIL_USER"),
      smtpPasswordConfigured: !!this.config.get<string>("MAIL_PASS"),
      smtpHost: this.config.get<string>("MAIL_HOST") ?? null,
      smtpReachable,
      smtpError,
      from: this.fromAddress,
      replyTo: replyToAddress() ?? null,
      quota,
      queues,
    };
  }

  /** RFC 8058 one-click unsubscribe token: HMAC over the user id, domain-separated by prefix. */
  private unsubscribeToken(userId: string): string {
    return createHmac("sha256", this.unsubscribeSecret).update(`marketing-unsub:${userId}`).digest("hex");
  }

  private unsubscribeUrl(userId: string): string {
    const token = this.unsubscribeToken(userId);
    return `${this.apiPublicUrl}/api/marketing/unsubscribe?uid=${encodeURIComponent(userId)}&token=${token}`;
  }

  /** Verifies the token and marks the user opted out. Returns false (no throw) on a bad/forged token. */
  async unsubscribe(userId: string, token: string): Promise<boolean> {
    const expected = Buffer.from(this.unsubscribeToken(userId));
    const provided = Buffer.from(token || "");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      return false;
    }
    // Written together: EmailPreference is what the send path consults, and marketingOptOut is
    // kept in step so the two can never disagree while the legacy column still exists.
    await this.prisma
      .$transaction([
        this.prisma.emailPreference.upsert({
          where: { userId },
          create: {
            userId,
            marketing: false,
            unsubscribedAt: new Date(),
            unsubscribeReason: "one-click",
          },
          update: { marketing: false, unsubscribedAt: new Date(), unsubscribeReason: "one-click" },
        }),
        this.prisma.user.update({ where: { id: userId }, data: { marketingOptOut: true } }),
      ])
      .catch(() => null);
    return true;
  }
}
