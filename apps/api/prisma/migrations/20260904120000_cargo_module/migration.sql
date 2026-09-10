-- AlterEnum
ALTER TYPE "EmailKind" ADD VALUE 'CARGO_SHIPMENT_CREATED';
ALTER TYPE "EmailKind" ADD VALUE 'CARGO_SHIPMENT_DELIVERED';

-- Tracking numbers are issued from a Postgres sequence, same lock-free approach as
-- ReferralsService.generateUsername() -- concurrent shipment creation can't collide.
CREATE SEQUENCE IF NOT EXISTS "cargo_tracking_seq" START WITH 1;

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'QUOTE_CREATED', 'PENDING_PAYMENT', 'PAID', 'PICKUP_REQUESTED', 'PICKUP_CONFIRMED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED_DESTINATION', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'ON_HOLD', 'EXCEPTION');

-- CreateEnum
CREATE TYPE "ShipmentDeliveryMode" AS ENUM ('WAREHOUSE_PICKUP', 'DOOR_DELIVERY');

-- CreateEnum
CREATE TYPE "CargoPickupStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'PICKED_UP', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "CargoRoute" (
    "id" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "originCity" TEXT NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CargoRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoTariff" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "pricePerKgTmt" DECIMAL(12,2) NOT NULL,
    "pickupFeeTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "CargoTariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "publicTrackingNumber" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderPhone" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "deliveryMode" "ShipmentDeliveryMode" NOT NULL DEFAULT 'WAREHOUSE_PICKUP',
    "cargoDescription" TEXT NOT NULL,
    "declaredWeightKg" DECIMAL(6,2) NOT NULL,
    "declaredValueTmt" DECIMAL(12,2),
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "pricePerKgSnapshot" DECIMAL(12,2) NOT NULL,
    "pickupFeeSnapshot" DECIMAL(12,2) NOT NULL,
    "totalPriceTmt" DECIMAL(12,2) NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoPickupRequest" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "timeWindow" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" "CargoPickupStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoPickupRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentTrackingEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ShipmentTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CargoRoute_originCity_destinationCity_key" ON "CargoRoute"("originCity", "destinationCity");

-- CreateIndex
CREATE INDEX "CargoTariff_routeId_isActive_idx" ON "CargoTariff"("routeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_publicTrackingNumber_key" ON "Shipment"("publicTrackingNumber");

-- CreateIndex
CREATE INDEX "Shipment_userId_idx" ON "Shipment"("userId");

-- CreateIndex
CREATE INDEX "Shipment_status_idx" ON "Shipment"("status");

-- CreateIndex
CREATE INDEX "Shipment_routeId_idx" ON "Shipment"("routeId");

-- CreateIndex
CREATE UNIQUE INDEX "CargoPickupRequest_shipmentId_key" ON "CargoPickupRequest"("shipmentId");

-- CreateIndex
CREATE INDEX "ShipmentTrackingEvent_shipmentId_createdAt_idx" ON "ShipmentTrackingEvent"("shipmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "CargoTariff" ADD CONSTRAINT "CargoTariff_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "CargoRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoTariff" ADD CONSTRAINT "CargoTariff_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "CargoRoute"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "CargoTariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CargoPickupRequest" ADD CONSTRAINT "CargoPickupRequest_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTrackingEvent" ADD CONSTRAINT "ShipmentTrackingEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentTrackingEvent" ADD CONSTRAINT "ShipmentTrackingEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
