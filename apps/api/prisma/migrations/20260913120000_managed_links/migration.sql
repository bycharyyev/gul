-- A short, admin-editable redirect (gulyaly.pro/l/<slug> -> targetUrl). The target is a bare
-- URL rather than a product/promo union on purpose: staff repoint the same shared link later
-- without reprinting it anywhere it was already handed out.
CREATE TABLE "ManagedLink" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "label" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagedLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ManagedLink_slug_key" ON "ManagedLink"("slug");

CREATE INDEX "ManagedLink_isEnabled_idx" ON "ManagedLink"("isEnabled");
