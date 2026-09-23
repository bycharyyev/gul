-- Shipment is confirmed empty in production (see infra/checks/cargo-state.sql, run 2026-09-04) --
-- safe to add a required column directly, no backfill needed.

-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "paymentMethodId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
