BEGIN;

CREATE TABLE "betting_bot_configs" (
  "id" SERIAL PRIMARY KEY,
  "slug" VARCHAR(64) NOT NULL,
  "reserved_uid" VARCHAR(100) NOT NULL,
  "display_name" VARCHAR(100) NOT NULL,
  "avatar_url" VARCHAR(500),
  "mode" VARCHAR(16) NOT NULL DEFAULT 'disabled',
  "commentary_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "commentary_prompt" TEXT NOT NULL DEFAULT '',
  "opposite_only" BOOLEAN NOT NULL DEFAULT TRUE,
  "default_counterstake_wolo" INTEGER NOT NULL DEFAULT 10,
  "max_counterstake_wolo" INTEGER NOT NULL DEFAULT 10,
  "per_market_exposure_wolo" INTEGER NOT NULL DEFAULT 10,
  "daily_exposure_wolo" INTEGER NOT NULL DEFAULT 50,
  "balance_floor_wolo" INTEGER NOT NULL DEFAULT 100,
  "policy_id" VARCHAR(64) NOT NULL DEFAULT 'opposite-counter',
  "policy_version" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ck_betting_bot_configs_mode"
    CHECK ("mode" IN ('disabled', 'shadow', 'live')),
  CONSTRAINT "ck_betting_bot_configs_opposite_only"
    CHECK ("opposite_only" = TRUE),
  CONSTRAINT "ck_betting_bot_configs_counterstake"
    CHECK (
      "default_counterstake_wolo" BETWEEN 1 AND 10
      AND "max_counterstake_wolo" BETWEEN 1 AND 10
      AND "default_counterstake_wolo" <= "max_counterstake_wolo"
    ),
  CONSTRAINT "ck_betting_bot_configs_market_exposure"
    CHECK (
      "per_market_exposure_wolo" >= "max_counterstake_wolo"
      AND "per_market_exposure_wolo" <= 10000
    ),
  CONSTRAINT "ck_betting_bot_configs_daily_exposure"
    CHECK (
      "daily_exposure_wolo" >= "per_market_exposure_wolo"
      AND "daily_exposure_wolo" <= 100000
    ),
  CONSTRAINT "ck_betting_bot_configs_balance_floor"
    CHECK ("balance_floor_wolo" BETWEEN 0 AND 100000000),
  CONSTRAINT "ck_betting_bot_configs_versions"
    CHECK ("policy_version" >= 1 AND "version" >= 1)
);

CREATE UNIQUE INDEX "betting_bot_configs_slug_key"
  ON "betting_bot_configs"("slug");
CREATE UNIQUE INDEX "uq_betting_bot_configs_reserved_uid"
  ON "betting_bot_configs"("reserved_uid");
CREATE INDEX "ix_betting_bot_configs_mode_updated_at"
  ON "betting_bot_configs"("mode", "updated_at");

CREATE TABLE "bet_counter_actions" (
  "id" SERIAL PRIMARY KEY,
  "bot_config_id" INTEGER NOT NULL,
  "bot_slug_snapshot" VARCHAR(64) NOT NULL,
  "reserved_uid_snapshot" VARCHAR(100) NOT NULL,
  "market_id" INTEGER,
  "source_wager_id" INTEGER,
  "event_type" VARCHAR(40) NOT NULL,
  "idempotency_key" VARCHAR(180) NOT NULL,
  "policy_id_snapshot" VARCHAR(64) NOT NULL,
  "policy_version_snapshot" INTEGER NOT NULL,
  "configured_mode_snapshot" VARCHAR(16) NOT NULL,
  "effective_mode_snapshot" VARCHAR(16) NOT NULL,
  "source_side" VARCHAR(20),
  "counter_side" VARCHAR(20),
  "proposed_counterstake_wolo" INTEGER,
  "committed_counterstake_wolo" INTEGER,
  "market_exposure_before_wolo" INTEGER,
  "daily_exposure_before_wolo" INTEGER,
  "available_balance_wolo" INTEGER,
  "custody_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "custody_verification_id" VARCHAR(128),
  "custody_reservation_id" VARCHAR(128),
  "stake_tx_hash" VARCHAR(128),
  "reason_code" VARCHAR(80) NOT NULL,
  "reason_detail" VARCHAR(500),
  "actor_uid" VARCHAR(100),
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_bet_counter_actions_bot_config"
    FOREIGN KEY ("bot_config_id") REFERENCES "betting_bot_configs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_bet_counter_actions_event_type"
    CHECK (LENGTH(BTRIM("event_type")) > 0),
  CONSTRAINT "ck_bet_counter_actions_policy_version"
    CHECK ("policy_version_snapshot" >= 1),
  CONSTRAINT "ck_bet_counter_actions_modes"
    CHECK (
      "configured_mode_snapshot" IN ('disabled', 'shadow', 'live')
      AND "effective_mode_snapshot" IN ('disabled', 'shadow', 'live')
    ),
  CONSTRAINT "ck_bet_counter_actions_opposite_sides"
    CHECK (
      ("source_side" IS NULL AND "counter_side" IS NULL)
      OR (
        "source_side" IN ('left', 'right')
        AND "counter_side" IN ('left', 'right')
        AND "source_side" <> "counter_side"
      )
    ),
  CONSTRAINT "ck_bet_counter_actions_amounts"
    CHECK (
      ("proposed_counterstake_wolo" IS NULL OR "proposed_counterstake_wolo" BETWEEN 1 AND 10)
      AND ("committed_counterstake_wolo" IS NULL OR "committed_counterstake_wolo" BETWEEN 1 AND 10)
    ),
  CONSTRAINT "ck_bet_counter_actions_exposure"
    CHECK (
      ("market_exposure_before_wolo" IS NULL OR "market_exposure_before_wolo" >= 0)
      AND ("daily_exposure_before_wolo" IS NULL OR "daily_exposure_before_wolo" >= 0)
      AND ("available_balance_wolo" IS NULL OR "available_balance_wolo" >= 0)
    ),
  CONSTRAINT "ck_bet_counter_actions_custody_proof"
    CHECK (
      (NOT "custody_verified" OR "custody_verification_id" IS NOT NULL)
      AND (
        "committed_counterstake_wolo" IS NULL
        OR (
          "custody_verified" = TRUE
          AND "custody_verification_id" IS NOT NULL
          AND "custody_reservation_id" IS NOT NULL
          AND "stake_tx_hash" IS NOT NULL
        )
      )
    ),
  CONSTRAINT "ck_bet_counter_actions_positive_refs"
    CHECK (
      ("market_id" IS NULL OR "market_id" > 0)
      AND ("source_wager_id" IS NULL OR "source_wager_id" > 0)
    )
);

