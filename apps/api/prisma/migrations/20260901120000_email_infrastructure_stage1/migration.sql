-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('AUTHENTICATION', 'SECURITY', 'ACCOUNT', 'ORDER', 'SELLER', 'SYSTEM', 'INFORMATIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "EmailTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EmailSuppressionReason" AS ENUM ('HARD_BOUNCE', 'COMPLAINT', 'UNSUBSCRIBED', 'INVALID', 'MANUAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmailKind" ADD VALUE 'AUTH_OTP';
ALTER TYPE "EmailKind" ADD VALUE 'AUTH_EMAIL_VERIFICATION';
ALTER TYPE "EmailKind" ADD VALUE 'AUTH_PASSWORD_RESET';
ALTER TYPE "EmailKind" ADD VALUE 'AUTH_LOGIN_ALERT';
ALTER TYPE "EmailKind" ADD VALUE 'AUTH_NEW_DEVICE';
ALTER TYPE "EmailKind" ADD VALUE 'AUTH_EMAIL_CHANGED';
ALTER TYPE "EmailKind" ADD VALUE 'ACCOUNT_CREATED';
ALTER TYPE "EmailKind" ADD VALUE 'ACCOUNT_PASSWORD_CHANGED';
ALTER TYPE "EmailKind" ADD VALUE 'ACCOUNT_DELETED';
ALTER TYPE "EmailKind" ADD VALUE 'ORDER_PAID';
ALTER TYPE "EmailKind" ADD VALUE 'ORDER_CANCELLED';
ALTER TYPE "EmailKind" ADD VALUE 'ORDER_REFUNDED';
ALTER TYPE "EmailKind" ADD VALUE 'SELLER_APPLICATION_RECEIVED';
ALTER TYPE "EmailKind" ADD VALUE 'SELLER_APPROVED';
ALTER TYPE "EmailKind" ADD VALUE 'SELLER_REJECTED';
ALTER TYPE "EmailKind" ADD VALUE 'SELLER_NEW_ORDER';
ALTER TYPE "EmailKind" ADD VALUE 'SELLER_ORDER_CANCELLED';
ALTER TYPE "EmailKind" ADD VALUE 'SELLER_PAYOUT';
ALTER TYPE "EmailKind" ADD VALUE 'SYSTEM_MAINTENANCE';
ALTER TYPE "EmailKind" ADD VALUE 'SYSTEM_SECURITY_ALERT';
ALTER TYPE "EmailKind" ADD VALUE 'SYSTEM_IMPORTANT_NOTICE';
ALTER TYPE "EmailKind" ADD VALUE 'MARKETING_NEWSLETTER';
ALTER TYPE "EmailKind" ADD VALUE 'MARKETING_PROMOTION';
ALTER TYPE "EmailKind" ADD VALUE 'MARKETING_NEW_FEATURE';
ALTER TYPE "EmailKind" ADD VALUE 'MARKETING_PARTNER_OFFER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EmailLog" ADD COLUMN     "locale" TEXT,
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "templateVersion" INTEGER;

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "kind" "EmailKind" NOT NULL,
    "locale" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "EmailTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "html" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "EmailSuppressionReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "marketing" BOOLEAN NOT NULL DEFAULT false,
    "productUpdates" BOOLEAN NOT NULL DEFAULT true,
    "partnerOffers" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionSource" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "unsubscribeReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailTemplate_kind_locale_status_idx" ON "EmailTemplate"("kind", "locale", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_kind_locale_version_key" ON "EmailTemplate"("kind", "locale", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EmailSuppression_email_key" ON "EmailSuppression"("email");

-- CreateIndex
CREATE INDEX "EmailSuppression_reason_idx" ON "EmailSuppression"("reason");

-- CreateIndex
CREATE UNIQUE INDEX "EmailPreference_userId_key" ON "EmailPreference"("userId");

-- CreateIndex
CREATE INDEX "EmailVerification_userId_createdAt_idx" ON "EmailVerification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailPreference" ADD CONSTRAINT "EmailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

