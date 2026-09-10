-- CreateEnum
CREATE TYPE "HomeSlideLinkType" AS ENUM ('INTERNAL_SERVICE', 'EXTERNAL_URL', 'GALLERY_PRODUCT', 'SELLER_SHOP', 'NONE');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'TELEGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'WHATSAPP', 'X', 'VK', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StoryLinkType" ADD VALUE 'GALLERY_PRODUCT';
ALTER TYPE "StoryLinkType" ADD VALUE 'SELLER_SHOP';

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "galleryProductId" TEXT,
ADD COLUMN     "priceTmt" DECIMAL(12,2),
ADD COLUMN     "sellerId" TEXT;

-- CreateTable
CREATE TABLE "HomeSlide" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "imageUrl" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "linkType" "HomeSlideLinkType" NOT NULL DEFAULT 'NONE',
    "serviceId" TEXT,
    "externalUrl" TEXT,
    "galleryProductId" TEXT,
    "sponsorLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sellerId" TEXT,
    "priceTmt" DECIMAL(12,2),

    CONSTRAINT "HomeSlide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialLink" (
    "id" TEXT NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeSlide_isActive_sortOrder_idx" ON "HomeSlide"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "SocialLink_isEnabled_sortOrder_idx" ON "SocialLink"("isEnabled", "sortOrder");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_galleryProductId_fkey" FOREIGN KEY ("galleryProductId") REFERENCES "GalleryProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSlide" ADD CONSTRAINT "HomeSlide_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSlide" ADD CONSTRAINT "HomeSlide_galleryProductId_fkey" FOREIGN KEY ("galleryProductId") REFERENCES "GalleryProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeSlide" ADD CONSTRAINT "HomeSlide_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

