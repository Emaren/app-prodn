-- Additive War Engine control plane. This migration creates immutable case,
-- event and run ledgers for replay reconstruction beyond standard parsing.
-- War Engine evidence is permanently fenced from public aggregates and bets
-- until a separate accepted adjudication explicitly changes statistics.

BEGIN;

CREATE TABLE "war_engine_cases" (
  "id" SERIAL PRIMARY KEY,
  "game_stats_id" INTEGER NOT NULL,
  "created_by_user_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "source_replay_hashes" JSONB NOT NULL,
  "initial_tier" INTEGER NOT NULL DEFAULT 3,
  "initial_reason_code" VARCHAR(80) NOT NULL,
  "financial_history_locked" BOOLEAN NOT NULL DEFAULT TRUE,
  "financial_lock_reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_war_engine_cases_game"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_engine_cases_creator"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_engine_cases_hashes"
    CHECK (
      jsonb_typeof("source_replay_hashes") = 'array' AND
      jsonb_array_length("source_replay_hashes") >= 1
    ),
  CONSTRAINT "ck_war_engine_cases_tier"
    CHECK ("initial_tier" BETWEEN 1 AND 6),
  CONSTRAINT "ck_war_engine_cases_reason"
    CHECK (char_length(btrim("initial_reason_code")) >= 8),
  CONSTRAINT "ck_war_engine_cases_financial_lock"
    CHECK (
      "financial_history_locked" = TRUE AND
      char_length(btrim("financial_lock_reason")) >= 16
    )
);

CREATE UNIQUE INDEX "uq_war_engine_cases_game"
  ON "war_engine_cases"("game_stats_id");
CREATE UNIQUE INDEX "uq_war_engine_cases_idempotency"
  ON "war_engine_cases"("idempotency_key");
CREATE INDEX "ix_war_engine_cases_creator_created"
  ON "war_engine_cases"("created_by_user_id", "created_at");
CREATE INDEX "ix_war_engine_cases_tier_created"
  ON "war_engine_cases"("initial_tier", "created_at");

CREATE TABLE "war_engine_case_events" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "event_type" VARCHAR(32) NOT NULL,
  "tier" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "classification" VARCHAR(40),
  "public_label" VARCHAR(80) NOT NULL,
  "public_detail" TEXT NOT NULL,
  "winning_team_key" VARCHAR(128),
  "winning_player_keys" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "confidence_bps" INTEGER,
  "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_war_engine_case_events_case"
    FOREIGN KEY ("case_id") REFERENCES "war_engine_cases"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_engine_case_events_sequence"
    CHECK ("sequence" >= 0),
  CONSTRAINT "ck_war_engine_case_events_type"
    CHECK (
      "event_type" IN (
        'queued',
        'started',
        'progress',
        'classified',
        'completed',
        'failed',
        'awaiting_human'
      )
    ),
  CONSTRAINT "ck_war_engine_case_events_tier"
    CHECK ("tier" BETWEEN 1 AND 6),
  CONSTRAINT "ck_war_engine_case_events_status"
    CHECK (
      "status" IN (
        'required',
        'queued',
        'running',
        'completed',
        'failed',
        'awaiting_human'
      )
    ),
  CONSTRAINT "ck_war_engine_case_events_classification"
    CHECK (
      "classification" IS NULL OR
      "classification" IN (
        'verified_result',
        'reconstructed_result',
        'likely_outcome',
        'inconclusive_recording',
        'aborted_battle',
        'human_adjudication_required'
      )
    ),
  CONSTRAINT "ck_war_engine_case_events_public_copy"
    CHECK (
      char_length(btrim("public_label")) >= 4 AND
      char_length(btrim("public_detail")) >= 12
    ),
  CONSTRAINT "ck_war_engine_case_events_winners"
    CHECK (jsonb_typeof("winning_player_keys") = 'array'),
  CONSTRAINT "ck_war_engine_case_events_confidence"
    CHECK (
      "confidence_bps" IS NULL OR
      "confidence_bps" BETWEEN 0 AND 10000
    )
);

CREATE UNIQUE INDEX "uq_war_engine_case_events_idempotency"
  ON "war_engine_case_events"("idempotency_key");
CREATE UNIQUE INDEX "uq_war_engine_case_events_sequence"
  ON "war_engine_case_events"("case_id", "sequence");
CREATE INDEX "ix_war_engine_case_events_status_created"
  ON "war_engine_case_events"("status", "created_at");
