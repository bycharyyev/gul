export const CURRENCY_CODES = ["USD", "RUB", "EUR", "TRY", "CNY", "KZT"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export const RECIPIENT_INPUT_TYPES = ["PHONE", "ACCOUNT_ID"] as const;
export type RecipientInputType = (typeof RECIPIENT_INPUT_TYPES)[number];

export const PAYMENT_METHOD_CODES = ["CARD", "SBP", "MIR", "CRYPTO", "MANUAL"] as const;
export type PaymentMethodCode = (typeof PAYMENT_METHOD_CODES)[number];

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "REFUNDED",
  "CANCELLED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TOPUP_JOB_STATUSES = ["QUEUED", "SENT", "CONFIRMED", "FAILED"] as const;
export type TopupJobStatus = (typeof TOPUP_JOB_STATUSES)[number];

export const USER_ROLES = ["CUSTOMER", "SELLER", "SUPPORT", "MANAGER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STORY_LINK_TYPES = [
  "INTERNAL_SERVICE",
  "EXTERNAL_URL",
  "PARTNER_AD",
  "GALLERY_PRODUCT",
  "SELLER_SHOP",
] as const;
export type StoryLinkType = (typeof STORY_LINK_TYPES)[number];

export const HOME_SLIDE_LINK_TYPES = [
  "INTERNAL_SERVICE",
  "EXTERNAL_URL",
  "GALLERY_PRODUCT",
  "SELLER_SHOP",
  "NONE",
] as const;
export type HomeSlideLinkType = (typeof HOME_SLIDE_LINK_TYPES)[number];

export const SOCIAL_PLATFORMS = [
  "INSTAGRAM",
  "TELEGRAM",
  "FACEBOOK",
  "TIKTOK",
  "YOUTUBE",
  "WHATSAPP",
  "X",
  "VK",
  "OTHER",
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SUPPORT_THREAD_STATUSES = ["OPEN", "CLOSED"] as const;
export type SupportThreadStatus = (typeof SUPPORT_THREAD_STATUSES)[number];

export const SUPPORT_SENDER_ROLES = ["CUSTOMER", "STAFF", "SELLER"] as const;
export type SupportSenderRole = (typeof SUPPORT_SENDER_ROLES)[number];

export const GALLERY_ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING", "DELIVERED", "CANCELLED"] as const;
export type GalleryOrderStatus = (typeof GALLERY_ORDER_STATUSES)[number];

export const SELLER_APPLICATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type SellerApplicationStatus = (typeof SELLER_APPLICATION_STATUSES)[number];

export const WITHDRAWAL_STATUSES = ["PENDING", "PAID", "REJECTED"] as const;
export type WithdrawalStatus = (typeof WITHDRAWAL_STATUSES)[number];
