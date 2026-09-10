-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "referrerUrl" TEXT;
