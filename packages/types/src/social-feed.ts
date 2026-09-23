import { z } from "zod";

export const SOCIAL_POST_MEDIA_TYPES = ["TEXT", "IMAGE", "VIDEO"] as const;
export const SOCIAL_POST_STATUSES = [
  "PENDING",
  "PUBLISHED",
  "REJECTED",
  "HIDDEN",
] as const;
export const SOCIAL_COMMENT_STATUSES = [
  "PENDING",
  "PUBLISHED",
  "HIDDEN",
] as const;

const safeText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => !/[<>]/.test(v), "HTML is not allowed");
const safeMediaUrl = z
  .string()
  .refine(
    (v) => /^https:\/\//i.test(v) || /^\/api\/uploads\//.test(v),
    "Use an HTTPS or uploaded-media URL",
  );

const socialPostFields = z.object({
  body: safeText(1500).optional(),
  mediaType: z.enum(SOCIAL_POST_MEDIA_TYPES),
  mediaUrl: safeMediaUrl.optional(),
  thumbnailUrl: safeMediaUrl.optional(),
  productIds: z.array(z.string().min(1)).max(6).default([]),
});
export const createSocialPostSchema = socialPostFields.superRefine(
  (value, ctx) => {
    if (value.mediaType === "TEXT" && !value.body)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Text posts require body",
      });
    if (value.mediaType !== "TEXT" && !value.mediaUrl)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Media posts require mediaUrl",
      });
    if (value.mediaType === "VIDEO" && !value.thumbnailUrl)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Video posts require thumbnailUrl",
      });
  },
);
export type CreateSocialPostInput = z.infer<typeof createSocialPostSchema>;

export const updateSocialPostSchema = socialPostFields.partial();
export type UpdateSocialPostInput = z.infer<typeof updateSocialPostSchema>;
export const createSocialCommentSchema = z.object({ body: safeText(600) });
export type CreateSocialCommentInput = z.infer<
  typeof createSocialCommentSchema
>;
export const reportSocialPostSchema = z.object({ reason: safeText(500) });
export type ReportSocialPostInput = z.infer<typeof reportSocialPostSchema>;
export const moderateSocialPostSchema = z.object({
  status: z.enum(SOCIAL_POST_STATUSES),
  note: safeText(500).optional(),
});
export type ModerateSocialPostInput = z.infer<typeof moderateSocialPostSchema>;
export const moderateSocialCommentSchema = z.object({
  status: z.enum(SOCIAL_COMMENT_STATUSES),
});
export type ModerateSocialCommentInput = z.infer<
  typeof moderateSocialCommentSchema
>;

export interface SocialFeedProductDto {
  id: string;
  name: string;
  sku: string;
  imageUrl: string;
  priceTmt: number;
  sellerId: string | null;
}
export interface SocialFeedPostDto {
  id: string;
  body: string | null;
  mediaType: (typeof SOCIAL_POST_MEDIA_TYPES)[number];
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  status?: (typeof SOCIAL_POST_STATUSES)[number];
  createdAt: string;
  publishedAt: string | null;
  likeCount: number;
  saveCount: number;
  viewCount: number;
  productClickCount: number;
  commentCount: number;
  author: {
    id: string;
    fullName: string | null;
    username: string;
    avatarUrl: string | null;
  };
  products: SocialFeedProductDto[];
  viewer?: { liked: boolean; saved: boolean };
}
export interface SocialFeedPageDto {
  items: SocialFeedPostDto[];
  nextCursor: string | null;
}
