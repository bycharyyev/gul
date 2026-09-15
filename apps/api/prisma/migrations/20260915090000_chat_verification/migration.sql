CREATE TYPE "ChatVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "ChatVerification" (
  "id" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "status" "ChatVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "note" VARCHAR(500),
  "reviewedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChatVerification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatVerification_roomId_key" UNIQUE ("roomId"),
  CONSTRAINT "ChatVerification_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatVerification_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ChatVerification_status_createdAt_idx" ON "ChatVerification"("status", "createdAt");
