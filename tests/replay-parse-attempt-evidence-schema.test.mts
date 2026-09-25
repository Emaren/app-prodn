import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(
  new URL("../prisma/schema.prisma", import.meta.url),
  "utf8"
);

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20260925155500_add_replay_parse_attempt_evidence/migration.sql",
    import.meta.url
  ),
  "utf8"
);

test("ReplayParseAttempt exposes optional evidence JSON", () => {
  const model =
    schema.match(/model ReplayParseAttempt \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(model, /playedOn\s+DateTime\?/);
  assert.match(model, /evidence\s+Json\?/);
  assert.match(model, /@@map\("replay_parse_attempts"\)/);
});

test("shared Prisma mirror is additive and idempotent", () => {
  assert.match(
    migration,
    /ALTER TABLE "replay_parse_attempts"[\s\S]*ADD COLUMN IF NOT EXISTS "evidence" JSONB/
  );
  assert.doesNotMatch(migration, /\b(?:DELETE|UPDATE|TRUNCATE)\b/i);
  assert.match(migration, /api-prodn Alembic d8d5f83c2b1a/);
});
