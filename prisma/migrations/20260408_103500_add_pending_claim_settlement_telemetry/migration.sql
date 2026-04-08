ALTER TABLE "pending_wolo_claims"
  ADD COLUMN "payout_tx_hash" VARCHAR(128),
  ADD COLUMN "error_state" VARCHAR(255),
  ADD COLUMN "payout_attempted_at" TIMESTAMP(6);
