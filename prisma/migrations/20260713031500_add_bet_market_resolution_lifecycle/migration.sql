ALTER TABLE "bet_markets"
  ADD COLUMN IF NOT EXISTS "resolution_reason" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "proof_deadline_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "refund_status" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "commissioner_review_state" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "late_final_game_stats_id" INTEGER;

CREATE INDEX IF NOT EXISTS "ix_bet_markets_status_proof_deadline"
  ON "bet_markets"("status", "proof_deadline_at");

COMMENT ON COLUMN "bet_markets"."resolution_reason" IS
  'Auditable terminal/proof reason such as final_replay_not_received or explicit_desync_without_safe_winner.';
COMMENT ON COLUMN "bet_markets"."proof_deadline_at" IS
  'Authoritative grace deadline derived from replay/session activity, never bet market updated_at.';
COMMENT ON COLUMN "bet_markets"."refund_status" IS
  'queued, processing, refunded, or failed; never inferred solely from wager payout amount.';
