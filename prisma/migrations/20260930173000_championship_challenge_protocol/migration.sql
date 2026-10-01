-- CreateTable
CREATE TABLE "championship_challenges" (
    "id" SERIAL NOT NULL,
    "scheduled_match_id" INTEGER NOT NULL,
    "trophy_challenge_id" INTEGER,
    "trophy_id" INTEGER,
    "title_name" VARCHAR(120),
    "mode" VARCHAR(8),
    "team_size" INTEGER NOT NULL DEFAULT 1,
    "state" VARCHAR(40) NOT NULL DEFAULT 'open',
    "challenge_deadline" TIMESTAMP(6) NOT NULL,
    "commissioner_grace_deadline" TIMESTAMP(6) NOT NULL,
    "expected_custody_epoch" VARCHAR(160),
    "expected_defender_roster" JSONB NOT NULL,
    "eligibility_snapshot" JSONB,
    "eligibility_override" BOOLEAN NOT NULL DEFAULT false,
    "defense_started_at" TIMESTAMP(6),
    "defense_session_key" VARCHAR(255),
    "defense_proof" JSONB,
    "result_replay_id" INTEGER,
    "winner_side" VARCHAR(16),
    "reason_code" VARCHAR(80),
    "commissioner_action_at" TIMESTAMP(6),
    "commissioner_user_id" INTEGER,
    "commissioner_reason" TEXT,
    "grace_notified_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "championship_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_challenge_participants" (
    "id" SERIAL NOT NULL,
    "protocol_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "uid_snapshot" VARCHAR(100) NOT NULL,
    "display_name_snapshot" VARCHAR(120) NOT NULL,
    "side" VARCHAR(16) NOT NULL,
    "seat" INTEGER NOT NULL,
    "steam_id_snapshot" VARCHAR(32) NOT NULL,
    "wallet_address_snapshot" VARCHAR(100),
    "funding_scheduled_match_id" INTEGER NOT NULL,
    "funding_side" VARCHAR(8) NOT NULL,
    "accepted_at" TIMESTAMP(6),
    "notified_at" TIMESTAMP(6),

    CONSTRAINT "championship_challenge_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_challenge_legs" (
    "id" SERIAL NOT NULL,
    "protocol_id" INTEGER NOT NULL,
    "scheduled_match_id" INTEGER NOT NULL,
    "seat" INTEGER NOT NULL,

    CONSTRAINT "championship_challenge_legs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "championship_title_disputes" (
    "id" SERIAL NOT NULL,
    "trophy_id" INTEGER NOT NULL,
    "custody_epoch" VARCHAR(160) NOT NULL,
    "contender_snapshot" JSONB NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'open',
    "resolved_at" TIMESTAMP(6),
    "resolved_by_user_id" INTEGER,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "championship_title_disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "championship_challenges_scheduled_match_id_key" ON "championship_challenges"("scheduled_match_id");

-- CreateIndex
CREATE UNIQUE INDEX "championship_challenges_trophy_challenge_id_key" ON "championship_challenges"("trophy_challenge_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_championship_defense_session" ON "championship_challenges"("defense_session_key");

-- CreateIndex
CREATE INDEX "championship_challenges_state_challenge_deadline_idx" ON "championship_challenges"("state", "challenge_deadline");

-- CreateIndex
CREATE INDEX "championship_challenges_trophy_id_state_expected_custody_ep_idx" ON "championship_challenges"("trophy_id", "state", "expected_custody_epoch");

-- CreateIndex
CREATE INDEX "championship_challenge_participants_user_id_protocol_id_idx" ON "championship_challenge_participants"("user_id", "protocol_id");

-- CreateIndex
CREATE UNIQUE INDEX "championship_challenge_participants_protocol_id_user_id_key" ON "championship_challenge_participants"("protocol_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "championship_challenge_participants_protocol_id_side_seat_key" ON "championship_challenge_participants"("protocol_id", "side", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "championship_challenge_legs_scheduled_match_id_key" ON "championship_challenge_legs"("scheduled_match_id");

-- CreateIndex
CREATE UNIQUE INDEX "championship_challenge_legs_protocol_id_seat_key" ON "championship_challenge_legs"("protocol_id", "seat");

-- CreateIndex
CREATE INDEX "championship_title_disputes_status_created_at_idx" ON "championship_title_disputes"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "championship_title_disputes_trophy_id_custody_epoch_key" ON "championship_title_disputes"("trophy_id", "custody_epoch");

-- AddForeignKey
ALTER TABLE "championship_challenges" ADD CONSTRAINT "championship_challenges_scheduled_match_id_fkey" FOREIGN KEY ("scheduled_match_id") REFERENCES "scheduled_matches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "championship_challenge_participants" ADD CONSTRAINT "championship_challenge_participants_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "championship_challenges"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "championship_challenge_legs" ADD CONSTRAINT "championship_challenge_legs_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "championship_challenges"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "championship_challenge_legs" ADD CONSTRAINT "championship_challenge_legs_scheduled_match_id_fkey" FOREIGN KEY ("scheduled_match_id") REFERENCES "scheduled_matches"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Protocol invariants apply only to newly introduced tables, never historical rows.
ALTER TABLE "championship_challenges" ADD CONSTRAINT "championship_challenge_valid_policy" CHECK ("team_size" BETWEEN 1 AND 4 AND ("mode" IS NULL OR "mode" IN ('rm','dm')) AND "challenge_deadline" >= "created_at" AND "commissioner_grace_deadline" >= "challenge_deadline");
ALTER TABLE "championship_challenge_participants" ADD CONSTRAINT "championship_participant_valid_seat" CHECK ("side" IN ('challenger','defender') AND "funding_side" IN ('left','right') AND "seat" BETWEEN 0 AND 3 AND (("side"='challenger' AND "funding_side"='left') OR ("side"='defender' AND "funding_side"='right')));
ALTER TABLE "championship_challenge_legs" ADD CONSTRAINT "championship_financial_leg_valid_seat" CHECK ("seat" BETWEEN 1 AND 3);
