ALTER TABLE "staking_positions"
  ADD COLUMN IF NOT EXISTS "auto_compound_rewards" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "compounded_rewards_wolo" INTEGER NOT NULL DEFAULT 0;
