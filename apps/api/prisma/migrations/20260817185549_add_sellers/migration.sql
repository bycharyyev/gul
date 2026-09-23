-- AlterEnum
ALTER TYPE "SupportSenderRole" ADD VALUE 'SELLER';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SELLER';

-- AlterTable
ALTER TABLE "GalleryProduct" ADD COLUMN     "sellerId" TEXT,
ADD COLUMN     "sku" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "SupportThread" ADD COLUMN     "sellerId" TEXT;

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "balanceTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_handle_key" ON "Seller"("handle");

-- CreateIndex
CREATE INDEX "Seller_isEnabled_idx" ON "Seller"("isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryProduct_sku_key" ON "GalleryProduct"("sku");

-- CreateIndex
CREATE INDEX "GalleryProduct_sellerId_idx" ON "GalleryProduct"("sellerId");

-- CreateIndex
CREATE INDEX "SupportThread_sellerId_idx" ON "SupportThread"("sellerId");

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryProduct" ADD CONSTRAINT "GalleryProduct_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

