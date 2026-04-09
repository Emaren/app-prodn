ALTER TABLE "bet_markets"
  ADD COLUMN "settlement_run_id" VARCHAR(128),
  ADD COLUMN "settlement_status" VARCHAR(32),
  ADD COLUMN "settlement_failure_code" VARCHAR(80),
  ADD COLUMN "settlement_detail" VARCHAR(255),
  ADD COLUMN "settlement_attempted_at" TIMESTAMP(6),
  ADD COLUMN "settlement_executed_at" TIMESTAMP(6);

DROP INDEX IF EXISTS "uq_bet_wagers_market_user";

CREATE TABLE "bet_stake_intents" (
  "id" SERIAL NOT NULL,
  "market_id" INTEGER NOT NULL REFERENCES "bet_markets"("id") ON DELETE CASCADE,
  "user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "side" VARCHAR(20) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "wallet_address" VARCHAR(100),
  "wallet_provider" VARCHAR(32),
  "wallet_type" VARCHAR(32),
  "browser_info" VARCHAR(255),
  "route_path" VARCHAR(160),
  "status" VARCHAR(32) NOT NULL DEFAULT 'awaiting_signature',
  "stake_tx_hash" VARCHAR(128),
  "error_detail" VARCHAR(255),
  "verified_at" TIMESTAMP(6),
  "recorded_at" TIMESTAMP(6),
  "orphaned_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bet_stake_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_bet_stake_intents_stake_tx_hash"
  ON "bet_stake_intents"("stake_tx_hash");

CREATE INDEX "ix_bet_stake_intents_user_status_updated_at"
  ON "bet_stake_intents"("user_id", "status", "updated_at");

CREATE INDEX "ix_bet_stake_intents_market_status_updated_at"
  ON "bet_stake_intents"("market_id", "status", "updated_at");

ALTER TABLE "bet_wagers"
  ADD COLUMN "stake_intent_id" INTEGER,
  ADD COLUMN "payout_tx_hash" VARCHAR(128),
  ADD COLUMN "payout_proof_url" VARCHAR(500);

CREATE UNIQUE INDEX "uq_bet_wagers_stake_intent_id"
  ON "bet_wagers"("stake_intent_id");

CREATE INDEX "ix_bet_wagers_market_user_side_status"
  ON "bet_wagers"("market_id", "user_id", "side", "status");

ALTER TABLE "bet_wagers"
  ADD CONSTRAINT "bet_wagers_stake_intent_id_fkey"
  FOREIGN KEY ("stake_intent_id") REFERENCES "bet_stake_intents"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE "pending_wolo_claims"
  ADD COLUMN "payout_proof_url" VARCHAR(500);
