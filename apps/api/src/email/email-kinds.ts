import type { EmailCategory, EmailKind } from "@prisma/client";

/**
 * Locales an email template can exist in. Deliberately re-declared here rather than imported
 * from `@topup-hub/i18n` -- that package is the React-side dictionary bundle (it carries a React
 * peer dependency); the API only needs the tag set, which `@topup-hub/types`' localeSchema
 * pins to the same three values.
 */
export const EMAIL_LOCALES = ["ru", "en", "tkm"] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/**
 * Used when a user has no locale, or their locale has no template for the kind being sent.
 * Configurable rather than hardcoded at each call site (EMAIL_DEFAULT_LOCALE env var).
 */
export function defaultEmailLocale(): EmailLocale {
  const configured = process.env.EMAIL_DEFAULT_LOCALE;
  return isEmailLocale(configured) ? configured : "ru";
}

export function isEmailLocale(value: string | undefined | null): value is EmailLocale {
  return !!value && (EMAIL_LOCALES as readonly string[]).includes(value);
}

/**
 * How a queued job is prioritised. OTP and security mail must never sit behind a marketing
 * broadcast, so each maps to a differently-weighted lane on the shared email queue.
 */
export type EmailPriority = "critical" | "transactional" | "marketing";

export interface EmailKindSpec {
  category: EmailCategory;
  priority: EmailPriority;
  /** Mailbox this kind sends as -- the local part, at gulyaly.pro. */
  sender: "noreply" | "orders" | "seller" | "info" | "news";
  /**
   * Whether the recipient must have opted in. Security and transactional mail is sent
   * regardless of marketing preferences -- someone who unsubscribed from a newsletter still
   * needs the password reset they just requested.
   */
  requiresOptIn: boolean;
  /**
   * Whether an address on the suppression list blocks this kind. Mirrors requiresOptIn in
   * practice, but kept separate: a hard bounce is a deliverability fact, an opt-out is a
   * consent fact, and they are allowed to diverge later.
   */
  respectsSuppression: boolean;
  /** Variables a template of this kind may reference; render fails if one is missing. */
  variables: readonly string[];
}

const ORDER_VARIABLES = [
  "order.id",
  "order.serviceName",
  "order.recipientIdentifier",
  "order.amountTmt",
  "order.amountCharged",
  "order.currency",
] as const;

const CARGO_VARIABLES = [
  "shipment.trackingNumber",
  "shipment.originCity",
  "shipment.destinationCity",
  "shipment.recipientName",
  "shipment.totalPriceTmt",
] as const;

/**
 * The single source of truth mapping every EmailKind to its category, sender identity, queue
 * priority and consent rules. Adding a kind to the Prisma enum without adding it here is a
 * compile error -- the Record is exhaustive on purpose.
 */
