import { z } from "zod";
import {
  CURRENCY_CODES,
  GALLERY_ORDER_STATUSES,
  HOME_SLIDE_LINK_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHOD_CODES,
  RECIPIENT_INPUT_TYPES,
  SOCIAL_PLATFORMS,
  STORY_LINK_TYPES,
  SUPPORT_SENDER_ROLES,
  SUPPORT_THREAD_STATUSES,
  USER_ROLES,
  type CurrencyCode,
  type GalleryOrderStatus,
  type OrderStatus,
  type SellerApplicationStatus,
  type SupportSenderRole,
  type SupportThreadStatus,
  type WithdrawalStatus,
} from "./enums.js";

export const serviceSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  logoUrl: z.string().nullable(),
  inputType: z.enum(RECIPIENT_INPUT_TYPES),
  validationRegex: z.string().nullable(),
  minAmountTmt: z.number(),
  maxAmountTmt: z.number(),
  isEnabled: z.boolean(),
});
export type ServiceDto = z.infer<typeof serviceSchema>;

export const rateSchema = z.object({
  serviceId: z.string(),
  currency: z.enum(CURRENCY_CODES),
  rate: z.number(),
  enabled: z.boolean(),
  /** ISO time of the last edit -- rates are typed in by hand, so their age matters (E-06). */
  updatedAt: z.string().optional(),
});
export type RateDto = z.infer<typeof rateSchema>;

