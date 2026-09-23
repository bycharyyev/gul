-- What turns a partner key into a shop key. Every seller-API route reads the shop off the key
-- rather than off a request parameter, so a key cannot be pointed at another shop's products.
-- Every existing key predates this and stays a partner key.
ALTER TABLE "ApiKey" ADD COLUMN "sellerId" TEXT;

CREATE INDEX "ApiKey_sellerId_idx" ON "ApiKey"("sellerId");

-- CASCADE: a key that outlived its shop could still authenticate and would reach nothing.
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
