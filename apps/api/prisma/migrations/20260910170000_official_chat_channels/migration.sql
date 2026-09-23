ALTER TABLE "ChatRoom" ADD COLUMN "officialCategory" VARCHAR(24);
CREATE UNIQUE INDEX "ChatRoom_officialCategory_key" ON "ChatRoom"("officialCategory");
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_official_category_check"
CHECK ("officialCategory" IS NULL OR ("officialCategory" IN ('NEWS', 'PROMOTIONS', 'SECURITY') AND "kind" = 'CHANNEL' AND "sellerId" IS NULL));
