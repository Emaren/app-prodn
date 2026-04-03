ALTER TABLE "scheduled_matches"
  ADD COLUMN "result_at" TIMESTAMP(6),
  ADD COLUMN "linked_session_key" VARCHAR(255),
  ADD COLUMN "linked_map_name" VARCHAR(120),
  ADD COLUMN "linked_winner" VARCHAR(100),
  ADD COLUMN "linked_duration_seconds" INTEGER;

ALTER TABLE "bet_markets"
  ADD COLUMN "scheduled_match_id" INTEGER;

ALTER TABLE "bet_wagers"
  ADD COLUMN "payout_wolo" INTEGER;

UPDATE "bet_markets"
SET "scheduled_match_id" = CAST(SUBSTRING("slug" FROM LENGTH('challenge-runway-') + 1) AS INTEGER)
WHERE "slug" LIKE 'challenge-runway-%'
  AND SUBSTRING("slug" FROM LENGTH('challenge-runway-') + 1) ~ '^[0-9]+$';

CREATE UNIQUE INDEX "uq_bet_markets_scheduled_match_id"
  ON "bet_markets"("scheduled_match_id");

CREATE INDEX "ix_scheduled_matches_status_result_at"
  ON "scheduled_matches"("status", "result_at");

ALTER TABLE "bet_markets"
  ADD CONSTRAINT "bet_markets_scheduled_match_id_fkey"
  FOREIGN KEY ("scheduled_match_id")
  REFERENCES "scheduled_matches"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;
