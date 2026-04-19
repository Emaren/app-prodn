ALTER TABLE "scheduled_matches"
  ALTER COLUMN "status" SET DEFAULT 'proposed',
  ADD COLUMN "wager_amount_wolo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "guarantee_amount_wolo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "challenger_funding_tx_hash" VARCHAR(128),
  ADD COLUMN "challenger_funding_wallet_address" VARCHAR(100),
  ADD COLUMN "challenger_funded_at" TIMESTAMP(6),
  ADD COLUMN "challenged_funding_tx_hash" VARCHAR(128),
  ADD COLUMN "challenged_funding_wallet_address" VARCHAR(100),
  ADD COLUMN "challenged_funded_at" TIMESTAMP(6),
  ADD COLUMN "challenger_checked_in_at" TIMESTAMP(6),
  ADD COLUMN "challenged_checked_in_at" TIMESTAMP(6),
  ADD COLUMN "live_confirmed_at" TIMESTAMP(6),
  ADD COLUMN "settlement_ready_at" TIMESTAMP(6);

CREATE INDEX "ix_scheduled_matches_status_updated_at"
  ON "scheduled_matches"("status", "updated_at");

CREATE INDEX "ix_scheduled_matches_settlement_ready_at"
  ON "scheduled_matches"("settlement_ready_at");
