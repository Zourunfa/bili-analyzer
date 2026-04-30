# Knowledge Workflow Migration Guide

## Scope

Migration: `20260425103000_add_notes_tags_smart_notebooks`

Changes:
- Add notebook smart mode fields: `notebooks.mode`, `notebooks.rule`
- Add `video_timestamp_notes`
- Add `video_tags`
- Add `video_tag_relations`

## Apply

Because current local environment may fail `prisma migrate dev` shadow DB with pgvector, apply using normal deploy flow:

```bash
npx prisma migrate deploy
```

If deploy cannot run in your environment, manually execute:

```bash
psql "$DATABASE_URL" -f prisma/migrations/20260425103000_add_notes_tags_smart_notebooks/migration.sql
```

Then regenerate client:

```bash
npx prisma generate
```

## Rollback

Run the following SQL in order:

```sql
DROP TABLE IF EXISTS "video_tag_relations";
DROP TABLE IF EXISTS "video_tags";
DROP TABLE IF EXISTS "video_timestamp_notes";

DROP INDEX IF EXISTS "notebooks_userId_mode_idx";
ALTER TABLE "notebooks"
  DROP COLUMN IF EXISTS "rule",
  DROP COLUMN IF EXISTS "mode";
```

## Verification

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='notebooks' AND column_name IN ('mode','rule');

SELECT to_regclass('public.video_timestamp_notes') AS notes_table;
SELECT to_regclass('public.video_tags') AS tags_table;
SELECT to_regclass('public.video_tag_relations') AS tag_rel_table;
```

