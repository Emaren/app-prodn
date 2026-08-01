BEGIN;

ALTER TABLE "ai_agents"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "ai_agents"
  ADD CONSTRAINT "ck_ai_agents_version"
  CHECK ("version" >= 1);

COMMENT ON COLUMN "ai_agents"."version" IS
  'Integer optimistic-lock revision for admin edits; avoids lossy TIMESTAMP(6) round-trips through JavaScript Date.';

COMMIT;
