-- Configurable marketplace (gallery) take rate. Additive: existing enum values, existing
-- GalleryOrder rows, and existing seller-credit behaviour are all unaffected until the rate is
-- ever set above 0%.

-- AlterEnum
ALTER TYPE "SellerLedgerEntryType" ADD VALUE 'MARKETPLACE_PLATFORM_FEE';

-- AlterTable: nullable, and never backfilled -- an order placed before this column existed has
-- no snapshot to read, and GalleryService treats a null snapshot as 0% (unchanged behaviour),
-- never as "unknown". A default of 0 here would have falsely implied every historical order was
-- explicitly quoted at a 0% rate.
ALTER TABLE "GalleryOrder" ADD COLUMN "takeRatePercentSnapshot" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "MarketplaceSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "takeRatePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSettings_pkey" PRIMARY KEY ("id")
);
