-- Seller ad prices and durations move from code constants into MarketplaceSettings (E-05/A-05).
-- Additive only: NOT NULL columns with defaults equal to the old constants, so the existing
-- singleton row (if any) gets exactly the values the code used before.
ALTER TABLE "MarketplaceSettings" ADD COLUMN "storyAdPriceTmt" DECIMAL(12,2) NOT NULL DEFAULT 50;
ALTER TABLE "MarketplaceSettings" ADD COLUMN "storyAdDurationDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "MarketplaceSettings" ADD COLUMN "slideAdPriceTmt" DECIMAL(12,2) NOT NULL DEFAULT 200;
ALTER TABLE "MarketplaceSettings" ADD COLUMN "slideAdDurationDays" INTEGER NOT NULL DEFAULT 3;
