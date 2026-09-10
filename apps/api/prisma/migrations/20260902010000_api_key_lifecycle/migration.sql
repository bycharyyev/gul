-- Scopes, expiry and rotation for partner API keys.

ALTER TABLE "ApiKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ApiKey" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Rotation keeps the outgoing secret usable for a grace period, so a partner can deploy the new
-- one without a window where neither works.
ALTER TABLE "ApiKey" ADD COLUMN "previousKeyHash" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "previousKeyExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "ApiKey_previousKeyHash_key" ON "ApiKey"("previousKeyHash");

-- Every key that already exists keeps exactly the access it has today. Scopes restrict; they must
-- never silently take away access from a partner who is mid-integration.
UPDATE "ApiKey" SET "scopes" = ARRAY['catalog:read', 'orders:read', 'orders:write'];
