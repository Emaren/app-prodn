-- App-side WOLO staking ledger foundation.
-- This records staking intent, reward accounting, and read-model stats.
-- It does not assert chain custody; PENDING_CHAIN events require later WoloChain execution.

CREATE TABLE "staking_positions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "wallet_address" VARCHAR(100),
    "current_staked_wolo" INTEGER NOT NULL DEFAULT 0,
    "accumulated_weight" BIGINT NOT NULL DEFAULT 0,
    "last_weight_update_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pending_rewards_wolo" INTEGER NOT NULL DEFAULT 0,
    "lifetime_rewards_wolo" INTEGER NOT NULL DEFAULT 0,
    "claimed_rewards_wolo" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(24) NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staking_positions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staking_events" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "position_id" INTEGER,
    "wallet_address" VARCHAR(100),
    "type" VARCHAR(24) NOT NULL,
    "amount_wolo" INTEGER NOT NULL DEFAULT 0,
    "tx_hash" VARCHAR(128),
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING_CHAIN',
    "weight_before" BIGINT NOT NULL DEFAULT 0,
    "weight_after" BIGINT NOT NULL DEFAULT 0,
    "balance_before_wolo" INTEGER NOT NULL DEFAULT 0,
    "balance_after_wolo" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(6),

    CONSTRAINT "staking_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staking_reward_distributions" (
    "id" SERIAL NOT NULL,
    "distribution_date" DATE NOT NULL,
    "period_start" TIMESTAMP(6) NOT NULL,
    "period_end" TIMESTAMP(6) NOT NULL,
    "betting_fee_pool_wolo" INTEGER NOT NULL DEFAULT 0,
    "staker_pool_wolo" INTEGER NOT NULL DEFAULT 0,
    "treasury_pool_wolo" INTEGER NOT NULL DEFAULT 0,
    "total_weight" BIGINT NOT NULL DEFAULT 0,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalized_at" TIMESTAMP(6),

    CONSTRAINT "staking_reward_distributions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staking_reward_allocations" (
    "id" SERIAL NOT NULL,
    "distribution_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "position_id" INTEGER,
    "wallet_address" VARCHAR(100),
    "user_weight" BIGINT NOT NULL DEFAULT 0,
    "total_weight" BIGINT NOT NULL DEFAULT 0,
    "reward_wolo" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credited_at" TIMESTAMP(6),
    "claimed_at" TIMESTAMP(6),

    CONSTRAINT "staking_reward_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staking_daily_stats" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "total_staked_wolo" INTEGER NOT NULL DEFAULT 0,
    "active_stakers" INTEGER NOT NULL DEFAULT 0,
    "total_weight" BIGINT NOT NULL DEFAULT 0,
    "staker_rewards_wolo" INTEGER NOT NULL DEFAULT 0,
    "treasury_revenue_wolo" INTEGER NOT NULL DEFAULT 0,
    "bet_volume_wolo" INTEGER NOT NULL DEFAULT 0,
    "bets_placed" INTEGER NOT NULL DEFAULT 0,
    "active_bettors" INTEGER NOT NULL DEFAULT 0,
    "active_players" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staking_daily_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_staking_positions_user_id" ON "staking_positions"("user_id");
CREATE INDEX "ix_staking_positions_status_current_staked" ON "staking_positions"("status", "current_staked_wolo");
CREATE INDEX "ix_staking_positions_wallet_address" ON "staking_positions"("wallet_address");

CREATE INDEX "ix_staking_events_user_status_created" ON "staking_events"("user_id", "status", "created_at");
CREATE INDEX "ix_staking_events_status_created" ON "staking_events"("status", "created_at");
CREATE INDEX "ix_staking_events_tx_hash" ON "staking_events"("tx_hash");

CREATE UNIQUE INDEX "uq_staking_reward_distributions_date" ON "staking_reward_distributions"("distribution_date");
CREATE INDEX "ix_staking_reward_distributions_status_date" ON "staking_reward_distributions"("status", "distribution_date");

CREATE UNIQUE INDEX "uq_staking_reward_allocations_distribution_user" ON "staking_reward_allocations"("distribution_id", "user_id");
CREATE INDEX "ix_staking_reward_allocations_user_status_created" ON "staking_reward_allocations"("user_id", "status", "created_at");

CREATE UNIQUE INDEX "uq_staking_daily_stats_date" ON "staking_daily_stats"("date");

ALTER TABLE "staking_positions"
    ADD CONSTRAINT "staking_positions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "staking_events"
    ADD CONSTRAINT "staking_events_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "staking_events"
    ADD CONSTRAINT "staking_events_position_id_fkey"
    FOREIGN KEY ("position_id") REFERENCES "staking_positions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "staking_reward_allocations"
    ADD CONSTRAINT "staking_reward_allocations_distribution_id_fkey"
    FOREIGN KEY ("distribution_id") REFERENCES "staking_reward_distributions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "staking_reward_allocations"
    ADD CONSTRAINT "staking_reward_allocations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "staking_reward_allocations"
    ADD CONSTRAINT "staking_reward_allocations_position_id_fkey"
    FOREIGN KEY ("position_id") REFERENCES "staking_positions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
