import prisma from "@/lib/db";

let ensurePromise: Promise<void> | null = null;

const ENSURE_SQL = `
ALTER TABLE "notebooks" ADD COLUMN IF NOT EXISTS "mode" TEXT;
UPDATE "notebooks" SET "mode" = 'manual' WHERE "mode" IS NULL;
ALTER TABLE "notebooks" ALTER COLUMN "mode" SET DEFAULT 'manual';
ALTER TABLE "notebooks" ALTER COLUMN "mode" SET NOT NULL;
ALTER TABLE "notebooks" ADD COLUMN IF NOT EXISTS "rule" JSONB;
CREATE INDEX IF NOT EXISTS "notebooks_userId_mode_idx" ON "notebooks"("userId", "mode");

CREATE TABLE IF NOT EXISTS "video_timestamp_notes" (
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
CREATE INDEX IF NOT EXISTS "video_timestamp_notes_user_id_video_id_timestamp_sec_idx"
  ON "video_timestamp_notes"("user_id", "video_id", "timestamp_sec");
CREATE INDEX IF NOT EXISTS "video_timestamp_notes_video_id_idx"
  ON "video_timestamp_notes"("video_id");

CREATE TABLE IF NOT EXISTS "video_tags" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "video_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_tags_user_id_name_key"
  ON "video_tags"("user_id", "name");
CREATE INDEX IF NOT EXISTS "video_tags_user_id_createdAt_idx"
  ON "video_tags"("user_id", "createdAt");

CREATE TABLE IF NOT EXISTS "video_tag_relations" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "video_id" TEXT NOT NULL,
  "tag_id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "video_tag_relations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "video_tag_relations_user_id_video_id_tag_id_key"
  ON "video_tag_relations"("user_id", "video_id", "tag_id");
CREATE INDEX IF NOT EXISTS "video_tag_relations_user_id_tag_id_idx"
  ON "video_tag_relations"("user_id", "tag_id");
CREATE INDEX IF NOT EXISTS "video_tag_relations_video_id_idx"
  ON "video_tag_relations"("video_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_timestamp_notes_user_id_fkey'
  ) THEN
    ALTER TABLE "video_timestamp_notes"
      ADD CONSTRAINT "video_timestamp_notes_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_timestamp_notes_video_id_fkey'
  ) THEN
    ALTER TABLE "video_timestamp_notes"
      ADD CONSTRAINT "video_timestamp_notes_video_id_fkey"
      FOREIGN KEY ("video_id") REFERENCES "videos"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_tags_user_id_fkey'
  ) THEN
    ALTER TABLE "video_tags"
      ADD CONSTRAINT "video_tags_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_tag_relations_user_id_fkey'
  ) THEN
    ALTER TABLE "video_tag_relations"
      ADD CONSTRAINT "video_tag_relations_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_tag_relations_video_id_fkey'
  ) THEN
    ALTER TABLE "video_tag_relations"
      ADD CONSTRAINT "video_tag_relations_video_id_fkey"
      FOREIGN KEY ("video_id") REFERENCES "videos"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_tag_relations_tag_id_fkey'
  ) THEN
    ALTER TABLE "video_tag_relations"
      ADD CONSTRAINT "video_tag_relations_tag_id_fkey"
      FOREIGN KEY ("tag_id") REFERENCES "video_tags"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
`;

function extractDbErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const maybe = error as {
    code?: string;
    cause?: { code?: string; originalCode?: string };
    meta?: { driverAdapterError?: { cause?: { code?: string; originalCode?: string } } };
  };
  return (
    maybe.code ||
    maybe.cause?.originalCode ||
    maybe.cause?.code ||
    maybe.meta?.driverAdapterError?.cause?.originalCode ||
    maybe.meta?.driverAdapterError?.cause?.code ||
    ""
  );
}

export function parseKnowledgeSchemaError(error: unknown, fallback: string): { status: number; message: string } {
  const code = extractDbErrorCode(error);
  const message = error instanceof Error ? error.message : String(error || "");
  const schemaMismatch =
    code === "P2021" ||
    code === "P2022" ||
    code === "42703" ||
    code === "42P01" ||
    message.includes("does not exist") ||
    message.includes("Unknown column") ||
    message.includes("ColumnNotFound");

  if (schemaMismatch) {
    return {
      status: 500,
      message: "数据库结构未升级。请执行 `npx prisma migrate deploy`（或 `npx prisma db push`）后重试。",
    };
  }

  return { status: 500, message: fallback };
}

export async function ensureKnowledgeWorkflowSchema(): Promise<void> {
  if (ensurePromise) {
    await ensurePromise;
    return;
  }

  ensurePromise = (async () => {
    await prisma.$executeRawUnsafe(ENSURE_SQL);
  })();

  try {
    await ensurePromise;
  } catch (error) {
    ensurePromise = null;
    throw error;
  }
}

