ALTER TABLE "notebooks"
ADD COLUMN IF NOT EXISTS "is_seed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "seed_batch" TEXT;

ALTER TABLE "notebook_videos"
ADD COLUMN IF NOT EXISTS "is_seed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "seed_batch" TEXT;

ALTER TABLE "chat_messages"
ADD COLUMN IF NOT EXISTS "is_seed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "seed_batch" TEXT;

CREATE INDEX IF NOT EXISTS "notebooks_is_seed_idx" ON "notebooks"("is_seed");
CREATE INDEX IF NOT EXISTS "notebook_videos_is_seed_idx" ON "notebook_videos"("is_seed");
CREATE INDEX IF NOT EXISTS "chat_messages_is_seed_idx" ON "chat_messages"("is_seed");
