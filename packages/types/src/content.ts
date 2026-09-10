import { z } from "zod";
import { HOME_SLIDE_LINK_TYPES, SOCIAL_PLATFORMS, STORY_LINK_TYPES } from "./enums.js";

// ---- Stories (promo carousel) ----

export const storySchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  badgeLabel: z.string().nullable(),
  ctaLabel: z.string().nullable(),
  linkType: z.enum(STORY_LINK_TYPES),
  serviceId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  galleryProductId: z.string().nullable(),
  sellerId: z.string().nullable(),
  sponsorLabel: z.string().nullable(),
  priceTmt: z.number().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
});
export type StoryDto = z.infer<typeof storySchema>;

export interface StoryDetailDto extends StoryDto {
  service?: { id: string; name: string; logoUrl: string | null } | null;
  seller?: { id: string; handle: string; shopName: string } | null;
  galleryProduct?: { id: string; name: string; sku: string; imageUrl: string; sellerId: string | null } | null;
}

export const adminStoryInputSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().min(1),
  badgeLabel: z.string().max(40).optional(),
  ctaLabel: z.string().max(40).optional(),
  linkType: z.enum(STORY_LINK_TYPES),
  serviceId: z.string().optional(),
  externalUrl: z.string().optional(),
  galleryProductId: z.string().optional(),
  sellerId: z.string().optional(),
  sponsorLabel: z.string().max(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
export type AdminStoryInput = z.infer<typeof adminStoryInputSchema>;

export const createStoryAdSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().min(1),
  ctaLabel: z.string().max(40).optional(),
  galleryProductId: z.string(),
});
export type CreateStoryAdInput = z.infer<typeof createStoryAdSchema>;

// ---- Home slides (hero carousel above Stories) ----

export const homeSlideSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  imageUrl: z.string(),
  ctaLabel: z.string().nullable(),
  linkType: z.enum(HOME_SLIDE_LINK_TYPES),
  serviceId: z.string().nullable(),
  externalUrl: z.string().nullable(),
  galleryProductId: z.string().nullable(),
  sellerId: z.string().nullable(),
  sponsorLabel: z.string().nullable(),
  priceTmt: z.number().nullable(),
  isActive: z.boolean(),
  sortOrder: z.number(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
});
export type HomeSlideDto = z.infer<typeof homeSlideSchema>;

export interface HomeSlideDetailDto extends HomeSlideDto {
  service?: { id: string; name: string; logoUrl: string | null } | null;
  seller?: { id: string; handle: string; shopName: string } | null;
  galleryProduct?: { id: string; name: string; sku: string; imageUrl: string; sellerId: string | null } | null;
}

export const adminHomeSlideInputSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().min(1),
  ctaLabel: z.string().max(40).optional(),
  linkType: z.enum(HOME_SLIDE_LINK_TYPES),
  serviceId: z.string().optional(),
  externalUrl: z.string().optional(),
  galleryProductId: z.string().optional(),
  sellerId: z.string().optional(),
  sponsorLabel: z.string().max(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
});
export type AdminHomeSlideInput = z.infer<typeof adminHomeSlideInputSchema>;

export const createSlideAdSchema = z.object({
  title: z.string().min(1).max(120),
  subtitle: z.string().max(200).optional(),
  imageUrl: z.string().min(1),
  ctaLabel: z.string().max(40).optional(),
  galleryProductId: z.string(),
});
export type CreateSlideAdInput = z.infer<typeof createSlideAdSchema>;

export interface AdPricingDto {
  priceTmt: number;
  durationDays: number;
}

// ---- Social links ----

export const socialLinkSchema = z.object({
  id: z.string(),
  platform: z.enum(SOCIAL_PLATFORMS),
  url: z.string(),
  label: z.string().nullable(),
  isEnabled: z.boolean(),
  sortOrder: z.number(),
});
export type SocialLinkDto = z.infer<typeof socialLinkSchema>;

export const adminSocialLinkInputSchema = z.object({
  platform: z.enum(SOCIAL_PLATFORMS),
  // z.string().url() alone accepts any scheme with a valid URL shape, including
  // `javascript:...` -- rendered later as a plain `<a href>`, that's a stored-XSS vector.
  url: z.string().url().refine((v) => /^https?:\/\//i.test(v), "URL must start with http:// or https://"),
  label: z.string().max(60).optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
});
export type AdminSocialLinkInput = z.infer<typeof adminSocialLinkInputSchema>;

// ---- Content pages (FAQ / Privacy / Offer / ...) ----

export const contentPageSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  body: z.string(),
  titleEn: z.string().nullable().optional(),
  bodyEn: z.string().nullable().optional(),
  titleTkm: z.string().nullable().optional(),
  bodyTkm: z.string().nullable().optional(),
  updatedAt: z.string(),
});
export type ContentPageDto = z.infer<typeof contentPageSchema>;

export const adminContentPageInputSchema = z.object({
  slug: z.string().min(1).max(60),
  title: z.string().min(1).max(160),
  body: z.string().min(1),
  titleEn: z.string().min(1).max(160).optional(),
  bodyEn: z.string().min(1).optional(),
  titleTkm: z.string().min(1).max(160).optional(),
  bodyTkm: z.string().min(1).optional(),
});
export type AdminContentPageInput = z.infer<typeof adminContentPageInputSchema>;

