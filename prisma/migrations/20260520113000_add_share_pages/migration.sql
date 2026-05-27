-- CreateTable
CREATE TABLE "share_pages" (
    "id" TEXT NOT NULL,
    "share_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_image" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_pages_share_id_key" ON "share_pages"("share_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_pages_user_id_target_type_target_id_key" ON "share_pages"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "share_pages_target_type_target_id_idx" ON "share_pages"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "share_pages_visibility_updatedAt_idx" ON "share_pages"("visibility", "updatedAt");

-- AddForeignKey
ALTER TABLE "share_pages" ADD CONSTRAINT "share_pages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
