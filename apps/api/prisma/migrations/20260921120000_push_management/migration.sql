-- User country, filled from the calling code of the phone number for everyone who already exists.
ALTER TABLE "User" ADD COLUMN "country" VARCHAR(2);
CREATE INDEX "User_country_idx" ON "User"("country");

UPDATE "User" SET "country" = CASE
  WHEN "phone" LIKE '+993%' THEN 'TM'
  WHEN "phone" LIKE '+76%' OR "phone" LIKE '+77%' THEN 'KZ'
  WHEN "phone" LIKE '+7%' THEN 'RU'
  WHEN "phone" LIKE '+86%' THEN 'CN'
  WHEN "phone" LIKE '+90%' THEN 'TR'
  WHEN "phone" LIKE '+998%' THEN 'UZ'
  WHEN "phone" LIKE '+996%' THEN 'KG'
  WHEN "phone" LIKE '+992%' THEN 'TJ'
  WHEN "phone" LIKE '+994%' THEN 'AZ'
  WHEN "phone" LIKE '+995%' THEN 'GE'
  WHEN "phone" LIKE '+374%' THEN 'AM'
  WHEN "phone" LIKE '+375%' THEN 'BY'
  WHEN "phone" LIKE '+380%' THEN 'UA'
  WHEN "phone" LIKE '+971%' THEN 'AE'
  WHEN "phone" LIKE '+98%' THEN 'IR'
  WHEN "phone" LIKE '+49%' THEN 'DE'
  WHEN "phone" LIKE '+44%' THEN 'GB'
  WHEN "phone" LIKE '+1%' THEN 'US'
  ELSE NULL
END;

CREATE TYPE "PushCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED', 'FAILED');

CREATE TABLE "PushTemplate" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "titleRu" VARCHAR(120) NOT NULL,
    "bodyRu" VARCHAR(500) NOT NULL,
    "titleEn" VARCHAR(120),
    "bodyEn" VARCHAR(500),
    "titleTkm" VARCHAR(120),
    "bodyTkm" VARCHAR(500),
    "imageUrl" TEXT,
    "route" VARCHAR(300) NOT NULL DEFAULT '/home',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushCampaign" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "category" VARCHAR(24) NOT NULL,
    "templateId" TEXT,
    "titleRu" VARCHAR(120) NOT NULL,
    "bodyRu" VARCHAR(500) NOT NULL,
    "titleEn" VARCHAR(120),
    "bodyEn" VARCHAR(500),
    "titleTkm" VARCHAR(120),
    "bodyTkm" VARCHAR(500),
    "imageUrl" TEXT,
    "route" VARCHAR(300) NOT NULL DEFAULT '/home',
    "audience" JSONB NOT NULL,
    "status" "PushCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" VARCHAR(300),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PushDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "category" VARCHAR(24) NOT NULL,
    "devices" INTEGER NOT NULL DEFAULT 0,
    "accepted" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PushTemplate_isEnabled_name_idx" ON "PushTemplate"("isEnabled", "name");
CREATE INDEX "PushCampaign_status_scheduledAt_idx" ON "PushCampaign"("status", "scheduledAt");
CREATE INDEX "PushCampaign_createdAt_idx" ON "PushCampaign"("createdAt");
CREATE INDEX "PushDelivery_campaignId_idx" ON "PushDelivery"("campaignId");
CREATE INDEX "PushDelivery_userId_createdAt_idx" ON "PushDelivery"("userId", "createdAt");
CREATE INDEX "PushDelivery_createdAt_category_idx" ON "PushDelivery"("createdAt", "category");

ALTER TABLE "PushCampaign" ADD CONSTRAINT "PushCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PushTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushDelivery" ADD CONSTRAINT "PushDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PushCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
