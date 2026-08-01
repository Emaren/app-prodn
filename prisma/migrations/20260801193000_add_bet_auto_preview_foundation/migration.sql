-- Saved profile automation is preview configuration only. It does not prove
-- custody, escrow, a reservation, or an accepted wager.
CREATE TABLE "bet_auto_presets" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "winner_stake_wolo" INTEGER NOT NULL DEFAULT 10,
  "desync_side" VARCHAR(8) NOT NULL DEFAULT 'none',
  "desync_stake_wolo" INTEGER NOT NULL DEFAULT 0,
  "until_out" BOOLEAN NOT NULL DEFAULT false,
  "games_remaining" INTEGER DEFAULT 1,
  "self_only" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "paused_reason" VARCHAR(80),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bet_auto_presets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bet_auto_presets_winner_stake"
    CHECK ("winner_stake_wolo" BETWEEN 1 AND 10000),
  CONSTRAINT "ck_bet_auto_presets_desync"
    CHECK (
      ("desync_side" = 'none' AND "desync_stake_wolo" = 0)
      OR
      ("desync_side" IN ('no', 'yes') AND "desync_stake_wolo" BETWEEN 1 AND 10000)
    ),
  CONSTRAINT "ck_bet_auto_presets_per_game_cap"
    CHECK (("winner_stake_wolo" + "desync_stake_wolo") <= 10000),
  CONSTRAINT "ck_bet_auto_presets_game_plan"
    CHECK (
      ("until_out" = true AND "games_remaining" IS NULL)
      OR
      (
        "until_out" = false
        AND "games_remaining" BETWEEN 1 AND 10000
        AND (("winner_stake_wolo" + "desync_stake_wolo") * "games_remaining") <= 10000
      )
    ),
  CONSTRAINT "ck_bet_auto_presets_self_only" CHECK ("self_only" = true),
  CONSTRAINT "ck_bet_auto_presets_version" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "uq_bet_auto_presets_user_id"
  ON "bet_auto_presets"("user_id");
CREATE INDEX "ix_bet_auto_presets_enabled_updated_at"
  ON "bet_auto_presets"("enabled", "updated_at");

ALTER TABLE "bet_auto_presets"
  ADD CONSTRAINT "bet_auto_presets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

-- Durable audit/outbox shape for a future market evaluator. No producer or
-- consumer is enabled by this migration.
CREATE TABLE "bet_auto_executions" (
  "id" SERIAL NOT NULL,
  "preset_id" INTEGER NOT NULL,
  "preset_version" INTEGER NOT NULL,
  "game_identity_key" VARCHAR(255) NOT NULL,
  "winner_market_id" INTEGER NOT NULL,
  "desync_market_id" INTEGER,
  "ticket_id" INTEGER,
  "session_key" VARCHAR(255),
  "proposition_hash" VARCHAR(64) NOT NULL,
  "selected_side" VARCHAR(20),
  "winner_stake_wolo" INTEGER NOT NULL,
  "desync_side" VARCHAR(8) NOT NULL DEFAULT 'none',
  "desync_stake_wolo" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(24) NOT NULL DEFAULT 'queued',
  "reason" VARCHAR(255),
  "source_evidence" JSONB,
  "reservation_id" VARCHAR(128),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(6),
  "lease_owner" VARCHAR(100),
  "lease_expires_at" TIMESTAMP(6),
  "accepted_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bet_auto_executions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bet_auto_executions_preset_version" CHECK ("preset_version" > 0),
  CONSTRAINT "ck_bet_auto_executions_selected_side"
    CHECK ("selected_side" IS NULL OR "selected_side" IN ('left', 'right')),
  CONSTRAINT "ck_bet_auto_executions_winner_stake"
    CHECK ("winner_stake_wolo" BETWEEN 1 AND 10000),
  CONSTRAINT "ck_bet_auto_executions_desync"
    CHECK (
      (
        "desync_side" = 'none'
        AND "desync_stake_wolo" = 0
        AND "desync_market_id" IS NULL
      )
      OR
      (
        "desync_side" IN ('no', 'yes')
        AND "desync_stake_wolo" BETWEEN 1 AND 10000
        AND "desync_market_id" IS NOT NULL
      )
    ),
  CONSTRAINT "ck_bet_auto_executions_per_game_cap"
    CHECK (("winner_stake_wolo" + "desync_stake_wolo") <= 10000),
  CONSTRAINT "ck_bet_auto_executions_status"
    CHECK ("status" IN ('eligible', 'skipped', 'queued', 'reserving', 'accepted', 'failed')),
  CONSTRAINT "ck_bet_auto_executions_attempt_count" CHECK ("attempt_count" >= 0)
);

CREATE UNIQUE INDEX "uq_bet_auto_executions_preset_game"
  ON "bet_auto_executions"("preset_id", "game_identity_key");
CREATE UNIQUE INDEX "uq_bet_auto_executions_ticket_id"
  ON "bet_auto_executions"("ticket_id");
CREATE UNIQUE INDEX "uq_bet_auto_executions_reservation_id"
  ON "bet_auto_executions"("reservation_id");
CREATE INDEX "ix_bet_auto_executions_status_next_attempt"
  ON "bet_auto_executions"("status", "next_attempt_at");
CREATE INDEX "ix_bet_auto_executions_winner_market"
  ON "bet_auto_executions"("winner_market_id", "created_at");
CREATE INDEX "ix_bet_auto_executions_desync_market"
  ON "bet_auto_executions"("desync_market_id", "created_at");

ALTER TABLE "bet_auto_executions"
  ADD CONSTRAINT "bet_auto_executions_preset_id_fkey"
  FOREIGN KEY ("preset_id") REFERENCES "bet_auto_presets"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "bet_auto_executions"
  ADD CONSTRAINT "bet_auto_executions_winner_market_id_fkey"
  FOREIGN KEY ("winner_market_id") REFERENCES "bet_markets"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "bet_auto_executions"
  ADD CONSTRAINT "bet_auto_executions_desync_market_id_fkey"
  FOREIGN KEY ("desync_market_id") REFERENCES "bet_markets"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "bet_auto_executions"
  ADD CONSTRAINT "bet_auto_executions_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "bet_stake_tickets"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
