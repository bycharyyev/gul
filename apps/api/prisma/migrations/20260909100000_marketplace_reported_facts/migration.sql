-- What the customer's browser read off the product page, kept apart from the verified snapshot
-- columns so the two can never be mistaken for each other. Additive and nullable: existing rows
-- stay valid, and a rollback to the previous image leaves these columns unread rather than broken.
ALTER TABLE "MarketplacePurchaseItem"
  ADD COLUMN "reportedTitle" TEXT,
  ADD COLUMN "reportedPrice" DECIMAL(12,2),
  ADD COLUMN "reportedCurrency" "CurrencyCode",
  ADD COLUMN "reportedSource" TEXT;
