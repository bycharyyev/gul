import { z } from "zod";
import {
  GALLERY_ORDER_STATUSES,
  type GalleryOrderStatus,
  type SellerApplicationStatus,
  type WithdrawalStatus,
} from "./enums.js";

// ---- Gallery (flowers & gifts delivery) ----

export interface GalleryCategoryDto {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isEnabled: boolean;
}

export const adminGalleryCategoryInputSchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(60),
  sortOrder: z.number().optional(),
  isEnabled: z.boolean().optional(),
});
export type AdminGalleryCategoryInput = z.infer<typeof adminGalleryCategoryInputSchema>;

export interface GalleryProductDto {
  id: string;
  categoryId: string;
  sellerId: string | null;
  sku: string;
  name: string;
  description: string | null;
  imageUrl: string;
  priceTmt: number;
  isEnabled: boolean;
  sortOrder: number;
  category: { id: string; name: string; slug: string };
  seller: { id: string; handle: string; shopName: string } | null;
  /** The seller's own section this sits on. Null means the shop's general list. */
  storefront: { id: string; name: string; slug: string } | null;
  storefrontId?: string | null;
}

export const adminGalleryProductInputSchema = z.object({
  categoryId: z.string(),
  sku: z.string().min(1).max(40),
  name: z.string().min(1).max(120),
  description: z.string().optional(),
  imageUrl: z.string().min(1),
  priceTmt: z.number().min(0),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
});
export type AdminGalleryProductInput = z.infer<typeof adminGalleryProductInputSchema>;

/**
 * The same product form, plus the one field only a seller has: which of their own sections it
 * belongs to. Staff have no sections of their own, which is why this is not on the admin schema.
 *
 * `null` is a value here, not an omission -- it moves the product back to the general list, and
 * a schema that only allowed a string would leave no way to say that.
 */
export const sellerGalleryProductInputSchema = adminGalleryProductInputSchema.extend({
  storefrontId: z.string().nullable().optional(),
});
export type SellerGalleryProductInput = z.infer<typeof sellerGalleryProductInputSchema>;

// ---- Storefronts: a shop's own sections ----

export interface StorefrontDto {
  id: string;
  name: string;
  /** Derived from the name, unique within the shop. */
  slug: string;
  description: string | null;
  coverUrl: string | null;
  isEnabled: boolean;
  sortOrder: number;
  _count: { products: number };
}

/** A section as a visitor sees it on the shop page: no on/off flag, since only running ones. */
export interface PublicStorefrontDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  coverUrl: string | null;
  productCount: number;
}

export const upsertStorefrontSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(300).optional(),
  coverUrl: z.string().optional(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().optional(),
});
export type UpsertStorefrontInput = z.infer<typeof upsertStorefrontSchema>;

export const createGalleryOrderSchema = z.object({
  productId: z.string(),
  recipientName: z.string().min(1).max(120),
  recipientPhone: z.string().min(3).max(32),
  deliveryCity: z.string().min(1).max(80),
  deliveryAddress: z.string().min(1).max(300),
  cardMessage: z.string().max(300).optional(),
});
export type CreateGalleryOrderInput = z.infer<typeof createGalleryOrderSchema>;

export interface GalleryOrderDto {
  id: string;
  productId: string;
  recipientName: string;
  recipientPhone: string;
  deliveryCity: string;
  deliveryAddress: string;
  cardMessage: string | null;
  amountTmt: number;
  status: GalleryOrderStatus;
  createdAt: string;
  deliveredAt: string | null;
  product: {
    id: string;
    name: string;
    imageUrl: string;
    category: { id: string; name: string; slug: string };
    seller: { id: string; handle: string; shopName: string } | null;
  };
}

export interface GalleryOrderAdminDto extends GalleryOrderDto {
  user: { id: string; phone: string; fullName: string | null };
}

export const updateGalleryOrderStatusSchema = z.object({
  status: z.enum(GALLERY_ORDER_STATUSES),
});
export type UpdateGalleryOrderStatusInput = z.infer<typeof updateGalleryOrderStatusSchema>;

// ---- Sellers ----

export interface SellerDto {
  id: string;
  handle: string;
  shopName: string;
  description: string | null;
  logoUrl: string | null;
  isEnabled: boolean;
  /**
   * The shop's own sections, running ones only. Present on the public shop lookup and absent
   * everywhere a Seller row is returned for other reasons, which is why it is optional.
   */
  storefronts?: PublicStorefrontDto[];
}

