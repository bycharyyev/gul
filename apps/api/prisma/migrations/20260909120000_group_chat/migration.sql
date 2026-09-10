-- Group conversations. Additive: nothing existing is touched, and SupportThread keeps carrying
-- the platform and seller inboxes exactly as before -- see the schema comment for why the two
-- were not merged.
CREATE TYPE "ChatRoomKind" AS ENUM ('GROUP');

CREATE TABLE "ChatRoom" (
  "id" TEXT NOT NULL,
  "kind" "ChatRoomKind" NOT NULL DEFAULT 'GROUP',
  "title" VARCHAR(120) NOT NULL,
  "createdById" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChatMember" (
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("roomId","userId")
);

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- The inbox orders by recency, the membership lookup answers "which rooms am I in", and messages
-- are always read newest-first within one room.
CREATE INDEX "ChatRoom_lastMessageAt_idx" ON "ChatRoom"("lastMessageAt");
CREATE INDEX "ChatMember_userId_idx" ON "ChatMember"("userId");
CREATE INDEX "ChatMessage_roomId_createdAt_idx" ON "ChatMessage"("roomId","createdAt");

ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