export const paymentMethodSchema = z.object({
  id: z.string(),
  code: z.enum(PAYMENT_METHOD_CODES),
  name: z.string(),
  provider: z.string(),
  feePercent: z.number(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int(),
});
export type PaymentMethodDto = z.infer<typeof paymentMethodSchema>;

/** Admin view: also whether the method's adapter is registered (configured) on the API. */
export type AdminPaymentMethodDto = PaymentMethodDto & { providerConfigured: boolean };

/** An acquiring adapter the API build has, and whether its keys are present on the answering node. */
export interface PaymentProviderInfoDto {
  key: string;
  label: string;
  configured: boolean;
}

/** Admin edit of a payment method: any subset. */
export interface AdminPaymentMethodPatch {
  isEnabled?: boolean;
  name?: string;
  provider?: string;
  feePercent?: number;
  sortOrder?: number;
}

export interface AdminPaymentMethodCreate {
  code: PaymentMethodDto["code"];
  name: string;
  provider: string;
  feePercent?: number;
  sortOrder?: number;
}

export const createOrderSchema = z.object({
  serviceId: z.string(),
  paymentMethodId: z.string(),
  recipientIdentifier: z.string().min(3).max(64),
  amountTmt: z.number().positive(),
  currency: z.enum(CURRENCY_CODES),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderSchema = z.object({
  id: z.string(),
  serviceId: z.string(),
  paymentMethodId: z.string(),
  recipientIdentifier: z.string(),
  amountTmt: z.number(),
  currency: z.enum(CURRENCY_CODES),
  rateApplied: z.number(),
  amountCharged: z.number(),
  feeAmount: z.number(),
  status: z.enum(ORDER_STATUSES),
  createdAt: z.string(),
});
export type OrderDto = z.infer<typeof orderSchema>;

export const localeSchema = z.enum(["ru", "en", "tkm"]);
export type LocaleInput = z.infer<typeof localeSchema>;

// Accounts are created and signed into by email (since 2026-10-02). Sign-up is two calls:
// `register` mails a 6-digit code, `confirmRegistration` checks it and returns the session.
// A phone is optional and is added later in the profile.
export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(120).optional(),
  referredByUsername: z.string().min(2).max(32).optional(),
  // Attribution captured client-side when the /r/<code> link was opened. All optional -- a
  // direct signup with a typed-in code legitimately has none of these.
  utmSource: z.string().min(1).max(100).optional(),
  utmMedium: z.string().min(1).max(100).optional(),
  utmCampaign: z.string().min(1).max(100).optional(),
  referrerUrl: z.string().min(1).max(300).optional(),
  locale: localeSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const confirmRegistrationSchema = z.object({
  email: z.string().email().max(254),
  code: z.string().regex(/^\d{6}$/),
});
export type ConfirmRegistrationInput = z.infer<typeof confirmRegistrationSchema>;

/** What `register` answers: no session yet, just where the code went and how long it lives. */
export interface RegistrationStartedDto {
  email: string;
  expiresInMinutes: number;
}

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    fullName: z.string().nullable(),
    username: z.string(),
    role: z.string(),
    avatarUrl: z.string().nullable(),
    locale: z.string(),
    country: z.string().nullable().optional(),
    // Only on /auth/me and its PATCH responses:
    emailVerified: z.boolean().optional(),
    /** When the one-off bonus for adding a phone was credited; null while not earned yet. */
    phoneBonusAt: z.string().nullable().optional(),
    /** Size of that bonus, in TMT, so clients can advertise it without hard-coding it. */
    phoneBonusTmt: z.number().optional(),
  }),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type SessionDto = z.infer<typeof sessionSchema>;

// ---- Email verification ----

export const emailStatusSchema = z.object({
  email: z.string().nullable(),
  emailVerified: z.boolean(),
  emailVerifiedAt: z.string().nullable(),
  /** Address awaiting confirmation, if a code is currently outstanding. */
  pendingEmail: z.string().nullable(),
  pendingExpiresAt: z.string().nullable(),
});
export type EmailStatusDto = z.infer<typeof emailStatusSchema>;

export const requestEmailVerificationSchema = z.object({
  email: z.string().email().max(254),
});
export type RequestEmailVerificationInput = z.infer<
  typeof requestEmailVerificationSchema
>;

export const confirmEmailVerificationSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export type ConfirmEmailVerificationInput = z.infer<
  typeof confirmEmailVerificationSchema
>;

// ---- Admin: catalog management ----

export const adminServiceInputSchema = z
  .object({
    code: z.string().min(2).max(32),
    name: z.string().min(1).max(120),
    description: z.string().optional(),
    logoUrl: z.string().optional(),
    inputType: z.enum(RECIPIENT_INPUT_TYPES),
    validationRegex: z.string().optional(),
    minAmountTmt: z.number().min(0),
    maxAmountTmt: z.number().min(0),
    isEnabled: z.boolean().optional(),
  })
  .refine((data) => data.minAmountTmt <= data.maxAmountTmt, {
    message: "minAmountTmt must be <= maxAmountTmt",
    path: ["maxAmountTmt"],
  });
export type AdminServiceInput = z.infer<typeof adminServiceInputSchema>;

export const upsertRateInputSchema = z.object({
  currency: z.enum(CURRENCY_CODES),
  rate: z.number().min(0),
  enabled: z.boolean().optional(),
  manualMode: z.boolean().optional(),
});
export type UpsertRateInput = z.infer<typeof upsertRateInputSchema>;

// ---- Admin: orders ----

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().max(500).optional(),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export interface PaymentDto {
  id: string;
  provider: string;
  providerTransactionId: string | null;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

export type PaymentStatus =
  "INITIATING" | "PENDING" | "SUCCEEDED" | "DECLINED" | "UNKNOWN" | "CANCELLED";

export interface PaymentInitiationDto {
  paymentId: string;
  providerRef: string | null;
  redirectUrl: string | null;
  status: PaymentStatus;
}

export interface PaymentReconciliationDto {
  paymentId: string;
  orderId: string;
  provider: string;
  status: PaymentStatus;
  action:
    | "LOOKUP_AVAILABLE"
    | "LOOKED_UP"
    | "MANUAL_REVIEW"
    | "SETTLED"
    | "SUCCEEDED_REQUIRES_REFUND"
    | "LOOKUP_FAILED"
    | "PAYMENT_DETAILS_MISMATCH"
    | "IGNORED_TERMINAL_PAYMENT"
    | "PROVIDER_UNAVAILABLE";
  updatedAt: string;
}

export interface TopupJobDto {
  id: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  confirmedAt: string | null;
}

export interface OrderDetailDto extends OrderDto {
  service?: ServiceDto;
  paymentMethod?: PaymentMethodDto;
  user?: { id: string; phone: string | null; email?: string | null; fullName: string | null } | null;
  apiKey?: { id: string; name: string; ownerLabel: string } | null;
  payments?: PaymentDto[];
  topupJob?: TopupJobDto | null;
  failureReason?: string | null;
  deliveryNote?: string | null;
}

// ---- Admin: staff / users ----

export const staffUserSchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  fullName: z.string().nullable(),
  /** Doubles as the referral code: a number issued in sequence, or a custom one set by staff. */
  username: z.string(),
  role: z.enum(USER_ROLES),
  isBlocked: z.boolean(),
  createdAt: z.string(),
  avatarUrl: z.string().nullable(),
});
export type StaffUserDto = z.infer<typeof staffUserSchema>;

export const createStaffUserSchema = z.object({
  /** Staff sign in with this address. */
  email: z.string().email().max(254),
  phone: z.string().min(6).max(20).optional(),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(120).optional(),
  role: z.enum(USER_ROLES),
});
export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>;

export const updateUserSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  isBlocked: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// ---- Admin: stats ----

