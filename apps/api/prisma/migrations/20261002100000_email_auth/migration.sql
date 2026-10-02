-- Email becomes the sign-in identifier; phone is optional (added later in the profile).
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "phoneBonusAt" TIMESTAMP(3);

CREATE TABLE "PendingRegistration" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ru',
    "attribution" JSONB,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PendingRegistration_email_createdAt_idx" ON "PendingRegistration"("email", "createdAt");

-- Seller applications: the email is the sign-in; the phone is an optional contact.
ALTER TABLE "SellerApplication" ALTER COLUMN "phone" DROP NOT NULL;
