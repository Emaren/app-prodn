ALTER TABLE "bet_wagers"
  ADD COLUMN "execution_mode" VARCHAR(20) NOT NULL DEFAULT 'app_only',
  ADD COLUMN "stake_tx_hash" VARCHAR(128),
  ADD COLUMN "stake_wallet_address" VARCHAR(100),
  ADD COLUMN "stake_locked_at" TIMESTAMP(6);

CREATE UNIQUE INDEX "uq_bet_wagers_stake_tx_hash"
  ON "bet_wagers"("stake_tx_hash");
