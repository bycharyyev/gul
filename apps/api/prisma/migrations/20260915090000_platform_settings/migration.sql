-- A singleton settings row (always id "singleton") -- the admin panel's own Telegram link,
-- mirroring Seller.telegramChatId / telegramLinkCode but for the platform as a whole.
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "adminTelegramChatId" TEXT,
    "adminTelegramLinkCode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);
