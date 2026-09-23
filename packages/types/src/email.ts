import { z } from "zod";

// ---- Mail ----

export const EMAIL_KINDS = ["ORDER_CREATED", "ORDER_COMPLETED", "ORDER_FAILED", "MARKETING", "TEST"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const EMAIL_STATUSES = ["SENT", "SKIPPED", "FAILED"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export interface EmailSettingsDto {
  id: string;
  transactionalEnabled: boolean;
  marketingEnabled: boolean;
  updatedAt: string;
}

export const updateEmailSettingsSchema = z.object({
  transactionalEnabled: z.boolean().optional(),
  marketingEnabled: z.boolean().optional(),
});
export type UpdateEmailSettingsInput = z.infer<typeof updateEmailSettingsSchema>;

export interface EmailLogDto {
  id: string;
  kind: EmailKind;
  toEmail: string;
  subject: string;
  status: EmailStatus;
  error: string | null;
  userId: string | null;
  user: { id: string; phone: string; fullName: string | null } | null;
  createdAt: string;
}

export const sendTestEmailSchema = z.object({
  toEmail: z.string().email(),
});
export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;

export const sendMarketingEmailSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});
export type SendMarketingEmailInput = z.infer<typeof sendMarketingEmailSchema>;

export interface SendMarketingEmailResult {
  recipientCount: number;
}

// ---- Admin: email templates ----

export const emailTemplateStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type EmailTemplateStatusDto = z.infer<typeof emailTemplateStatusSchema>;

export const emailTemplateSchema = z.object({
  id: z.string(),
  kind: z.string(),
  locale: z.string(),
  version: z.number(),
  status: emailTemplateStatusSchema,
  subject: z.string(),
  preheader: z.string().nullable(),
  html: z.string(),
  text: z.string(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmailTemplateDto = z.infer<typeof emailTemplateSchema>;

/** What a kind allows a template to reference, plus how it is routed. */
export const emailKindSpecSchema = z.object({
  kind: z.string(),
  category: z.string(),
  priority: z.string(),
  sender: z.string(),
  requiresOptIn: z.boolean(),
  respectsSuppression: z.boolean(),
  variables: z.array(z.string()),
});
export type EmailKindSpecDto = z.infer<typeof emailKindSpecSchema>;

export const emailTemplatePreviewSchema = z.object({
  subject: z.string(),
  html: z.string(),
  text: z.string(),
});
export type EmailTemplatePreviewDto = z.infer<typeof emailTemplatePreviewSchema>;

export const saveEmailTemplateSchema = z.object({
  kind: z.string(),
  locale: z.string(),
  subject: z.string().min(1).max(300),
  preheader: z.string().max(300).optional(),
  html: z.string().min(1),
  text: z.string().min(1),
});
export type SaveEmailTemplateInput = z.infer<typeof saveEmailTemplateSchema>;

// ---- Email preferences & operational lists ----

export const emailPreferenceSchema = z.object({
  marketing: z.boolean(),
  productUpdates: z.boolean(),
  partnerOffers: z.boolean(),
  unsubscribedAt: z.string().nullable().optional(),
});
export type EmailPreferenceDto = z.infer<typeof emailPreferenceSchema>;

export const emailSuppressionSchema = z.object({
  id: z.string(),
  email: z.string(),
  reason: z.enum(["HARD_BOUNCE", "COMPLAINT", "UNSUBSCRIBED", "INVALID", "MANUAL"]),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type EmailSuppressionDto = z.infer<typeof emailSuppressionSchema>;

export const emailOutboxRowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  orderId: z.string().nullable(),
  status: z.string(),
  attempts: z.number(),
  lastError: z.string().nullable(),
  createdAt: z.string(),
});
export type EmailOutboxRowDto = z.infer<typeof emailOutboxRowSchema>;

export const emailHealthSchema = z.object({
  smtpConfigured: z.boolean(),
  smtpReachable: z.boolean().nullable(),
  smtpError: z.string().nullable(),
  smtpHost: z.string().nullable(),
  from: z.string(),
  replyTo: z.string().nullable(),
  quota: z.object({
    used: z.number(),
    limit: z.number(),
    remaining: z.number(),
    usedPercent: z.number(),
    resetsAt: z.string(),
  }),
  queues: z.array(z.record(z.string(), z.unknown())),
});
export type EmailHealthDto = z.infer<typeof emailHealthSchema>;

