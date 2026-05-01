-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_user_id_video_id_createdAt_idx"
ON "chat_messages"("user_id", "video_id", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_video_id_idx"
ON "chat_messages"("video_id");

-- AddForeignKey
ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_messages_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages"
ADD CONSTRAINT "chat_messages_video_id_fkey"
FOREIGN KEY ("video_id") REFERENCES "videos"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