export interface AdminStatsDto {
  uptimeSeconds: number;
  nodeVersion: string;
  totals: {
    orders: number;
    services: number;
    staff: number;
    customers: number;
    apiKeys: number;
  };
  ordersByStatus: Record<string, number>;
  queue: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

export interface OrdersTimeseriesPoint {
  date: string;
  orderCount: number;
  volumeTmt: number;
  completedCount: number;
}

/** One window of the dashboard's period comparison. */
export interface AdminPeriodTotals {
  orders: number;
  completedOrders: number;
  volumeTmt: number;
  newCustomers: number;
}

/**
 * The last `days` days against the `days` days before them, for the dashboard's trend badges.
 * Both windows end "now" on the server clock, so the two are always the same length.
 */
export interface AdminPeriodComparisonDto {
  days: number;
  current: AdminPeriodTotals;
  previous: AdminPeriodTotals;
}

/**
 * API usage, as counted by the request interceptor.
 *
 * `tier` is the trust boundary the call came through: public (no auth), customer (JWT),
 * staff (JWT + role) or partner (X-Api-Key). `endpoint` is a route *template* -- "GET /orders/:id"
 * -- never a resolved path, so ids and phone numbers never reach the counters.
 */
export interface ApiUsageDto {
  days: string[];
  totals: {
    total: number;
    ok: number;
    clientError: number;
    serverError: number;
  };
  byDay: {
    day: string;
    total: number;
    clientError: number;
    serverError: number;
  }[];
  byTier: {
    tier: string;
    total: number;
    clientError: number;
    serverError: number;
  }[];
  endpoints: {
    endpoint: string;
    total: number;
    clientError: number;
    serverError: number;
    /** null when no latency samples exist for the window -- not zero, which would read "instant". */
    avgMs: number | null;
  }[];
  byApiKey: {
    apiKeyId: string;
    total: number;
    clientError: number;
    serverError: number;
    name: string | null;
    ownerLabel: string | null;
    /** Which surface the traffic hit. A key that no longer exists reads as a partner. */
    kind: "shop" | "partner";
    /** The shop a seller key acts for. Null for a partner key. */
    shop: { id: string; handle: string; shopName: string } | null;
  }[];
}

export interface DatabaseTableStatDto {
  table: string;
  count: number;
  managePath: string | null;
}

// ---- Admin: economics (gross revenue/cost per stream). Top-up margin exists only for orders
// with a cost snapshot (docs/analysis/UNIT_ECONOMICS.md finding E-01); field names always say
// what they are. ----

/** One Service × currency slice of top-up volume in the window. */
export interface AdminEconomicsTopupStreamDto {
  serviceCode: string;
  currency: CurrencyCode;
  count: number;
  /** SUM(Order.amountTmt) -- gross manat volume topped up, not what the customer paid in their currency. */
  gmvTmt: number;
  /** SUM(Order.feeAmount) -- fees collected, before any payment-processing or supplier cost. */
  feesTmt: number;
  avgAmountTmt: number;
  /** Orders in this slice that carry a cost snapshot (OrderCost) -- only orders created after
   *  the service's cost was set in the admin. */
  costedCount: number;
  /** SUM(Order.amountTmt) over just those costed orders, so a margin is never computed against
   *  volume that has no known cost. */
  costedGmvTmt: number;
  /** SUM(OrderCost.costTmt) -- what those orders cost the platform at face value. */
  costTmt: number;
}

/** Admin-only cost basis of one Service (E-01). Never part of any public catalog response. */
export interface ServiceCostDto {
  serviceId: string;
  code: string;
  name: string;
  /** Percent of the face value the platform pays the supplier; null when not set. */
  costPercent: number | null;
  updatedAt: string | null;
}

export interface AdminEconomicsDto {
  days: number;
  topups: AdminEconomicsTopupStreamDto[];
  gallery: {
    /** SUM(GalleryOrder.amountTmt) for orders delivered in the window -- the full sale price,
     *  unaffected by any take rate (the seller-credit ledger records the split separately). */
    grossSalesTmt: number;
    /** Story/slide ad debits in the window, as positive revenue. */
    adRevenueTmt: number;
    /** MARKETPLACE_PLATFORM_FEE ledger debits in the window, as positive revenue. Always 0 while
     *  MarketplaceSettings.takeRatePercent has never been set above 0%. */
    platformFeeTmt: number;
  };
  marketplacePurchases: {
    count: number;
    serviceFeesTmt: number;
    shippingTmt: number;
  };
  cargo: {
    count: number;
    /** SUM of the shipment's snapshotted total price for shipments paid in the window. */
    tariffRevenueTmt: number;
  };
  referralCost: {
    count: number;
    /** Money paid out, not saved -- a cost, never shown as a negative revenue number. */
    costTmt: number;
  };
  sellerFloat: {
    /** SUM(Seller.balanceTmt) -- a point-in-time liability, not windowed by `days`. */
    owedTmt: number;
  };
}

// ---- Admin: order editing ----

export const updateOrderDetailsSchema = z.object({
  recipientIdentifier: z.string().min(3).max(64).optional(),
  amountTmt: z.number().positive().optional(),
});
export type UpdateOrderDetailsInput = z.infer<typeof updateOrderDetailsSchema>;

// ---- Self profile ----

export const updateMeSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(6).max(20).optional(),
  locale: localeSchema.optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const updateLocaleSchema = z.object({
  locale: localeSchema,
});
export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;

// ---- Admin: API keys ----

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  ownerLabel: z.string().min(1).max(120),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export interface ApiKeyDto {
  id: string;
  name: string;
  ownerLabel: string;
  keyPrefix: string;
  isEnabled: boolean;
  /** Requests per minute for this key. null means the partner tier default, never "unlimited". */
  rateLimitPerMin: number | null;
  /** catalog:read | orders:read | orders:write. An empty list reaches nothing. */
  scopes: string[];
  /** null means it never expires. */
  expiresAt: string | null;
  /** While set and in the future, the previous secret is still accepted. */
  previousKeyExpiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string | null; phone: string | null; email?: string | null };
}

