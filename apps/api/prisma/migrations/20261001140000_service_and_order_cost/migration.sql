-- Cost basis for top-ups (unit economics finding E-01). Additive: two new tables, no change to
-- Service or Order, which are returned whole to customers and partners.

-- CreateTable
CREATE TABLE "ServiceCost" (
    "serviceId" TEXT NOT NULL,
    "costPercent" DECIMAL(5,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ServiceCost_pkey" PRIMARY KEY ("serviceId")
);

-- CreateTable
CREATE TABLE "OrderCost" (
    "orderId" TEXT NOT NULL,
    "costPercent" DECIMAL(5,2) NOT NULL,
    "costTmt" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderCost_pkey" PRIMARY KEY ("orderId")
);

-- AddForeignKey
ALTER TABLE "ServiceCost" ADD CONSTRAINT "ServiceCost_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCost" ADD CONSTRAINT "OrderCost_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
