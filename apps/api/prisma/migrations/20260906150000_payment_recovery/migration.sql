-- Canonical provider-neutral payment states. Provider-specific values remain separately visible
-- in providerStatus, while UNKNOWN preserves ambiguous network outcomes for reconciliation.
-- migration-policy: allow-destructive STAGE5-PAYMENT-STATUS-REVIEW
-- This reviewed one-time conversion maps every legacy value explicitly below. It must be applied
-- only after a verified backup/restore and cannot be paired with an old-code rollback.
CREATE TYPE "PaymentStatus" AS ENUM (
  'INITIATING',
  'PENDING',
  'SUCCEEDED',
  'DECLINED',
  'UNKNOWN',
  'CANCELLED'
);

ALTER TABLE "Payment"
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "redirectUrl" TEXT,
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Keep the newest active attempt canonical. Older duplicates are ambiguous rather than failed:
-- the gateway may already have accepted one of them and only reconciliation can decide.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
  FROM "Payment"
  WHERE "status" IN ('initiating', 'initiated')
)
UPDATE "Payment" p
SET "status" = 'unknown'
FROM ranked r
WHERE p."id" = r."id" AND r.rn > 1;

ALTER TABLE "Payment"
  ALTER COLUMN "status" TYPE "PaymentStatus"
  USING (
    CASE LOWER("status")
      WHEN 'initiating' THEN 'INITIATING'::"PaymentStatus"
      WHEN 'initiated' THEN 'PENDING'::"PaymentStatus"
      WHEN 'pending' THEN 'PENDING'::"PaymentStatus"
      WHEN 'succeeded' THEN 'SUCCEEDED'::"PaymentStatus"
      WHEN 'paid' THEN 'SUCCEEDED'::"PaymentStatus"
      WHEN 'declined' THEN 'DECLINED'::"PaymentStatus"
      WHEN 'cancelled' THEN 'CANCELLED'::"PaymentStatus"
      ELSE 'UNKNOWN'::"PaymentStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'INITIATING';

CREATE INDEX "Payment_status_updatedAt_idx" ON "Payment"("status", "updatedAt");
-- A provider reference was not previously constrained and may contain legitimate historic
-- duplicates. Do not manufacture certainty during migration; webhook event deduplication will
-- use the provider's stable event id instead.

CREATE TABLE "PaymentInitiationGuard" (
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentInitiationGuard_pkey" PRIMARY KEY ("orderId")
);
CREATE UNIQUE INDEX "PaymentInitiationGuard_paymentId_key" ON "PaymentInitiationGuard"("paymentId");

-- One durable claim per order survives PENDING and UNKNOWN. For historic duplicates the newest
-- row owns the claim, while every older row remains unchanged evidence for manual reconciliation.
INSERT INTO "PaymentInitiationGuard" ("orderId", "paymentId", "createdAt")
SELECT DISTINCT ON ("orderId") "orderId", "id", "createdAt"
FROM "Payment"
WHERE "status" IN ('INITIATING', 'PENDING', 'UNKNOWN')
ORDER BY "orderId", "createdAt" DESC, "id" DESC;
