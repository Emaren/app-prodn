CREATE TABLE IF NOT EXISTS "pending_wolo_claims" (
  "id" SERIAL PRIMARY KEY,
  "normalized_player_name" VARCHAR(64) NOT NULL,
  "display_player_name" VARCHAR(100) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "source_market_id" INTEGER,
  "source_game_stats_id" INTEGER,
  "claimed_by_user_id" INTEGER,
  "rescinded_by_user_id" INTEGER,
  "note" VARCHAR(160),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimed_at" TIMESTAMP(6),
  "rescinded_at" TIMESTAMP(6)
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_pending_wolo_claims_market_player"
  ON "pending_wolo_claims" ("source_market_id", "normalized_player_name");

CREATE INDEX IF NOT EXISTS "ix_pending_wolo_claims_name_status"
  ON "pending_wolo_claims" ("normalized_player_name", "status");

CREATE INDEX IF NOT EXISTS "ix_pending_wolo_claims_claimed_by_status"
  ON "pending_wolo_claims" ("claimed_by_user_id", "status");

CREATE INDEX IF NOT EXISTS "ix_pending_wolo_claims_source_market_id"
  ON "pending_wolo_claims" ("source_market_id");

CREATE INDEX IF NOT EXISTS "ix_pending_wolo_claims_source_game_stats_id"
  ON "pending_wolo_claims" ("source_game_stats_id");
