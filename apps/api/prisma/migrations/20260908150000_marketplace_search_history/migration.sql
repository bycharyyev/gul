-- The last few links a customer looked up. A convenience list, not an archive: the service keeps
-- at most MARKETPLACE_HISTORY_LIMIT rows per user, so this cannot quietly grow into a record of
-- everything a person ever shopped for.
--
-- Unique on (userId, canonicalUrl) rather than on the raw URL: the same product shared from two
-- places arrives with different tracking parameters and must still be one row.
CREATE TABLE "MarketplaceSearchHistory" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "sourceCode"   "MarketplaceSourceCode" NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "externalId"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceSearchHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceSearchHistory_userId_canonicalUrl_key"
  ON "MarketplaceSearchHistory"("userId", "canonicalUrl");
CREATE INDEX "MarketplaceSearchHistory_userId_createdAt_idx"
  ON "MarketplaceSearchHistory"("userId", "createdAt");

-- ON DELETE CASCADE: this is the customer's own browsing convenience, so it goes when they do.
-- Every other marketplace table uses RESTRICT because it carries financial evidence; this one
-- carries none.
ALTER TABLE "MarketplaceSearchHistory" ADD CONSTRAINT "MarketplaceSearchHistory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
