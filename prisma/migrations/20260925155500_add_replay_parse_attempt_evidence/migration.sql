-- Shared schema parity with api-prodn Alembic d8d5f83c2b1a.
-- Prisma and Alembic intentionally coexist against the same table.

ALTER TABLE "replay_parse_attempts"
  ADD COLUMN IF NOT EXISTS "evidence" JSONB;
