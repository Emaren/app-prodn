-- Challenge lifecycle v2 separates invitation expiry, funding expiry, play runway,
-- and exact match scheduling. scheduled_at remains as a legacy compatibility shadow
-- so older code/data can be migrated without a destructive nullability change.

ALTER TABLE "scheduled_matches"
  ADD COLUMN IF NOT EXISTS "timing_mode" VARCHAR(16) NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS "accept_by" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "fund_by" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "play_by" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "match_time" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "match_time_proposed_by_user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "match_time_confirmed_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "reconciled_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "creation_request_id" VARCHAR(128);

-- Legacy rows were all created through the exact-time scheduler. Preserve that truth.
UPDATE "scheduled_matches"
SET
  "timing_mode" = COALESCE(NULLIF("timing_mode", ''), 'scheduled'),
  "match_time" = COALESCE("match_time", "scheduled_at"),
  "match_time_confirmed_at" = COALESCE("match_time_confirmed_at", "created_at"),
  "accept_by" = COALESCE("accept_by", "scheduled_at")
WHERE "match_time" IS NULL
   OR "accept_by" IS NULL
   OR "match_time_confirmed_at" IS NULL;

-- Historical accepted/funded rows get conservative lifecycle deadlines only when absent.
UPDATE "scheduled_matches"
SET "fund_by" = COALESCE("fund_by", "accepted_at" + INTERVAL '1 hour')
WHERE "accepted_at" IS NOT NULL
  AND "fund_by" IS NULL;

UPDATE "scheduled_matches"
SET "play_by" = COALESCE(
  "play_by",
  GREATEST(
    COALESCE("challenger_funded_at", "created_at"),
    COALESCE("challenged_funded_at", "created_at")
  ) + INTERVAL '30 days'
)
WHERE "challenger_funded_at" IS NOT NULL
  AND "challenged_funded_at" IS NOT NULL
  AND "play_by" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_matches_creation_request_id"
  ON "scheduled_matches"("creation_request_id");

CREATE INDEX IF NOT EXISTS "ix_scheduled_matches_status_accept_by"
  ON "scheduled_matches"("status", "accept_by");
CREATE INDEX IF NOT EXISTS "ix_scheduled_matches_status_fund_by"
  ON "scheduled_matches"("status", "fund_by");
CREATE INDEX IF NOT EXISTS "ix_scheduled_matches_status_play_by"
  ON "scheduled_matches"("status", "play_by");

-- Helpful guardrails for the new canonical lifecycle columns.
ALTER TABLE "scheduled_matches"
  DROP CONSTRAINT IF EXISTS "ck_scheduled_matches_timing_mode";
ALTER TABLE "scheduled_matches"
  ADD CONSTRAINT "ck_scheduled_matches_timing_mode"
  CHECK ("timing_mode" IN ('open', 'scheduled'));

-- Canonical, cross-challenge funding proof registry. A chain transaction may fund
-- exactly one challenge side, preventing retry/concurrency races from attaching
-- the same deposit to multiple challenges.
CREATE TABLE IF NOT EXISTS "scheduled_match_funding_proofs" (
  "id" SERIAL PRIMARY KEY,
  "scheduled_match_id" INTEGER NOT NULL REFERENCES "scheduled_matches"("id") ON DELETE CASCADE,
  "participant_side" VARCHAR(8) NOT NULL,
  "tx_hash" VARCHAR(128) NOT NULL,
  "wallet_address" VARCHAR(100) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_scheduled_match_funding_proofs_side" CHECK ("participant_side" IN ('left', 'right'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_match_funding_proofs_tx_hash"
  ON "scheduled_match_funding_proofs"("tx_hash");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_match_funding_proofs_match_side"
  ON "scheduled_match_funding_proofs"("scheduled_match_id", "participant_side");
CREATE INDEX IF NOT EXISTS "ix_scheduled_match_funding_proofs_match"
  ON "scheduled_match_funding_proofs"("scheduled_match_id");

INSERT INTO "scheduled_match_funding_proofs"
  ("scheduled_match_id", "participant_side", "tx_hash", "wallet_address", "amount_wolo", "created_at")
SELECT "id", 'left', "challenger_funding_tx_hash", COALESCE("challenger_funding_wallet_address", ''),
       "wager_amount_wolo" + "guarantee_amount_wolo", COALESCE("challenger_funded_at", "created_at")
FROM "scheduled_matches"
WHERE "challenger_funding_tx_hash" IS NOT NULL
UNION ALL
SELECT "id", 'right', "challenged_funding_tx_hash", COALESCE("challenged_funding_wallet_address", ''),
       "wager_amount_wolo" + "guarantee_amount_wolo", COALESCE("challenged_funded_at", "created_at")
FROM "scheduled_matches"
WHERE "challenged_funding_tx_hash" IS NOT NULL
ON CONFLICT DO NOTHING;


-- Settlement retry metadata keeps automatic reconciliation bounded and fair.
ALTER TABLE "scheduled_match_settlements"
  ADD COLUMN IF NOT EXISTS "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_attempt_at" TIMESTAMP(6);

CREATE INDEX IF NOT EXISTS "ix_scheduled_match_settlements_status_last_attempt_at"
  ON "scheduled_match_settlements"("status", "last_attempt_at");
