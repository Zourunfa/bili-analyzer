-- AlterTable
ALTER TABLE "notebooks"
ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "rule" JSONB;

-- CreateIndex
CREATE INDEX "notebooks_userId_mode_idx" ON "notebooks"("userId", "mode");

-- CreateTable
CREATE TABLE "video_timestamp_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "timestamp_sec" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "source_text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_timestamp_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_timestamp_notes_user_id_video_id_timestamp_sec_idx"
ON "video_timestamp_notes"("user_id", "video_id", "timestamp_sec");

-- CreateIndex
CREATE INDEX "video_timestamp_notes_video_id_idx"
ON "video_timestamp_notes"("video_id");

-- AddForeignKey
ALTER TABLE "video_timestamp_notes"
ADD CONSTRAINT "video_timestamp_notes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_timestamp_notes"
ADD CONSTRAINT "video_timestamp_notes_video_id_fkey"
FOREIGN KEY ("video_id") REFERENCES "videos"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "video_tags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "video_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_tags_user_id_name_key"
ON "video_tags"("user_id", "name");

-- CreateIndex
CREATE INDEX "video_tags_user_id_createdAt_idx"
ON "video_tags"("user_id", "createdAt");

-- AddForeignKey
ALTER TABLE "video_tags"
ADD CONSTRAINT "video_tags_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "video_tag_relations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "video_tag_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "video_tag_relations_user_id_video_id_tag_id_key"
ON "video_tag_relations"("user_id", "video_id", "tag_id");

-- CreateIndex
CREATE INDEX "video_tag_relations_user_id_tag_id_idx"
ON "video_tag_relations"("user_id", "tag_id");

-- CreateIndex
CREATE INDEX "video_tag_relations_video_id_idx"
ON "video_tag_relations"("video_id");

-- AddForeignKey
ALTER TABLE "video_tag_relations"
ADD CONSTRAINT "video_tag_relations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_tag_relations"
ADD CONSTRAINT "video_tag_relations_video_id_fkey"
FOREIGN KEY ("video_id") REFERENCES "videos"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_tag_relations"
ADD CONSTRAINT "video_tag_relations_tag_id_fkey"
FOREIGN KEY ("tag_id") REFERENCES "video_tags"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
