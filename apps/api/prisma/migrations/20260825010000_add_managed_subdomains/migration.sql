-- CreateEnum
CREATE TYPE "SubdomainStatus" AS ENUM ('PENDING', 'ACTIVE', 'FAILED', 'REMOVED');

-- CreateTable
CREATE TABLE "ManagedSubdomain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetPort" INTEGER NOT NULL,
    "status" "SubdomainStatus" NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedSubdomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManagedSubdomain_name_key" ON "ManagedSubdomain"("name");
