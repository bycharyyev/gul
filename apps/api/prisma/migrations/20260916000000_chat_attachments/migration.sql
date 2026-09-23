-- Chat attachments: photos, video and documents sent inside a conversation.
-- Additive only (all nullable, no defaults to backfill), so the previous image keeps working
-- against this schema and an automatic rollback stays safe.
ALTER TABLE "ChatMessage"
  ADD COLUMN "attachmentUrl"  TEXT,
  ADD COLUMN "attachmentName" VARCHAR(120),
  ADD COLUMN "attachmentMime" VARCHAR(120),
  ADD COLUMN "attachmentSize" INTEGER;

ALTER TABLE "SupportMessage"
  ADD COLUMN "attachmentUrl"  TEXT,
  ADD COLUMN "attachmentName" VARCHAR(120),
  ADD COLUMN "attachmentMime" VARCHAR(120),
  ADD COLUMN "attachmentSize" INTEGER;
