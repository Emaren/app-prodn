-- These columns already exist on the current production database from the
-- June precise-reward rollout. This migration makes that runtime state
-- reconstructable from Git and remains idempotent on the existing database.
--
-- The governed automatic additive lane requires newly declared columns on
-- pre-existing tables to remain nullable at migration time. Production is
-- already stricter: all five live columns are BIGINT NOT NULL DEFAULT 0.
-- Keeping the additive declarations nullable therefore weakens nothing live,
-- while allowing a clean historical migration frontier to be recorded.

ALTER TABLE "staking_positions"
  ADD COLUMN IF NOT EXISTS "micro_reward_carry_uwolo" BIGINT DEFAULT 0;

ALTER TABLE "staking_reward_allocations"
  ADD COLUMN IF NOT EXISTS "reward_uwolo" BIGINT DEFAULT 0;

ALTER TABLE "staking_reward_distributions"
  ADD COLUMN IF NOT EXISTS "betting_fee_pool_uwolo" BIGINT DEFAULT 0;

ALTER TABLE "staking_reward_distributions"
  ADD COLUMN IF NOT EXISTS "staker_pool_uwolo" BIGINT DEFAULT 0;

ALTER TABLE "staking_reward_distributions"
  ADD COLUMN IF NOT EXISTS "treasury_pool_uwolo" BIGINT DEFAULT 0;

-- Preserve exact existing values when present; reconstruct whole-WOLO legacy
-- rows only where the precise mirror was never populated.
UPDATE "staking_reward_allocations"
SET "reward_uwolo" = "reward_wolo"::BIGINT * 1000000
WHERE "reward_uwolo" = 0
  AND "reward_wolo" <> 0;

UPDATE "staking_reward_distributions"
SET
  "betting_fee_pool_uwolo" =
    CASE WHEN "betting_fee_pool_uwolo" = 0
      THEN "betting_fee_pool_wolo"::BIGINT * 1000000
      ELSE "betting_fee_pool_uwolo"
    END,
  "staker_pool_uwolo" =
    CASE WHEN "staker_pool_uwolo" = 0
      THEN "staker_pool_wolo"::BIGINT * 1000000
      ELSE "staker_pool_uwolo"
    END,
  "treasury_pool_uwolo" =
    CASE WHEN "treasury_pool_uwolo" = 0
      THEN "treasury_pool_wolo"::BIGINT * 1000000
      ELSE "treasury_pool_uwolo"
    END
WHERE
  ("betting_fee_pool_uwolo" = 0 AND "betting_fee_pool_wolo" <> 0)
  OR ("staker_pool_uwolo" = 0 AND "staker_pool_wolo" <> 0)
  OR ("treasury_pool_uwolo" = 0 AND "treasury_pool_wolo" <> 0);