export interface CreateApiKeyResult extends ApiKeyDto {
  rawKey: string;
}

// ---- Seller: API keys ----

export const shopApiKeyScopes = [
  "products:read",
  "products:write",
  "shop-orders:read",
  "shop-orders:write",
  "chat:read",
  "chat:write",
] as const;
export type ShopApiKeyScope = (typeof shopApiKeyScopes)[number];

export const createSellerApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.enum(shopApiKeyScopes)).min(1).optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateSellerApiKeyInput = z.infer<typeof createSellerApiKeySchema>;

export interface SellerApiKeyDto extends ApiKeyDto {
  sellerId: string;
}

export interface CreateSellerApiKeyResult extends SellerApiKeyDto {
  rawKey: string;
}

// ---- Order tracking (public) ----

export const trackOrderInputSchema = z.object({
  orderId: z.string().min(1),
  recipientIdentifier: z.string().min(1),
});
export type TrackOrderInput = z.infer<typeof trackOrderInputSchema>;

export interface TrackedOrderDto {
  id: string;
  status: OrderStatus;
  serviceName: string;
  amountTmt: number;
  currency: CurrencyCode;
  amountCharged: number;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
}

// ---- Support chat ----

export const sendSupportMessageSchema = z.object({
  // min(0): a message may be nothing but its attachment. The API refuses a body that is blank
  // with nothing attached.
  body: z.string().min(0).max(2000),
  attachment: z
    .object({
      url: z.string().min(1).max(2000),
      name: z.string().min(1).max(120),
      mimeType: z.string().min(1).max(120),
      size: z.number().int().min(1),
    })
    .optional(),
});
export type SendSupportMessageInput = z.infer<typeof sendSupportMessageSchema>;

export interface SupportMessageDto {
  id: string;
  threadId: string;
  senderRole: SupportSenderRole;
  authorId: string | null;
  /** Empty when the message is nothing but its attachment. */
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  createdAt: string;
}

export interface SupportThreadDto {
  id: string;
  sellerId: string | null;
  status: SupportThreadStatus;
  lastMessageAt: string;
  createdAt: string;
  user: { id: string; phone: string | null; email?: string | null; fullName: string | null };
}

export interface SupportThreadWithUnreadDto extends SupportThreadDto {
  unreadCount: number;
}

export interface SupportThreadWithMessagesDto {
  thread: SupportThreadDto;
  messages: SupportMessageDto[];
  /** True when the read was given `after` and `messages` holds only what came later: append. */
  incremental?: boolean;
}

export const updateThreadStatusSchema = z.object({
  status: z.enum(SUPPORT_THREAD_STATUSES),
});
export type UpdateThreadStatusInput = z.infer<typeof updateThreadStatusSchema>;

// ---- Admin: customers ----

export interface CustomerDto extends StaffUserDto {
  _count: { orders: number };
}

export interface CustomerStatsDto {
  total: number;
  blocked: number;
  newLast7Days: number;
  newLast30Days: number;
}

export interface CustomerOrderRowDto extends OrderDto {
  service: { name: string };
}

export interface CustomerDetailDto {
  user: StaffUserDto;
  orders: CustomerOrderRowDto[];
  /** Aggregate device presence only. Tokens must never leave the API. */
  devices: {
    count: number;
    /** Last time a registered app device contacted the API, not a real-time online status. */
    lastAppSeenAt: string | null;
    android: number;
    ios: number;
  };
}

// ---- Order delivery note ----

export const setDeliveryNoteSchema = z.object({
  deliveryNote: z.string().max(2000),
});
export type SetDeliveryNoteInput = z.infer<typeof setDeliveryNoteSchema>;

// ---- Documents (user uploads) ----

export const documentSchema = z.object({
  id: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  createdAt: z.string(),
});
export type DocumentDto = z.infer<typeof documentSchema>;
