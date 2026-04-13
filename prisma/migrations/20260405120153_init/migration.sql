-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar" TEXT,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "tags" TEXT[],
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "bvid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pic" TEXT,
    "desc" TEXT,
    "duration" INTEGER NOT NULL,
    "owner_name" TEXT NOT NULL,
    "owner_mid" TEXT NOT NULL,
    "cid" INTEGER,
    "subtitle_text" TEXT NOT NULL,
    "subtitle_source" TEXT NOT NULL DEFAULT 'cc',
    "summary" TEXT,
    "knowledge_extracted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_videos" (
    "id" TEXT NOT NULL,
    "notebook_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notebook_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_points" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "knowledge_point_id" TEXT NOT NULL,
    "vector" vector(1024) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "up_profiles" (
    "id" TEXT NOT NULL,
    "mid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "face" TEXT,
    "sign" TEXT,
    "video_count" INTEGER,
    "last_synced_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "up_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "notebooks_userId_idx" ON "notebooks"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "videos_bvid_key" ON "videos"("bvid");

-- CreateIndex
CREATE INDEX "videos_owner_mid_idx" ON "videos"("owner_mid");

-- CreateIndex
CREATE INDEX "notebook_videos_notebook_id_idx" ON "notebook_videos"("notebook_id");

-- CreateIndex
CREATE INDEX "notebook_videos_video_id_idx" ON "notebook_videos"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_videos_notebook_id_video_id_key" ON "notebook_videos"("notebook_id", "video_id");

-- CreateIndex
CREATE INDEX "knowledge_points_video_id_idx" ON "knowledge_points"("video_id");

-- CreateIndex
CREATE INDEX "knowledge_points_type_idx" ON "knowledge_points"("type");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_knowledge_point_id_key" ON "embeddings"("knowledge_point_id");

-- CreateIndex
CREATE UNIQUE INDEX "up_profiles_mid_key" ON "up_profiles"("mid");

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_videos" ADD CONSTRAINT "notebook_videos_notebook_id_fkey" FOREIGN KEY ("notebook_id") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_videos" ADD CONSTRAINT "notebook_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_points" ADD CONSTRAINT "knowledge_points_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_knowledge_point_id_fkey" FOREIGN KEY ("knowledge_point_id") REFERENCES "knowledge_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;
