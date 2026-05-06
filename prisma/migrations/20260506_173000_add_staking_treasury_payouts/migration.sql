ALTER TABLE "staking_reward_distributions"
  ADD COLUMN "treasury_payout_status" VARCHAR(24) NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN "treasury_payout_request_id" VARCHAR(128),
  ADD COLUMN "treasury_payout_tx_hash" VARCHAR(100),
  ADD COLUMN "treasury_payout_attempted_at" TIMESTAMP(6),
  ADD COLUMN "treasury_payout_executed_at" TIMESTAMP(6),
  ADD COLUMN "treasury_payout_error" TEXT;

UPDATE "staking_reward_distributions"
SET "treasury_payout_request_id" =
  'aoe2-staking-treasury-' || to_char("distribution_date", 'YYYY-MM-DD') || ':community'
WHERE "treasury_payout_request_id" IS NULL;

ALTER TABLE "staking_reward_distributions"
  ALTER COLUMN "treasury_payout_request_id" SET NOT NULL;

CREATE UNIQUE INDEX "uq_staking_reward_distributions_treasury_request"
  ON "staking_reward_distributions"("treasury_payout_request_id");

CREATE INDEX "ix_staking_reward_distributions_treasury_status_date"
  ON "staking_reward_distributions"("treasury_payout_status", "distribution_date");

CREATE INDEX "ix_staking_reward_distributions_treasury_tx_hash"
  ON "staking_reward_distributions"("treasury_payout_tx_hash");
