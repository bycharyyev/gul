-- A group's share link carries this, not the room id. Nullable: every existing room predates
-- invites, and channels never get one -- an audience joins from the channel list, not a link
-- somebody forwarded.
ALTER TABLE "ChatRoom" ADD COLUMN "inviteCode" VARCHAR(24);

-- Unique so a code resolves to exactly one room, and indexed by the same constraint: joining
-- looks a room up by this column and nothing else.
CREATE UNIQUE INDEX "ChatRoom_inviteCode_key" ON "ChatRoom"("inviteCode");

-- Owner-scoped lookups: the cap on how many groups one person may create counts through it.
CREATE INDEX "ChatRoom_createdById_idx" ON "ChatRoom"("createdById");
