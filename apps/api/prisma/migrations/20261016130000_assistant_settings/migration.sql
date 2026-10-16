-- Admin-editable look of the sign-in assistant (logo, name, status line). One row, id "singleton",
-- created on first read. Defaults match what the storefront showed before: the assistant falls back
-- to its built-in "G" mark and translated name/status whenever a field is empty.
CREATE TABLE "AssistantSettings" (
    "id" TEXT NOT NULL,
    "logoUrl" TEXT,
    "name" TEXT NOT NULL DEFAULT '',
    "statusText" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSettings_pkey" PRIMARY KEY ("id")
);
