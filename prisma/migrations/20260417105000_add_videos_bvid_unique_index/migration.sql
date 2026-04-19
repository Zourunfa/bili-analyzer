-- Ensure Prisma upsert(where: { bvid }) has a matching unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS "videos_bvid_key" ON "videos"("bvid");
