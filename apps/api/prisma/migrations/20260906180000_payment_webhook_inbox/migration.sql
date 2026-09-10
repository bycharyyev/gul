-- Verified, normalized provider events are stored before business effects are applied. The
-- provider event id is the durable deduplication boundary for webhook retries.
CREATE TABLE "PaymentEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "paymentId" TEXT,
  "providerTransactionId" TEXT,
  "idempotencyKey" TEXT,
  "status" "PaymentStatus" NOT NULL,
  "amount" DECIMAL(12,2),
  "currency" "CurrencyCode",
  "providerStatus" TEXT,
  "contentHash" TEXT NOT NULL,
  "payload" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStartedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "processingError" TEXT,
  CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentEvent_provider_eventId_key" ON "PaymentEvent"("provider", "eventId");
CREATE INDEX "PaymentEvent_processedAt_processingStartedAt_idx"
  ON "PaymentEvent"("processedAt", "processingStartedAt");
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");
