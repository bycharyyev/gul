-- CreateEnum
CREATE TYPE "StoryLinkType" AS ENUM ('INTERNAL_SERVICE', 'EXTERNAL_URL', 'PARTNER_AD');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "badgeLabel" TEXT,
    "ctaLabel" TEXT,
    "linkType" "StoryLinkType" NOT NULL DEFAULT 'INTERNAL_SERVICE',
    "serviceId" TEXT,
    "externalUrl" TEXT,
    "sponsorLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Story_isActive_sortOrder_idx" ON "Story"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
