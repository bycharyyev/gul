-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Seller_telegramChatId_key" ON "Seller"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_telegramLinkCode_key" ON "Seller"("telegramLinkCode");