CREATE INDEX "ix_war_engine_case_events_class_created"
  ON "war_engine_case_events"("classification", "created_at");

CREATE TABLE "war_engine_runs" (
  "id" SERIAL PRIMARY KEY,
  "case_id" INTEGER NOT NULL,
  "source_parse_run_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "run_identity_hash" VARCHAR(64) NOT NULL,
  "tier" INTEGER NOT NULL,
  "engine_name" VARCHAR(64) NOT NULL,
  "engine_version" VARCHAR(64) NOT NULL,
  "engine_build" VARCHAR(128),
  "input_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "result_classification" VARCHAR(40),
  "result_trusted" BOOLEAN NOT NULL DEFAULT FALSE,
  "winning_team_key" VARCHAR(128),
  "winning_player_keys" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "confidence_bps" INTEGER,
  "final_state" JSONB,
  "metrics" JSONB,
  "failure_signature" VARCHAR(128),
  "failure_detail" TEXT,
  "candidate_only" BOOLEAN NOT NULL DEFAULT TRUE,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT FALSE,
  "affects_bets" BOOLEAN NOT NULL DEFAULT FALSE,
  "started_at" TIMESTAMP(6) NOT NULL,
  "completed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_war_engine_runs_case"
    FOREIGN KEY ("case_id") REFERENCES "war_engine_cases"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_war_engine_runs_source_parse"
    FOREIGN KEY ("source_parse_run_id") REFERENCES "replay_parse_runs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_war_engine_runs_hashes"
    CHECK (
      "run_identity_hash" ~ '^[0-9a-f]{64}$' AND
      "input_hash" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "ck_war_engine_runs_tier"
    CHECK ("tier" BETWEEN 1 AND 6),
  CONSTRAINT "ck_war_engine_runs_status"
    CHECK ("status" IN ('completed', 'failed', 'skipped')),
  CONSTRAINT "ck_war_engine_runs_classification"
    CHECK (
      "result_classification" IS NULL OR
      "result_classification" IN (
        'verified_result',
        'reconstructed_result',
        'likely_outcome',
        'inconclusive_recording',
        'aborted_battle',
        'human_adjudication_required'
      )
    ),
  CONSTRAINT "ck_war_engine_runs_winners"
    CHECK (jsonb_typeof("winning_player_keys") = 'array'),
  CONSTRAINT "ck_war_engine_runs_confidence"
    CHECK (
      "confidence_bps" IS NULL OR
      "confidence_bps" BETWEEN 0 AND 10000
    ),
  CONSTRAINT "ck_war_engine_runs_timing"
    CHECK (
      "completed_at" IS NULL OR
      "completed_at" >= "started_at"
    ),
  CONSTRAINT "ck_war_engine_runs_failure"
    CHECK (
      "status" <> 'failed' OR
      "failure_signature" IS NOT NULL
    ),
  CONSTRAINT "ck_war_engine_runs_authority"
    CHECK (
      "candidate_only" = TRUE AND
      "affects_public_aggregates" = FALSE AND
      "affects_bets" = FALSE
    )
);

CREATE UNIQUE INDEX "uq_war_engine_runs_idempotency"
  ON "war_engine_runs"("idempotency_key");
CREATE UNIQUE INDEX "uq_war_engine_runs_identity"
  ON "war_engine_runs"("run_identity_hash");
CREATE INDEX "ix_war_engine_runs_case_created"
  ON "war_engine_runs"("case_id", "created_at");
CREATE INDEX "ix_war_engine_runs_source_parse"
  ON "war_engine_runs"("source_parse_run_id");
CREATE INDEX "ix_war_engine_runs_tier_status"
  ON "war_engine_runs"("tier", "status", "created_at");

CREATE TRIGGER "war_engine_cases_append_only"
BEFORE UPDATE OR DELETE ON "war_engine_cases"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_engine_cases_append_only_truncate"
BEFORE TRUNCATE ON "war_engine_cases"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_engine_case_events_append_only"
BEFORE UPDATE OR DELETE ON "war_engine_case_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_engine_case_events_append_only_truncate"
BEFORE TRUNCATE ON "war_engine_case_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_engine_runs_append_only"
BEFORE UPDATE OR DELETE ON "war_engine_runs"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

CREATE TRIGGER "war_engine_runs_append_only_truncate"
BEFORE TRUNCATE ON "war_engine_runs"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"();

COMMIT;
