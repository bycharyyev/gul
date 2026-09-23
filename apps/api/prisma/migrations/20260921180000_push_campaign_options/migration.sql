-- Delivery options and repeating schedules for push campaigns.
ALTER TABLE "PushCampaign" ADD COLUMN "priority" VARCHAR(8) NOT NULL DEFAULT 'high';
ALTER TABLE "PushCampaign" ADD COLUMN "ttlHours" INTEGER NOT NULL DEFAULT 24;
ALTER TABLE "PushCampaign" ADD COLUMN "repeat" VARCHAR(8) NOT NULL DEFAULT 'NONE';
ALTER TABLE "PushCampaign" ADD COLUMN "repeatUntil" TIMESTAMP(3);
ALTER TABLE "PushCampaign" ADD COLUMN "seriesId" TEXT;

-- A repeating campaign creates its next occurrence when a run finishes; the pair below makes sure the
-- same occurrence can never be created twice.
CREATE UNIQUE INDEX "PushCampaign_seriesId_scheduledAt_key" ON "PushCampaign"("seriesId", "scheduledAt");
CREATE INDEX "PushCampaign_seriesId_idx" ON "PushCampaign"("seriesId");
