-- Per-key request quota, in requests per minute.
--
-- Nullable on purpose: NULL means "use the partner tier default" rather than "unlimited", so an
-- existing key keeps working unchanged and a limit is only ever set deliberately.
ALTER TABLE "ApiKey" ADD COLUMN "rateLimitPerMin" INTEGER;
