-- A section of one shop, made and ordered by the person who runs it. Distinct from
-- GalleryCategory, which is the platform's own taxonomy and belongs to staff.
CREATE TABLE "Storefront" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "description" VARCHAR(300),
    "coverUrl" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Storefront_pkey" PRIMARY KEY ("id")
);

-- Per shop, not global: two shops may both want a section called "novinki".
CREATE UNIQUE INDEX "Storefront_sellerId_slug_key" ON "Storefront"("sellerId", "slug");
CREATE INDEX "Storefront_sellerId_isEnabled_sortOrder_idx" ON "Storefront"("sellerId", "isEnabled", "sortOrder");

ALTER TABLE "Storefront" ADD CONSTRAINT "Storefront_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing product predates sections and stays in its shop's general list.
ALTER TABLE "GalleryProduct" ADD COLUMN "storefrontId" TEXT;

CREATE INDEX "GalleryProduct_storefrontId_isEnabled_sortOrder_idx"
    ON "GalleryProduct"("storefrontId", "isEnabled", "sortOrder");

-- SET NULL, not CASCADE: removing a shelf must not destroy the stock that was on it. The
-- products fall back to the shop's general list, where their owner can find them again.
ALTER TABLE "GalleryProduct" ADD CONSTRAINT "GalleryProduct_storefrontId_fkey"
    FOREIGN KEY ("storefrontId") REFERENCES "Storefront"("id") ON DELETE SET NULL ON UPDATE CASCADE;