/**
 * The admin console's view of a shop.
 *
 * `storefronts` is omitted from the base and redeclared: the public shop page gets only running
 * sections, with their cover and address, while staff get every section including the hidden
 * ones and how much is on each. Same concept, two genuinely different answers -- so the shape
 * says so rather than one surface quietly carrying nulls for the other's fields.
 */
export interface SellerAdminDto extends Omit<SellerDto, "storefronts"> {
  balanceTmt: number;
  createdAt: string;
  user: { id: string; phone: string; fullName: string | null; isBlocked: boolean };
  /** Every section, running or not — staff see what a shop has built, not only what it shows. */
  storefronts?: {
    id: string;
    name: string;
    isEnabled: boolean;
    _count: { products: number };
  }[];
  _count?: { products: number; storefronts: number };
}

export interface SellerMeDto extends SellerDto {
  balanceTmt: number;
  createdAt: string;
  defaultPayoutDetails: string | null;
}

export interface SellerStatsDto {
  productCount: number;
  ordersByStatus: Record<string, number>;
  totalRevenueTmt: number;
}

export interface SellerTimeseriesPoint {
  date: string;
  orderCount: number;
  volumeTmt: number;
  deliveredCount: number;
}

export interface SellerTopProductDto {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string;
  orderCount: number;
  revenueTmt: number;
}

const HANDLE_REGEX = /^[a-z0-9_]+$/;
const handleSchema = z
  .string()
  .min(2)
  .max(32)
  .transform((v) => v.trim().toLowerCase())
  .refine((v) => HANDLE_REGEX.test(v), {
    message: "handle may only contain lowercase letters, digits, and underscores",
  });

export const createSellerSchema = z.object({
  phone: z.string().min(6).max(20),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(120).optional(),
  handle: handleSchema,
  shopName: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  logoUrl: z.string().optional(),
});
export type CreateSellerInput = z.infer<typeof createSellerSchema>;

export const updateSellerSchema = z.object({
  handle: handleSchema.optional(),
  shopName: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().optional(),
  isEnabled: z.boolean().optional(),
  defaultPayoutDetails: z.string().max(300).optional(),
});
export type UpdateSellerInput = z.infer<typeof updateSellerSchema>;

export interface SellerTelegramStatusDto {
  linked: boolean;
  botUsername: string | null;
}

export interface SellerTelegramLinkCodeDto {
  code: string;
  deepLink: string | null;
}

// ---- Seller applications (public self-signup, admin-moderated) ----

export const createSellerApplicationSchema = z.object({
  phone: z.string().min(6).max(20),
  // Required: before approval this is the only channel that reaches the applicant.
  email: z.string().email().max(254),
  password: z.string().min(8).max(72),
  fullName: z.string().min(1).max(120).optional(),
  handle: handleSchema,
  shopName: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});
export type CreateSellerApplicationInput = z.infer<typeof createSellerApplicationSchema>;

export const reviewApplicationSchema = z.object({
  note: z.string().max(500).optional(),
});
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;

export interface SellerApplicationDto {
  id: string;
  phone: string;
  fullName: string | null;
  handle: string;
  shopName: string;
  description: string | null;
  status: SellerApplicationStatus;
  createdAt: string;
}

export interface SellerApplicationAdminDto extends SellerApplicationDto {
  reviewNote: string | null;
  reviewedAt: string | null;
}

// ---- Withdrawals ----

export const createWithdrawalSchema = z.object({
  amountTmt: z.number().positive(),
  payoutDetails: z.string().min(3).max(300),
});
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;

export const reviewWithdrawalSchema = z.object({
  note: z.string().max(500).optional(),
});
export type ReviewWithdrawalInput = z.infer<typeof reviewWithdrawalSchema>;

export interface WithdrawalRequestDto {
  id: string;
  sellerId: string;
  amountTmt: number;
  payoutDetails: string;
  status: WithdrawalStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface WithdrawalRequestAdminDto extends WithdrawalRequestDto {
  seller: { id: string; handle: string; shopName: string };
}

export type SellerLedgerEntryType =
  | "OPENING_BALANCE"
  | "GALLERY_SALE_CREDIT"
  | "WITHDRAWAL_RESERVE"
  | "WITHDRAWAL_REFUND"
  | "STORY_AD_DEBIT"
  | "SLIDE_AD_DEBIT"
  | "REFERRAL_CREDIT"
  | "ADJUSTMENT";

export interface SellerLedgerEntryDto {
  id: string;
  sellerId: string;
  type: SellerLedgerEntryType;
  amountTmt: number;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata: unknown;
  createdAt: string;
}

export interface SellerBalanceMismatchDto {
  sellerId: string;
  handle: string;
  cachedBalance: number;
  ledgerBalance: number;
  difference: number;
}
