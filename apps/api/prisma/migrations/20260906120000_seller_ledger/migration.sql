-- Append-only seller balance ledger. Existing mutable balances become explicit opening entries,
-- allowing reconciliation immediately without pretending historic transactions are reconstructable.
CREATE TYPE "SellerLedgerEntryType" AS ENUM (
  'OPENING_BALANCE',
  'GALLERY_SALE_CREDIT',
  'WITHDRAWAL_RESERVE',
  'WITHDRAWAL_REFUND',
  'STORY_AD_DEBIT',
  'SLIDE_AD_DEBIT',
  'REFERRAL_CREDIT',
  'ADJUSTMENT'
);

CREATE TABLE "SellerLedgerEntry" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "type" "SellerLedgerEntryType" NOT NULL,
  "amountTmt" DECIMAL(12,2) NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SellerLedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerLedgerEntry_idempotencyKey_key" ON "SellerLedgerEntry"("idempotencyKey");
CREATE INDEX "SellerLedgerEntry_sellerId_createdAt_idx" ON "SellerLedgerEntry"("sellerId", "createdAt");
CREATE INDEX "SellerLedgerEntry_referenceType_referenceId_idx" ON "SellerLedgerEntry"("referenceType", "referenceId");
ALTER TABLE "SellerLedgerEntry" ADD CONSTRAINT "SellerLedgerEntry_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "SellerLedgerEntry" (
  "id", "sellerId", "type", "amountTmt", "referenceType", "referenceId", "idempotencyKey"
)
SELECT
  'opening_' || "id",
  "id",
  'OPENING_BALANCE'::"SellerLedgerEntryType",
  "balanceTmt",
  'Seller',
  "id",
  'seller:' || "id" || ':opening'
FROM "Seller"
WHERE "balanceTmt" <> 0;

CREATE FUNCTION prevent_seller_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'SellerLedgerEntry is append-only; insert a compensating entry';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SellerLedgerEntry_append_only"
BEFORE UPDATE OR DELETE ON "SellerLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION prevent_seller_ledger_mutation();
