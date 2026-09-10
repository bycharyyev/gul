CREATE TYPE "MarketplaceSourceCode" AS ENUM ('OZON','WILDBERRIES','ALIEXPRESS','TRENDYOL','YANDEX_MARKET','TAOBAO');
CREATE TYPE "MarketplacePurchaseStatus" AS ENUM ('DRAFT','MANUAL_REVIEW','QUOTED','AUTHORIZATION_PENDING','AUTHORIZED','PURCHASING','PURCHASED','AT_WAREHOUSE','FINAL_PAYMENT_DUE','READY_TO_SHIP','SHIPPED','DELIVERED','CANCELLED','REFUND_PENDING','REFUNDED');
CREATE TYPE "MarketplacePurchaseLedgerType" AS ENUM ('BALANCE_DEBIT','AUTHORIZATION','SETTLEMENT','REFUND_CREDIT');
CREATE TYPE "MarketplaceWeightConfidence" AS ENUM ('ESTIMATED','EXACT');

CREATE TABLE "MarketplacePurchaseSource" ("code" "MarketplaceSourceCode" PRIMARY KEY,"name" TEXT NOT NULL,"allowedHosts" TEXT[] NOT NULL,"adapterKey" TEXT NOT NULL,"isEnabled" BOOLEAN NOT NULL DEFAULT true,"requiresManualReview" BOOLEAN NOT NULL DEFAULT true,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "MarketplacePurchaseSettings" ("id" TEXT PRIMARY KEY DEFAULT 'singleton',"serviceFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 10,"shippingPerKgTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,"minimumFeeTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,"quoteTtlMinutes" INTEGER NOT NULL DEFAULT 1440,"updatedAt" TIMESTAMP(3) NOT NULL,"updatedById" TEXT);
CREATE TABLE "MarketplacePurchaseOrder" ("id" TEXT PRIMARY KEY,"userId" TEXT NOT NULL,"status" "MarketplacePurchaseStatus" NOT NULL DEFAULT 'DRAFT',"currency" "CurrencyCode" NOT NULL,"acceptedQuoteVersion" INTEGER,"maxAuthorizedTmt" DECIMAL(12,2),"authorizedTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,"settledTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,"refundedTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,"fundingProvider" TEXT,"fundingReference" TEXT,"consentAcceptedAt" TIMESTAMP(3),"consentVersion" TEXT,"deliveryAddress" TEXT NOT NULL,"reviewReason" TEXT,"idempotencyKey" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "MarketplacePurchaseItem" ("id" TEXT PRIMARY KEY,"orderId" TEXT NOT NULL,"sourceCode" "MarketplaceSourceCode" NOT NULL,"canonicalUrl" TEXT NOT NULL,"quantity" INTEGER NOT NULL,"variant" TEXT,"titleSnapshot" TEXT,"imageUrlSnapshot" TEXT,"externalIdSnapshot" TEXT,"unitPriceSnapshot" DECIMAL(12,2),"sourceCurrencySnapshot" "CurrencyCode","estimatedWeightKg" DECIMAL(8,3),"actualWeightKg" DECIMAL(8,3),"snapshotPayload" JSONB,"snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "MarketplacePurchaseQuote" ("id" TEXT PRIMARY KEY,"orderId" TEXT NOT NULL,"version" INTEGER NOT NULL,"productSubtotalTmt" DECIMAL(12,2) NOT NULL,"serviceFeeTmt" DECIMAL(12,2) NOT NULL,"shippingTmt" DECIMAL(12,2) NOT NULL,"totalTmt" DECIMAL(12,2) NOT NULL,"fxSnapshot" JSONB NOT NULL,"weightKg" DECIMAL(8,3) NOT NULL,"weightConfidence" "MarketplaceWeightConfidence" NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "MarketplacePurchaseAccount" ("userId" TEXT PRIMARY KEY,"balanceTmt" DECIMAL(12,2) NOT NULL DEFAULT 0,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "MarketplacePurchaseLedger" ("id" TEXT PRIMARY KEY,"orderId" TEXT NOT NULL,"type" "MarketplacePurchaseLedgerType" NOT NULL,"amountTmt" DECIMAL(12,2) NOT NULL,"idempotencyKey" TEXT NOT NULL,"externalRef" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "MarketplacePurchaseOrder_idempotencyKey_key" ON "MarketplacePurchaseOrder"("idempotencyKey");
CREATE UNIQUE INDEX "MarketplacePurchaseOrder_fundingProvider_fundingReference_key" ON "MarketplacePurchaseOrder"("fundingProvider","fundingReference");
CREATE INDEX "MarketplacePurchaseOrder_userId_createdAt_idx" ON "MarketplacePurchaseOrder"("userId","createdAt");
CREATE INDEX "MarketplacePurchaseOrder_status_updatedAt_idx" ON "MarketplacePurchaseOrder"("status","updatedAt");
CREATE INDEX "MarketplacePurchaseItem_orderId_idx" ON "MarketplacePurchaseItem"("orderId");
CREATE UNIQUE INDEX "MarketplacePurchaseQuote_orderId_version_key" ON "MarketplacePurchaseQuote"("orderId","version");
CREATE UNIQUE INDEX "MarketplacePurchaseLedger_idempotencyKey_key" ON "MarketplacePurchaseLedger"("idempotencyKey");
CREATE INDEX "MarketplacePurchaseLedger_orderId_createdAt_idx" ON "MarketplacePurchaseLedger"("orderId","createdAt");
ALTER TABLE "MarketplacePurchaseOrder" ADD CONSTRAINT "MarketplacePurchaseOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "MarketplacePurchaseItem" ADD CONSTRAINT "MarketplacePurchaseItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplacePurchaseOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "MarketplacePurchaseQuote" ADD CONSTRAINT "MarketplacePurchaseQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplacePurchaseOrder"("id") ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE "MarketplacePurchaseAccount" ADD CONSTRAINT "MarketplacePurchaseAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE "MarketplacePurchaseLedger" ADD CONSTRAINT "MarketplacePurchaseLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "MarketplacePurchaseOrder"("id") ON UPDATE CASCADE ON DELETE RESTRICT;

INSERT INTO "MarketplacePurchaseSource" ("code","name","allowedHosts","adapterKey","requiresManualReview") VALUES
('OZON','Ozon',ARRAY['ozon.ru','www.ozon.ru'],'manual',true),
('WILDBERRIES','Wildberries',ARRAY['wildberries.ru','www.wildberries.ru'],'manual',true),
('ALIEXPRESS','AliExpress',ARRAY['aliexpress.com','www.aliexpress.com','aliexpress.ru'],'manual',true),
('TRENDYOL','Trendyol',ARRAY['trendyol.com','www.trendyol.com'],'manual',true),
('YANDEX_MARKET','Яндекс Маркет',ARRAY['market.yandex.ru'],'manual',true),
('TAOBAO','Taobao',ARRAY['taobao.com','www.taobao.com','item.taobao.com'],'manual',true);
INSERT INTO "MarketplacePurchaseSettings" ("id","updatedAt") VALUES ('singleton',CURRENT_TIMESTAMP);
