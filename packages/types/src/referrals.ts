import { z } from "zod";

// ---- Referral program ----

export const updateUsernameSchema = z.object({
  username: z.string().min(2).max(32),
});
export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>;

export const myReferralInfoSchema = z.object({
  username: z.string(),
  referralBalanceTmt: z.number().nullable(),
  canChangeUsername: z.boolean(),
  stats: z.object({
    totalReferred: z.number(),
    rewarded: z.number(),
    pending: z.number(),
  }),
});
export type MyReferralInfoDto = z.infer<typeof myReferralInfoSchema>;

export const referralSettingsSchema = z.object({
  id: z.string(),
  enabled: z.boolean(),
  customerRewardTmt: z.number(),
  sellerRewardTmt: z.number(),
  updatedAt: z.string(),
});
export type ReferralSettingsDto = z.infer<typeof referralSettingsSchema>;

export const updateReferralSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  customerRewardTmt: z.number().min(0).optional(),
  sellerRewardTmt: z.number().min(0).optional(),
});
export type UpdateReferralSettingsInput = z.infer<typeof updateReferralSettingsSchema>;

export type ReferralStatus = "PENDING" | "REWARDED" | "VOID";
export type ReferrerType = "CUSTOMER" | "SELLER";

export interface ReferralLedgerEntryDto {
  id: string;
  referrerType: ReferrerType;
  referrer: { id: string | null; label: string };
  referee: { id: string; label: string };
  username: string;
  status: ReferralStatus;
  rewardAmountTmt: number | null;
  createdAt: string;
  rewardedAt: string | null;
  attribution: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrerUrl: string | null;
  };
}

export interface ReferralLeaderboardEntryDto {
  referrerType: ReferrerType;
  label: string;
  count: number;
  totalRewardTmt: number;
}