export const EMAIL_KINDS: Record<EmailKind, EmailKindSpec> = {
  // ---- Authentication: highest priority, never gated on consent
  AUTH_OTP: {
    category: "AUTHENTICATION",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "otp.code", "otp.expiresIn"],
  },
  AUTH_EMAIL_VERIFICATION: {
    category: "AUTHENTICATION",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "otp.code", "otp.expiresIn"],
  },
  AUTH_PASSWORD_RESET: {
    category: "AUTHENTICATION",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "otp.code", "otp.expiresIn"],
  },
  AUTH_LOGIN_ALERT: {
    category: "SECURITY",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "event.at", "event.ip"],
  },
  AUTH_NEW_DEVICE: {
    category: "SECURITY",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "event.at", "event.ip"],
  },
  AUTH_EMAIL_CHANGED: {
    category: "SECURITY",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "event.at"],
  },

  // ---- Account
  ACCOUNT_CREATED: {
    category: "ACCOUNT",
    priority: "transactional",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["user.firstName"],
  },
  ACCOUNT_PASSWORD_CHANGED: {
    category: "SECURITY",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName", "event.at"],
  },
  ACCOUNT_DELETED: {
    category: "ACCOUNT",
    priority: "transactional",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["user.firstName"],
  },

  // ---- Orders
  ORDER_CREATED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ORDER_VARIABLES,
  },
  ORDER_COMPLETED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: [...ORDER_VARIABLES, "order.deliveryNote"],
  },
  ORDER_FAILED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: [...ORDER_VARIABLES, "order.failureReason"],
  },
  ORDER_PAID: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ORDER_VARIABLES,
  },
  ORDER_CANCELLED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ORDER_VARIABLES,
  },
  ORDER_REFUNDED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ORDER_VARIABLES,
  },

  // ---- Cargo
  CARGO_SHIPMENT_CREATED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: CARGO_VARIABLES,
  },
  CARGO_SHIPMENT_DELIVERED: {
    category: "ORDER",
    priority: "transactional",
    sender: "orders",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: CARGO_VARIABLES,
  },

  // ---- Seller
  SELLER_APPLICATION_RECEIVED: {
    category: "SELLER",
    priority: "transactional",
    sender: "seller",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["seller.name"],
  },
  SELLER_APPROVED: {
    category: "SELLER",
    priority: "transactional",
    sender: "seller",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["seller.name", "seller.shopName"],
  },
  SELLER_REJECTED: {
    category: "SELLER",
    priority: "transactional",
    sender: "seller",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["seller.name", "seller.reason"],
  },
  SELLER_NEW_ORDER: {
    category: "SELLER",
    priority: "transactional",
    sender: "seller",
    requiresOptIn: false,
    respectsSuppression: true,
    // A seller reading this on a phone needs to know what to prepare and where it goes -- an
    // order id alone would send them to the panel for every single order.
    variables: [
      "seller.name",
      "order.id",
      "order.productName",
      "order.amountTmt",
      "order.recipientName",
      "order.recipientPhone",
      "order.deliveryCity",
      "order.deliveryAddress",
      "order.cardMessage",
    ],
  },
  SELLER_ORDER_CANCELLED: {
    category: "SELLER",
    priority: "transactional",
    sender: "seller",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["seller.name", "order.id", "order.productName", "order.amountTmt"],
  },
  SELLER_PAYOUT: {
    category: "SELLER",
    priority: "transactional",
    sender: "seller",
    requiresOptIn: false,
    respectsSuppression: true,
    // The note is where an admin explains a partial or delayed payment, so it has to reach the
    // seller rather than living only in the admin panel.
    variables: ["seller.name", "payout.amountTmt", "payout.note"],
  },

  // ---- System
  SYSTEM_MAINTENANCE: {
    category: "SYSTEM",
    priority: "transactional",
    sender: "info",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["message.body"],
  },
  SYSTEM_SECURITY_ALERT: {
    category: "SECURITY",
    priority: "critical",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: ["message.body"],
  },
  SYSTEM_IMPORTANT_NOTICE: {
    category: "SYSTEM",
    priority: "transactional",
    sender: "info",
    requiresOptIn: false,
    respectsSuppression: true,
    variables: ["message.body"],
  },

  // ---- Marketing: opt-in only, lowest priority, suppression always respected
  MARKETING: {
    category: "MARKETING",
    priority: "marketing",
    sender: "news",
    requiresOptIn: true,
    respectsSuppression: true,
    variables: ["message.body", "unsubscribeUrl"],
  },
  MARKETING_NEWSLETTER: {
    category: "MARKETING",
    priority: "marketing",
    sender: "news",
    requiresOptIn: true,
    respectsSuppression: true,
    variables: ["message.body", "unsubscribeUrl"],
  },
  MARKETING_PROMOTION: {
    category: "MARKETING",
    priority: "marketing",
    sender: "news",
    requiresOptIn: true,
    respectsSuppression: true,
    variables: ["message.body", "unsubscribeUrl"],
  },
  MARKETING_NEW_FEATURE: {
    category: "MARKETING",
    priority: "marketing",
    sender: "news",
    requiresOptIn: true,
    respectsSuppression: true,
    variables: ["message.body", "unsubscribeUrl"],
  },
  MARKETING_PARTNER_OFFER: {
    category: "MARKETING",
    priority: "marketing",
    sender: "news",
    requiresOptIn: true,
    respectsSuppression: true,
    variables: ["message.body", "unsubscribeUrl"],
  },

  // ---- Meta: the admin panel's "does SMTP work" probe. Tagged so it can be excluded from
  // production deliverability statistics.
  TEST: {
    category: "SYSTEM",
    priority: "transactional",
    sender: "noreply",
    requiresOptIn: false,
    respectsSuppression: false,
    variables: [],
  },
};

/**
 * Builds the From header for a kind. Every identity lives on the one REG.RU mailbox domain --
 * these are separate sender addresses, not separate SMTP servers.
 * `MAIL_FROM_MARKETING` still overrides the marketing identity, since that one currently sends
 * through a different relay entirely.
 */
export function senderAddress(kind: EmailKind): string {
  const spec = EMAIL_KINDS[kind];
  const domain = process.env.MAIL_SENDER_DOMAIN || "gulyaly.pro";
  if (spec.sender === "news" && process.env.MAIL_FROM_MARKETING) {
    return process.env.MAIL_FROM_MARKETING;
  }
  const label = spec.sender === "seller" ? "Gulyaly Sellers" : "Gulyaly";
  return `${label} <${spec.sender}@${domain}>`;
}

/** Support address offered for replies, since the sending mailboxes are unattended. */
export function replyToAddress(): string | undefined {
  return process.env.MAIL_REPLY_TO || undefined;
}
