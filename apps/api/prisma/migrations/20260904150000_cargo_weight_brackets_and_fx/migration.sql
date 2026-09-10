-- Both CargoTariff and Shipment are empty in production at this point (no CargoRoute has been
-- created yet, and both tables carry a required FK to one) -- safe to drop and re-add columns
-- outright rather than a data-preserving rename.

-- DropForeignKey (re-added below against the new column set)
ALTER TABLE "Shipment" DROP CONSTRAINT "Shipment_tariffId_fkey";

-- AlterTable: CargoTariff -- weight-bracket pricing in RUB instead of a single flat TMT rate
ALTER TABLE "CargoTariff" DROP COLUMN "pricePerKgTmt",
DROP COLUMN "pickupFeeTmt",
ADD COLUMN     "minWeightKg" DECIMAL(6,2) NOT NULL,
ADD COLUMN     "pricePerKgRub" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "pickupFeeRub" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable: Shipment -- snapshot the RUB bracket actually used plus the USD cross-rates it was
-- converted through, so neither a later tariff edit nor a later exchange-rate update can rewrite
-- the price of an order already placed.
ALTER TABLE "Shipment" DROP COLUMN "pricePerKgSnapshot",
DROP COLUMN "pickupFeeSnapshot",
ADD COLUMN     "pricePerKgRubSnapshot" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "pickupFeeRubSnapshot" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "totalPriceRub" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "rubPerUsdSnapshot" DECIMAL(10,4) NOT NULL,
ADD COLUMN     "tmtPerUsdSnapshot" DECIMAL(10,4) NOT NULL;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "CargoTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: CargoExchangeRate -- singleton, same shape as ReferralSettings. RUB and TMT both
-- float against USD independently, so this stores both cross-rates rather than one derived
-- RUB->TMT number that would silently go stale whenever only one of them moves.
CREATE TABLE "CargoExchangeRate" (
    "id" TEXT NOT NULL,
    "rubPerUsd" DECIMAL(10,4) NOT NULL,
    "tmtPerUsd" DECIMAL(10,4) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "CargoExchangeRate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CargoExchangeRate" ADD CONSTRAINT "CargoExchangeRate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
