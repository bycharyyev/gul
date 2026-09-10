-- Additive and nullable: existing rows stay valid, and a rollback to the previous image simply
-- stops honouring the grace rather than breaking on an unknown column.
ALTER TABLE "RefreshToken" ADD COLUMN "graceUsedAt" TIMESTAMP(3);
