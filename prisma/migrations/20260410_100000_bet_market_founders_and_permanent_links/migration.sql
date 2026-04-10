ALTER TABLE "bet_markets"
  ADD COLUMN IF NOT EXISTS "linked_session_key" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "linked_game_stats_id" INTEGER;

CREATE INDEX IF NOT EXISTS "ix_bet_markets_linked_session_key"
  ON "bet_markets"("linked_session_key");

CREATE INDEX IF NOT EXISTS "ix_bet_markets_linked_game_stats_id"
  ON "bet_markets"("linked_game_stats_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bet_markets_linked_game_stats_id_fkey'
  ) THEN
    ALTER TABLE "bet_markets"
      ADD CONSTRAINT "bet_markets_linked_game_stats_id_fkey"
      FOREIGN KEY ("linked_game_stats_id")
      REFERENCES "game_stats"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

ALTER TABLE "pending_wolo_claims"
  ADD COLUMN IF NOT EXISTS "claim_kind" VARCHAR(40) NOT NULL DEFAULT 'bet_payout',
  ADD COLUMN IF NOT EXISTS "claim_group_key" VARCHAR(80) NOT NULL DEFAULT 'market',
  ADD COLUMN IF NOT EXISTS "target_scope" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "source_founder_bonus_id" INTEGER;

DROP INDEX IF EXISTS "uq_pending_wolo_claims_market_player";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_pending_wolo_claims_market_player_kind_group"
  ON "pending_wolo_claims"("source_market_id", "normalized_player_name", "claim_kind", "claim_group_key");

CREATE INDEX IF NOT EXISTS "ix_pending_wolo_claims_source_founder_bonus_id"
  ON "pending_wolo_claims"("source_founder_bonus_id");

CREATE TABLE IF NOT EXISTS "bet_market_founder_bonuses" (
  "id" SERIAL NOT NULL,
  "market_id" INTEGER NOT NULL,
  "bonus_type" VARCHAR(24) NOT NULL,
  "total_amount_wolo" INTEGER NOT NULL,
  "note" VARCHAR(160),
  "status" VARCHAR(24) NOT NULL DEFAULT 'armed',
  "created_by_user_id" INTEGER,
  "failure_reason" VARCHAR(255),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(6),
  "rescinded_at" TIMESTAMP(6),
  CONSTRAINT "bet_market_founder_bonuses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_bet_market_founder_bonuses_market_created_at"
  ON "bet_market_founder_bonuses"("market_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_bet_market_founder_bonuses_status_created_at"
  ON "bet_market_founder_bonuses"("status", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bet_market_founder_bonuses_market_id_fkey'
  ) THEN
    ALTER TABLE "bet_market_founder_bonuses"
      ADD CONSTRAINT "bet_market_founder_bonuses_market_id_fkey"
      FOREIGN KEY ("market_id")
      REFERENCES "bet_markets"("id")
      ON DELETE CASCADE
      ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'bet_market_founder_bonuses_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE "bet_market_founder_bonuses"
      ADD CONSTRAINT "bet_market_founder_bonuses_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pending_wolo_claims_source_founder_bonus_id_fkey'
  ) THEN
    ALTER TABLE "pending_wolo_claims"
      ADD CONSTRAINT "pending_wolo_claims_source_founder_bonus_id_fkey"
      FOREIGN KEY ("source_founder_bonus_id")
      REFERENCES "bet_market_founder_bonuses"("id")
      ON DELETE SET NULL
      ON UPDATE NO ACTION;
  END IF;
END $$;
