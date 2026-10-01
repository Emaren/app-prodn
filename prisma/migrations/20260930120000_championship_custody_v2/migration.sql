-- CreateTable
CREATE TABLE "championship_custody_reigns" (
    "id" SERIAL NOT NULL,
    "trophy_id" INTEGER NOT NULL,
    "mode" VARCHAR(8),
    "team_size" INTEGER NOT NULL,
    "started_at" TIMESTAMP(6) NOT NULL,
    "ended_at" TIMESTAMP(6),
    "reason" VARCHAR(64) NOT NULL,
    "request_key" VARCHAR(180) NOT NULL,
    "frozen_bounty_wolo" INTEGER,

    CONSTRAINT "championship_custody_reigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_custody_seats" (
    "id" SERIAL NOT NULL,
    "reign_id" INTEGER NOT NULL,
    "seat" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "uid" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "wallet_address" VARCHAR(100),
    "steam_id" VARCHAR(32),
    "nft_class_id" VARCHAR(120),
    "nft_id" VARCHAR(160) NOT NULL,

    CONSTRAINT "championship_custody_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_transfer_groups" (
    "id" SERIAL NOT NULL,
    "trophy_id" INTEGER NOT NULL,
    "request_key" VARCHAR(180) NOT NULL,
    "from_epoch" VARCHAR(255) NOT NULL,
    "to_reign_id" INTEGER,
    "reason" VARCHAR(64) NOT NULL,
    "actor_user_id" INTEGER,
    "challenge_id" INTEGER,
    "replay_id" INTEGER,
    "eligibility_override" BOOLEAN NOT NULL DEFAULT false,
    "app_status" VARCHAR(32) NOT NULL DEFAULT 'changed',
    "nft_status" VARCHAR(32) NOT NULL DEFAULT 'blocked',
    "reason_code" VARCHAR(100) NOT NULL DEFAULT 'NFT_EXECUTOR_UNAVAILABLE',
    "frozen_bounty_wolo" INTEGER NOT NULL,
    "bounty_payout_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "championship_transfer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_transfer_seats" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "seat" INTEGER NOT NULL,
    "nft_class_id" VARCHAR(120),
    "nft_id" VARCHAR(160) NOT NULL,
    "expected_owner_address" VARCHAR(100),
    "recipient_user_id" INTEGER NOT NULL,
    "recipient_address" VARCHAR(100),
    "status" VARCHAR(32) NOT NULL DEFAULT 'blocked',
    "tx_hash" VARCHAR(128),
    "proof" JSONB,
    "error_code" VARCHAR(100),
    "confirmed_at" TIMESTAMP(6),

    CONSTRAINT "championship_transfer_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trophy_payout_allocations" (
    "id" SERIAL NOT NULL,
    "payout_id" INTEGER NOT NULL,
    "seat" INTEGER NOT NULL,
    "recipient_user_id" INTEGER NOT NULL,
    "recipient_address" VARCHAR(100),
    "amount_uwolo" BIGINT NOT NULL,
    "request_key" VARCHAR(180) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "tx_hash" VARCHAR(128),
    "error_code" VARCHAR(255),
    "proof" JSONB,
    "paid_at" TIMESTAMP(6),

    CONSTRAINT "trophy_payout_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "championship_custody_reigns_request_key_key" ON "championship_custody_reigns"("request_key");

-- CreateIndex
CREATE INDEX "championship_custody_reigns_trophy_id_ended_at_idx" ON "championship_custody_reigns"("trophy_id", "ended_at");

-- CreateIndex
CREATE INDEX "championship_custody_seats_user_id_idx" ON "championship_custody_seats"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "championship_custody_seats_reign_id_seat_key" ON "championship_custody_seats"("reign_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "championship_custody_seats_reign_id_user_id_key" ON "championship_custody_seats"("reign_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "championship_transfer_groups_request_key_key" ON "championship_transfer_groups"("request_key");

-- CreateIndex
CREATE INDEX "championship_transfer_groups_trophy_id_created_at_idx" ON "championship_transfer_groups"("trophy_id", "created_at");

-- CreateIndex
CREATE INDEX "championship_transfer_seats_status_idx" ON "championship_transfer_seats"("status");

-- CreateIndex
CREATE UNIQUE INDEX "championship_transfer_seats_group_id_seat_key" ON "championship_transfer_seats"("group_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "trophy_payout_allocations_request_key_key" ON "trophy_payout_allocations"("request_key");

-- CreateIndex
CREATE INDEX "trophy_payout_allocations_payout_id_status_idx" ON "trophy_payout_allocations"("payout_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "trophy_payout_allocations_payout_id_seat_key" ON "trophy_payout_allocations"("payout_id", "seat");

-- AddForeignKey
ALTER TABLE "championship_custody_seats" ADD CONSTRAINT "championship_custody_seats_reign_id_fkey" FOREIGN KEY ("reign_id") REFERENCES "championship_custody_reigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "championship_transfer_seats" ADD CONSTRAINT "championship_transfer_seats_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "championship_transfer_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trophy_payout_allocations" ADD CONSTRAINT "trophy_payout_allocations_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "trophy_payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custody is serialized in application transactions and independently constrained here.
CREATE UNIQUE INDEX championship_one_current_reign ON championship_custody_reigns(trophy_id) WHERE ended_at IS NULL;
ALTER TABLE championship_custody_reigns ADD CONSTRAINT championship_reign_team_size CHECK (team_size BETWEEN 1 AND 4);
ALTER TABLE championship_custody_seats ADD CONSTRAINT championship_custody_seat_range CHECK (seat BETWEEN 0 AND 3);
ALTER TABLE championship_transfer_seats ADD CONSTRAINT championship_transfer_seat_range CHECK (seat BETWEEN 0 AND 3);
ALTER TABLE trophy_payout_allocations ADD CONSTRAINT championship_allocation_amount_nonnegative CHECK (amount_uwolo >= 0);