CREATE UNIQUE INDEX "uq_bet_counter_actions_idempotency"
  ON "bet_counter_actions"("idempotency_key");
CREATE UNIQUE INDEX "uq_bet_counter_actions_custody_reservation"
  ON "bet_counter_actions"("custody_reservation_id");
CREATE UNIQUE INDEX "uq_bet_counter_actions_stake_tx"
  ON "bet_counter_actions"("stake_tx_hash");
CREATE INDEX "ix_bet_counter_actions_bot_created"
  ON "bet_counter_actions"("bot_config_id", "created_at");
CREATE INDEX "ix_bet_counter_actions_market_created"
  ON "bet_counter_actions"("market_id", "created_at");
CREATE INDEX "ix_bet_counter_actions_source_wager_created"
  ON "bet_counter_actions"("source_wager_id", "created_at");
CREATE INDEX "ix_bet_counter_actions_event_created"
  ON "bet_counter_actions"("event_type", "created_at");

CREATE OR REPLACE FUNCTION "prevent_bet_counter_action_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'bet_counter_actions is append-only; append a superseding audit action instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "bet_counter_actions_append_only"
BEFORE UPDATE OR DELETE ON "bet_counter_actions"
FOR EACH ROW EXECUTE FUNCTION "prevent_bet_counter_action_mutation"();

CREATE TRIGGER "bet_counter_actions_append_only_truncate"
BEFORE TRUNCATE ON "bet_counter_actions"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_bet_counter_action_mutation"();

COMMENT ON TABLE "betting_bot_configs" IS
  'Mutable app-side counter-bettor policy only. It is not custody, escrow, a signer, or a wager.';
COMMENT ON TABLE "bet_counter_actions" IS
  'Append-only deterministic counter-bet decision/audit evidence. Rows do not prove WOLO movement without chain proof.';

INSERT INTO "betting_bot_configs" (
  "slug",
  "reserved_uid",
  "display_name",
  "mode",
  "commentary_enabled",
  "commentary_prompt",
  "opposite_only",
  "default_counterstake_wolo",
  "max_counterstake_wolo",
  "per_market_exposure_wolo",
  "daily_exposure_wolo",
  "balance_floor_wolo",
  "policy_id",
  "policy_version"
) VALUES
(
  'tony',
  'aoe2hd_betting_bot_tony',
  'Tony',
  'disabled',
  FALSE,
  'Confident, dry, and concise. Acknowledge the opposite action without pretending the bet is larger or more final than the supplied proof.',
  TRUE,
  10,
  10,
  10,
  50,
  100,
  'opposite-counter',
  1
),
(
  'paulie',
  'aoe2hd_betting_bot_paulie',
  'Paulie',
  'disabled',
  FALSE,
  'Streetwise, amused, and compact. Add flavour only after deterministic policy, never invent odds, custody, or settlement.',
  TRUE,
  10,
  10,
  10,
  50,
  100,
  'opposite-counter',
  1
);

COMMIT;
