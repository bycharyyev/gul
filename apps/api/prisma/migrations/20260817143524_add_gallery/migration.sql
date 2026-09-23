-- CreateEnum
CREATE TYPE "GalleryOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'PROCESSING', 'DELIVERED', 'CANCELLED');

-- CreateTable
CREATE TABLE "GalleryCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryProduct" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT NOT NULL,
    "priceTmt" DECIMAL(12,2) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GalleryProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryAddress" TEXT NOT NULL,
    "cardMessage" TEXT,
    "amountTmt" DECIMAL(12,2) NOT NULL,
    "status" "GalleryOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "GalleryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryCategory_slug_key" ON "GalleryCategory"("slug");

-- CreateIndex
CREATE INDEX "GalleryCategory_isEnabled_sortOrder_idx" ON "GalleryCategory"("isEnabled", "sortOrder");

-- CreateIndex
CREATE INDEX "GalleryProduct_categoryId_isEnabled_sortOrder_idx" ON "GalleryProduct"("categoryId", "isEnabled", "sortOrder");

-- CreateIndex
CREATE INDEX "GalleryOrder_status_idx" ON "GalleryOrder"("status");

-- CreateIndex
CREATE INDEX "GalleryOrder_userId_idx" ON "GalleryOrder"("userId");

-- AddForeignKey
ALTER TABLE "GalleryProduct" ADD CONSTRAINT "GalleryProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GalleryCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryOrder" ADD CONSTRAINT "GalleryOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryOrder" ADD CONSTRAINT "GalleryOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "GalleryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
