-- migration-policy: expand-safe
CREATE TYPE "SocialPostMediaType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO');
CREATE TYPE "SocialPostStatus" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'HIDDEN');
CREATE TYPE "SocialInteractionType" AS ENUM ('VIEW', 'LIKE', 'SAVE', 'PRODUCT_CLICK');
CREATE TYPE "SocialCommentStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');

CREATE TABLE "SocialPost" (
  "id" TEXT NOT NULL, "authorId" TEXT NOT NULL, "body" VARCHAR(1500),
  "mediaType" "SocialPostMediaType" NOT NULL DEFAULT 'TEXT', "mediaUrl" TEXT,
  "thumbnailUrl" TEXT, "status" "SocialPostStatus" NOT NULL DEFAULT 'PENDING',
  "moderationNote" TEXT, "publishedAt" TIMESTAMP(3), "likeCount" INTEGER NOT NULL DEFAULT 0,
  "saveCount" INTEGER NOT NULL DEFAULT 0, "viewCount" INTEGER NOT NULL DEFAULT 0,
  "productClickCount" INTEGER NOT NULL DEFAULT 0, "commentCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPostProduct" (
  "postId" TEXT NOT NULL, "productId" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SocialPostProduct_pkey" PRIMARY KEY ("postId", "productId")
);
CREATE TABLE "SocialInteraction" (
  "postId" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" "SocialInteractionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SocialInteraction_pkey" PRIMARY KEY ("postId", "userId", "type")
);
CREATE TABLE "SocialComment" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "userId" TEXT NOT NULL, "body" VARCHAR(600) NOT NULL,
  "status" "SocialCommentStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SocialPostReport" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "userId" TEXT NOT NULL, "reason" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SocialPostReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SocialPost_status_publishedAt_id_idx" ON "SocialPost"("status", "publishedAt", "id");
CREATE INDEX "SocialPost_authorId_createdAt_idx" ON "SocialPost"("authorId", "createdAt");
CREATE INDEX "SocialPostProduct_productId_idx" ON "SocialPostProduct"("productId");
CREATE INDEX "SocialInteraction_userId_type_createdAt_idx" ON "SocialInteraction"("userId", "type", "createdAt");
CREATE INDEX "SocialComment_postId_status_createdAt_idx" ON "SocialComment"("postId", "status", "createdAt");
CREATE INDEX "SocialComment_userId_createdAt_idx" ON "SocialComment"("userId", "createdAt");
CREATE UNIQUE INDEX "SocialPostReport_postId_userId_key" ON "SocialPostReport"("postId", "userId");
CREATE INDEX "SocialPostReport_postId_createdAt_idx" ON "SocialPostReport"("postId", "createdAt");
ALTER TABLE "SocialPost" ADD CONSTRAINT "SocialPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialPostProduct" ADD CONSTRAINT "SocialPostProduct_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostProduct" ADD CONSTRAINT "SocialPostProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "GalleryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SocialInteraction" ADD CONSTRAINT "SocialInteraction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialInteraction" ADD CONSTRAINT "SocialInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialComment" ADD CONSTRAINT "SocialComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostReport" ADD CONSTRAINT "SocialPostReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "SocialPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialPostReport" ADD CONSTRAINT "SocialPostReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
