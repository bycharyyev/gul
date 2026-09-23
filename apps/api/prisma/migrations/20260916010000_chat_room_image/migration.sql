-- A picture for a group or channel. Additive and nullable: rooms without one keep rendering the
-- initial-letter avatar the clients already draw.
ALTER TABLE "ChatRoom" ADD COLUMN "imageUrl" TEXT;
