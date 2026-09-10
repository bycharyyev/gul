-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'REWARDED', 'VOID');

-- CreateEnum
CREATE TYPE "ReferrerType" AS ENUM ('CUSTOMER', 'SELLER');

-- AlterTable: username starts nullable so existing rows can be backfilled safely,
-- then locked down to NOT NULL + UNIQUE once every row has a value.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "referredByUsername" TEXT;
ALTER TABLE "User" ADD COLUMN "referralBalanceTmt" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "referredById" TEXT;

-- Backfill: existing rows get their own cuid `id` as a temporary username. It's already
-- guaranteed globally unique and matches the ^[a-z0-9_]+$ format, so this can never collide.
-- Users can change it to something readable afterwards via their profile.
UPDATE "User" SET "username" = "id" WHERE "username" IS NULL;

ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "referralDiscountTmt" DECIMAL(12,2);

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerType" "ReferrerType" NOT NULL,
    "referrerUserId" TEXT,
    "referrerSellerId" TEXT,
    "refereeUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "rewardAmountTmt" DECIMAL(12,2),
    "qualifyingOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "customerRewardTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "sellerRewardTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_refereeUserId_key" ON "Referral"("refereeUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerType_referrerUserId_idx" ON "Referral"("referrerType", "referrerUserId");

-- CreateIndex
CREATE INDEX "Referral_referrerType_referrerSellerId_idx" ON "Referral"("referrerType", "referrerSellerId");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerSellerId_fkey" FOREIGN KEY ("referrerSellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_refereeUserId_fkey" FOREIGN KEY ("refereeUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
