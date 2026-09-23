-- Channels: one voice, many readers. Additive -- every existing room stays a GROUP.
ALTER TYPE "ChatRoomKind" ADD VALUE 'CHANNEL';

ALTER TABLE "ChatRoom" ADD COLUMN "description" VARCHAR(500);
ALTER TABLE "ChatRoom" ADD COLUMN "sellerId" TEXT;

ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_sellerId_fkey"
  FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Discovery lists channels by how alive they are, and a shop's own channels are read together.
CREATE INDEX "ChatRoom_kind_lastMessageAt_idx" ON "ChatRoom"("kind","lastMessageAt");
CREATE INDEX "ChatRoom_sellerId_idx" ON "ChatRoom"("sellerId");
