-- CreateTable
CREATE TABLE "user_videos" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_videos_user_id_video_id_key" ON "user_videos"("user_id", "video_id");

-- CreateIndex
CREATE INDEX "user_videos_user_id_updatedAt_idx" ON "user_videos"("user_id", "updatedAt");

-- CreateIndex
CREATE INDEX "user_videos_video_id_idx" ON "user_videos"("video_id");

-- AddForeignKey
ALTER TABLE "user_videos" ADD CONSTRAINT "user_videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_videos" ADD CONSTRAINT "user_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
