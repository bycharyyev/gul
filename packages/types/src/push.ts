export const PUSH_CATEGORIES = ["orders", "gallery", "cargo", "support", "chat", "feed"] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];

/** Wording of a push in three languages; Russian is required and is the fallback. */
export interface PushContentInput {
  category: PushCategory;
  titleRu: string;
  bodyRu: string;
  titleEn?: string | null;
  bodyEn?: string | null;
  titleTkm?: string | null;
  bodyTkm?: string | null;
  imageUrl?: string | null;
  route?: string;
}

export interface PushTemplateDto {
  id: string;
  name: string;
  category: PushCategory;
  titleRu: string;
  bodyRu: string;
  titleEn: string | null;
  bodyEn: string | null;
  titleTkm: string | null;
  bodyTkm: string | null;
  imageUrl: string | null;
  route: string;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreatePushTemplateInput = PushContentInput & { name: string };
export type UpdatePushTemplateInput = Partial<PushContentInput> & { name?: string; isEnabled?: boolean };

/**
 * Who receives a campaign: everyone with the app (ALL), a country/language/role filter (FILTER; a
 * missing list means "any"), or exactly the listed accounts (USERS).
 */
export interface PushAudience {
  type: "ALL" | "FILTER" | "USERS";
  countries?: string[];
  locales?: string[];
  roles?: string[];
  userIds?: string[];
  /** Only these kinds of phone; missing means all. */
  platforms?: PushPlatformKind[];
}

export type PushPlatformKind = "ANDROID" | "IOS";
export type PushRepeat = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
export type PushPriority = "high" | "normal";

export interface PushAudiencePreviewDto {
  users: number;
  devices: number;
  withoutApp: number;
}

export type PushCampaignStatus = "DRAFT" | "SCHEDULED" | "SENDING" | "SENT" | "CANCELLED" | "FAILED";

/**
 * sent       pushes addressed to a person who has the app
 * delivered  accepted by the push service for at least one of their devices
 * failed     sent but accepted for none
 * opened     the person tapped it
 * ignored    delivered and never tapped ("not opened": Android does not report a swipe-away)
 * openRate   opened / delivered, in percent
 */
export interface PushStatsDto {
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  ignored: number;
  openRate: number;
}

export interface PushCountryStatsDto extends PushStatsDto {
  country: string;
}

export interface PushCampaignDto {
  id: string;
  name: string;
  category: PushCategory;
  templateId: string | null;
  titleRu: string;
  bodyRu: string;
  titleEn: string | null;
  bodyEn: string | null;
  titleTkm: string | null;
  bodyTkm: string | null;
  imageUrl: string | null;
  route: string;
  audience: PushAudience;
  status: PushCampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recipientCount: number;
  lastError: string | null;
  createdAt: string;
  priority: PushPriority;
  ttlHours: number;
  repeat: PushRepeat;
  repeatUntil: string | null;
  seriesId: string | null;
  stats?: PushStatsDto;
}

export interface PushCampaignDetailDto extends PushCampaignDto {
  stats: PushStatsDto;
  byCountry: PushCountryStatsDto[];
}

export interface CreatePushCampaignInput {
  name: string;
  templateId?: string;
  content?: PushContentInput;
  audience: PushAudience;
  /** ISO time in the future to schedule; omit to keep a draft. */
  scheduledAt?: string;
  /** Send immediately. */
  sendNow?: boolean;
  priority?: PushPriority;
  /** Hours the push service keeps trying an offline phone (1..672). */
  ttlHours?: number;
  /** Repeat a scheduled campaign; needs scheduledAt. */
  repeat?: PushRepeat;
  repeatUntil?: string;
}

export interface PushUserHitDto {
  id: string;
  phone: string;
  fullName: string | null;
  username: string | null;
  country: string | null;
  locale: string;
  devices: number;
}

export interface PushOverviewDto {
  days: number;
  totals: PushStatsDto;
  byCategory: (PushStatsDto & { category: string })[];
  byCountry: PushCountryStatsDto[];
  byDay: (PushStatsDto & { day: string })[];
  audience: { usersWithApp: number; devices: number; byPlatform: Record<string, number> };
}

export interface CountryOptionDto {
  code: string;
  name: { ru: string; en: string; tkm: string };
}
