ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "is_seed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "seed_batch" TEXT,
ADD COLUMN IF NOT EXISTS "seed_persona" JSONB;

ALTER TABLE "user_videos"
ADD COLUMN IF NOT EXISTS "is_seed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "seed_batch" TEXT;

CREATE INDEX IF NOT EXISTS "users_is_seed_createdAt_idx" ON "users"("is_seed", "createdAt");
CREATE INDEX IF NOT EXISTS "user_videos_is_seed_idx" ON "user_videos"("is_seed");
