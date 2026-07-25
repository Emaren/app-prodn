BEGIN;

-- Accepted normalized statistics are a distinct projection from both raw
-- GameStats JSON and private ReplayObservation candidates. The projection is
-- append-only, versioned, provenance-bearing, and has no result or financial
-- authority.
CREATE TABLE "replay_stat_projections" (
  "id" SERIAL PRIMARY KEY,
  "game_stats_id" INTEGER NOT NULL,
  "parse_run_id" INTEGER,
  "supersedes_id" INTEGER,
  "projected_by_user_id" INTEGER,
  "projected_by_uid_snapshot" VARCHAR(100),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "projection_identity_hash" VARCHAR(64) NOT NULL,
  "input_hash" VARCHAR(64) NOT NULL,
  "projection_hash" VARCHAR(64) NOT NULL,
  "source_kind" VARCHAR(32) NOT NULL,
  "source_identity" VARCHAR(160) NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL,
  "parser_name" VARCHAR(64),
  "parser_version" VARCHAR(64),
  "pass_name" VARCHAR(64),
  "pass_version" VARCHAR(64),
  "schema_version" VARCHAR(64) NOT NULL,
  "metric_dictionary_version" VARCHAR(64) NOT NULL,
  "projection_policy_version" VARCHAR(64) NOT NULL,
  "projection_status" VARCHAR(24) NOT NULL DEFAULT 'candidate',
  "stat_eligibility" VARCHAR(24) NOT NULL DEFAULT 'eligible',
  "stat_eligibility_reason" VARCHAR(160),
  "result_eligibility" VARCHAR(24) NOT NULL DEFAULT 'unresolved',
  "result_eligibility_reason" VARCHAR(160),
  "player_count" INTEGER NOT NULL DEFAULT 0,
  "player_metric_count" INTEGER NOT NULL DEFAULT 0,
  "game_metric_count" INTEGER NOT NULL DEFAULT 0,
  "provenance" JSONB NOT NULL,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT FALSE,
  "affects_results" BOOLEAN NOT NULL DEFAULT FALSE,
  "affects_bets" BOOLEAN NOT NULL DEFAULT FALSE,
  "settlement_authority" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_stat_projections_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_stat_projections_parse_run"
    FOREIGN KEY ("parse_run_id") REFERENCES "replay_parse_runs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_stat_projections_supersedes"
    FOREIGN KEY ("supersedes_id") REFERENCES "replay_stat_projections"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_stat_projections_actor"
    FOREIGN KEY ("projected_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_stat_projections_hashes"
    CHECK (
      "projection_identity_hash" ~ '^[0-9a-f]{64}$' AND
      "input_hash" ~ '^[0-9a-f]{64}$' AND
      "projection_hash" ~ '^[0-9a-f]{64}$' AND
      "source_hash" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "ck_replay_stat_projections_source"
    CHECK (
      char_length(btrim("source_kind")) > 0 AND
      char_length(btrim("source_identity")) > 0
    ),
  CONSTRAINT "ck_replay_stat_projections_status"
    CHECK ("projection_status" IN ('candidate', 'accepted')),
  CONSTRAINT "ck_replay_stat_projections_stat_eligibility"
    CHECK ("stat_eligibility" IN ('eligible', 'partial', 'ineligible')),
  CONSTRAINT "ck_replay_stat_projections_result_eligibility"
    CHECK ("result_eligibility" IN ('resolved', 'unresolved', 'not_applicable')),
  CONSTRAINT "ck_replay_stat_projections_counts"
    CHECK (
      "player_count" >= 0 AND
      "player_metric_count" >= 0 AND
      "game_metric_count" >= 0
    ),
  CONSTRAINT "ck_replay_stat_projections_public_acceptance"
    CHECK (
      "affects_public_aggregates" = FALSE OR (
        "projection_status" = 'accepted' AND
        NULLIF(btrim("projected_by_uid_snapshot"), '') IS NOT NULL
      )
    ),
  CONSTRAINT "ck_replay_stat_projections_no_result_authority"
    CHECK (
      "affects_results" = FALSE AND
      "affects_bets" = FALSE AND
      "settlement_authority" = FALSE
    ),
  CONSTRAINT "ck_replay_stat_projections_provenance"
    CHECK (jsonb_typeof("provenance") = 'object')
);

CREATE UNIQUE INDEX "uq_replay_stat_projections_idempotency"
  ON "replay_stat_projections"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_stat_projections_supersedes"
  ON "replay_stat_projections"("supersedes_id");
CREATE UNIQUE INDEX "uq_replay_stat_projections_game_identity"
  ON "replay_stat_projections"("game_stats_id", "projection_identity_hash");
CREATE INDEX "ix_replay_stat_projections_game_status"
  ON "replay_stat_projections"("game_stats_id", "projection_status", "created_at");
CREATE INDEX "ix_replay_stat_projections_parse_run"
  ON "replay_stat_projections"("parse_run_id");
CREATE INDEX "ix_replay_stat_projections_actor"
  ON "replay_stat_projections"("projected_by_user_id", "created_at");
CREATE INDEX "ix_replay_stat_projections_source"
  ON "replay_stat_projections"("source_kind", "created_at");

CREATE TABLE "replay_player_snapshots" (
  "id" SERIAL PRIMARY KEY,
  "projection_id" INTEGER NOT NULL,
  "game_stats_id" INTEGER NOT NULL,
  "user_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "player_key" VARCHAR(160) NOT NULL,
  "display_name" VARCHAR(100) NOT NULL,
  "normalized_name" VARCHAR(100) NOT NULL,
  "steam_id" VARCHAR(32),
  "player_slot" INTEGER,
  "team_key" VARCHAR(64),
  "civilization_id" INTEGER,
  "civilization_name" VARCHAR(100),
  "stat_eligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "result_eligible" BOOLEAN NOT NULL DEFAULT FALSE,
  "result_status" VARCHAR(24) NOT NULL DEFAULT 'unresolved',
  "eligibility_reason" JSONB,
  "exact" BOOLEAN NOT NULL DEFAULT TRUE,
  "confidence_bps" INTEGER,
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_player_snapshots_projection"
    FOREIGN KEY ("projection_id") REFERENCES "replay_stat_projections"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_player_snapshots_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_player_snapshots_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_player_snapshots_identity"
    CHECK (
      char_length(btrim("player_key")) > 0 AND
      char_length(btrim("display_name")) > 0 AND
      char_length(btrim("normalized_name")) > 0
    ),
  CONSTRAINT "ck_replay_player_snapshots_slot"
    CHECK ("player_slot" IS NULL OR "player_slot" >= 0),
  CONSTRAINT "ck_replay_player_snapshots_result"
    CHECK (
      (
        "result_eligible" = TRUE AND
        "result_status" IN ('win', 'loss')
      ) OR (
        "result_eligible" = FALSE AND
        "result_status" IN ('unresolved', 'not_applicable')
      )
    ),
  CONSTRAINT "ck_replay_player_snapshots_confidence"
    CHECK ("confidence_bps" IS NULL OR "confidence_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "ck_replay_player_snapshots_reason"
    CHECK (
      "eligibility_reason" IS NULL OR
      jsonb_typeof("eligibility_reason") = 'object'
    ),
  CONSTRAINT "ck_replay_player_snapshots_provenance"
    CHECK (jsonb_typeof("provenance") = 'object')
);

CREATE UNIQUE INDEX "uq_replay_player_snapshots_idempotency"
  ON "replay_player_snapshots"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_player_snapshots_projection_player"
  ON "replay_player_snapshots"("projection_id", "player_key");
CREATE INDEX "ix_replay_player_snapshots_player_created"
  ON "replay_player_snapshots"("player_key", "created_at");
CREATE INDEX "ix_replay_player_snapshots_user_created"
  ON "replay_player_snapshots"("user_id", "created_at");
CREATE INDEX "ix_replay_player_snapshots_game_player"
  ON "replay_player_snapshots"("game_stats_id", "player_key");

CREATE TABLE "replay_player_metrics" (
  "id" SERIAL PRIMARY KEY,
  "projection_id" INTEGER NOT NULL,
  "player_snapshot_id" INTEGER NOT NULL,
  "game_stats_id" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "metric_key" VARCHAR(160) NOT NULL,
  "metric_group" VARCHAR(32) NOT NULL,
  "value_type" VARCHAR(16) NOT NULL,
  "numeric_value" DECIMAL(30, 6),
  "text_value" VARCHAR(500),
  "boolean_value" BOOLEAN,
  "unit" VARCHAR(32) NOT NULL,
  "aggregation_method" VARCHAR(24) NOT NULL,
  "result_dependency" VARCHAR(24) NOT NULL DEFAULT 'none',
  "stat_eligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "exact" BOOLEAN NOT NULL DEFAULT TRUE,
  "confidence_bps" INTEGER,
  "source_kind" VARCHAR(32) NOT NULL,
  "source_path" VARCHAR(255) NOT NULL,
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_player_metrics_projection"
    FOREIGN KEY ("projection_id") REFERENCES "replay_stat_projections"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_player_metrics_snapshot"
    FOREIGN KEY ("player_snapshot_id") REFERENCES "replay_player_snapshots"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_player_metrics_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_player_metrics_value_type"
    CHECK (
      (
        "value_type" = 'number' AND
        "numeric_value" IS NOT NULL AND
        "text_value" IS NULL AND
        "boolean_value" IS NULL
      ) OR (
        "value_type" = 'text' AND
        "numeric_value" IS NULL AND
        "text_value" IS NOT NULL AND
        char_length("text_value") > 0 AND
        "boolean_value" IS NULL
      ) OR (
        "value_type" = 'boolean' AND
        "numeric_value" IS NULL AND
        "text_value" IS NULL AND
        "boolean_value" IS NOT NULL
      )
    ),
  CONSTRAINT "ck_replay_player_metrics_result_dependency"
    CHECK ("result_dependency" IN ('none', 'resolved_only')),
  CONSTRAINT "ck_replay_player_metrics_confidence"
    CHECK ("confidence_bps" IS NULL OR "confidence_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "ck_replay_player_metrics_metadata"
    CHECK (
      char_length(btrim("metric_key")) > 0 AND
      char_length(btrim("metric_group")) > 0 AND
      char_length(btrim("unit")) > 0 AND
      char_length(btrim("source_kind")) > 0 AND
      char_length(btrim("source_path")) > 0 AND
      jsonb_typeof("provenance") = 'object'
    )
);

CREATE UNIQUE INDEX "uq_replay_player_metrics_idempotency"
  ON "replay_player_metrics"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_player_metrics_snapshot_key"
  ON "replay_player_metrics"("player_snapshot_id", "metric_key");
CREATE INDEX "ix_replay_player_metrics_game_key"
  ON "replay_player_metrics"("game_stats_id", "metric_key");
CREATE INDEX "ix_replay_player_metrics_key_eligible"
  ON "replay_player_metrics"("metric_key", "stat_eligible", "created_at");
CREATE INDEX "ix_replay_player_metrics_projection"
  ON "replay_player_metrics"("projection_id");

CREATE TABLE "replay_game_metrics" (
  "id" SERIAL PRIMARY KEY,
  "projection_id" INTEGER NOT NULL,
  "game_stats_id" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "metric_key" VARCHAR(160) NOT NULL,
  "metric_group" VARCHAR(32) NOT NULL,
  "value_type" VARCHAR(16) NOT NULL,
  "numeric_value" DECIMAL(30, 6),
  "text_value" VARCHAR(500),
  "boolean_value" BOOLEAN,
  "unit" VARCHAR(32) NOT NULL,
  "aggregation_method" VARCHAR(24) NOT NULL,
  "stat_eligible" BOOLEAN NOT NULL DEFAULT TRUE,
  "exact" BOOLEAN NOT NULL DEFAULT TRUE,
  "confidence_bps" INTEGER,
  "source_kind" VARCHAR(32) NOT NULL,
  "source_path" VARCHAR(255) NOT NULL,
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_game_metrics_projection"
    FOREIGN KEY ("projection_id") REFERENCES "replay_stat_projections"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_game_metrics_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_game_metrics_value_type"
    CHECK (
      (
        "value_type" = 'number' AND
        "numeric_value" IS NOT NULL AND
        "text_value" IS NULL AND
        "boolean_value" IS NULL
      ) OR (
        "value_type" = 'text' AND
        "numeric_value" IS NULL AND
        "text_value" IS NOT NULL AND
        char_length("text_value") > 0 AND
        "boolean_value" IS NULL
      ) OR (
        "value_type" = 'boolean' AND
        "numeric_value" IS NULL AND
        "text_value" IS NULL AND
        "boolean_value" IS NOT NULL
      )
    ),
  CONSTRAINT "ck_replay_game_metrics_confidence"
    CHECK ("confidence_bps" IS NULL OR "confidence_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "ck_replay_game_metrics_metadata"
    CHECK (
      char_length(btrim("metric_key")) > 0 AND
      char_length(btrim("metric_group")) > 0 AND
      char_length(btrim("unit")) > 0 AND
      char_length(btrim("source_kind")) > 0 AND
      char_length(btrim("source_path")) > 0 AND
      jsonb_typeof("provenance") = 'object'
    )
);

CREATE UNIQUE INDEX "uq_replay_game_metrics_idempotency"
  ON "replay_game_metrics"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_game_metrics_projection_key"
  ON "replay_game_metrics"("projection_id", "metric_key");
CREATE INDEX "ix_replay_game_metrics_game_key"
  ON "replay_game_metrics"("game_stats_id", "metric_key");
CREATE INDEX "ix_replay_game_metrics_key_eligible"
  ON "replay_game_metrics"("metric_key", "stat_eligible", "created_at");

CREATE TABLE "replay_player_metric_aggregates" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER,
  "best_game_stats_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "build_key" VARCHAR(128) NOT NULL,
  "input_hash" VARCHAR(64) NOT NULL,
  "player_key" VARCHAR(160) NOT NULL,
  "metric_key" VARCHAR(160) NOT NULL,
  "metric_group" VARCHAR(32) NOT NULL,
  "unit" VARCHAR(32) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "metric_dictionary_version" VARCHAR(64) NOT NULL,
  "aggregate_version" VARCHAR(64) NOT NULL,
  "scope_key" VARCHAR(64) NOT NULL DEFAULT 'career',
  "dimension" JSONB NOT NULL,
  "dimension_hash" VARCHAR(64) NOT NULL,
  "result_scope" VARCHAR(32) NOT NULL DEFAULT 'all_stat_eligible',
  "source_projection_count" INTEGER NOT NULL,
  "total_game_count" INTEGER NOT NULL,
  "stat_eligible_game_count" INTEGER NOT NULL,
  "result_eligible_game_count" INTEGER NOT NULL,
  "metric_game_count" INTEGER NOT NULL,
  "coverage_bps" INTEGER NOT NULL,
  "numeric_sum" DECIMAL(30, 6) NOT NULL,
  "numeric_average" DECIMAL(30, 6) NOT NULL,
  "numeric_minimum" DECIMAL(30, 6) NOT NULL,
  "numeric_maximum" DECIMAL(30, 6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_player_metric_aggregates_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_player_metric_aggregates_best_game"
    FOREIGN KEY ("best_game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_player_metric_aggregates_hashes"
    CHECK (
      "input_hash" ~ '^[0-9a-f]{64}$' AND
      "dimension_hash" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "ck_replay_player_metric_aggregates_scope"
    CHECK (
      "result_scope" IN ('all_stat_eligible', 'resolved_only') AND
      jsonb_typeof("dimension") = 'object'
    ),
  CONSTRAINT "ck_replay_player_metric_aggregates_counts"
    CHECK (
      "source_projection_count" >= 1 AND
      "total_game_count" >= 1 AND
      "stat_eligible_game_count" BETWEEN 1 AND "total_game_count" AND
      "result_eligible_game_count" BETWEEN 0 AND "total_game_count" AND
      "metric_game_count" BETWEEN 1 AND "stat_eligible_game_count" AND
      (
        "result_scope" <> 'resolved_only' OR
        "metric_game_count" <= "result_eligible_game_count"
      )
    ),
  CONSTRAINT "ck_replay_player_metric_aggregates_coverage"
    CHECK ("coverage_bps" BETWEEN 0 AND 10000)
);

CREATE UNIQUE INDEX "uq_replay_player_metric_aggregates_idempotency"
  ON "replay_player_metric_aggregates"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_player_metric_aggregates_build_target"
  ON "replay_player_metric_aggregates"(
    "build_key",
    "player_key",
    "metric_key",
    "scope_key",
    "dimension_hash",
    "result_scope"
  );
CREATE INDEX "ix_replay_player_metric_aggregates_player_key"
  ON "replay_player_metric_aggregates"("player_key", "metric_key", "created_at");
CREATE INDEX "ix_replay_player_metric_aggregates_user_key"
  ON "replay_player_metric_aggregates"("user_id", "metric_key", "created_at");
CREATE INDEX "ix_replay_player_metric_aggregates_build"
  ON "replay_player_metric_aggregates"("build_key");

-- Cross-table IDs are duplicated intentionally for hot queries. Reject any
-- attempt to mix a metric/snapshot with a different replay or projection.
CREATE OR REPLACE FUNCTION "enforce_replay_stat_projection_scope"()
RETURNS TRIGGER AS $$
DECLARE
  run_game_stats_id INTEGER;
  superseded_game_stats_id INTEGER;
  superseded_projection_status VARCHAR(24);
BEGIN
  IF NEW."parse_run_id" IS NOT NULL THEN
    SELECT "game_stats_id"
      INTO run_game_stats_id
    FROM "replay_parse_runs"
    WHERE "id" = NEW."parse_run_id";

    IF NOT FOUND OR run_game_stats_id IS DISTINCT FROM NEW."game_stats_id" THEN
      RAISE EXCEPTION
        'replay stat projection parse run must target the same game';
    END IF;
  END IF;

  IF NEW."supersedes_id" IS NOT NULL THEN
    SELECT "game_stats_id", "projection_status"
      INTO superseded_game_stats_id, superseded_projection_status
    FROM "replay_stat_projections"
    WHERE "id" = NEW."supersedes_id";

    IF NOT FOUND OR superseded_game_stats_id <> NEW."game_stats_id" THEN
      RAISE EXCEPTION
        'replay stat projection supersession must remain in the same game';
    END IF;
    IF NEW."projection_status" <> 'accepted' OR
       superseded_projection_status <> 'accepted' THEN
      RAISE EXCEPTION
        'only accepted replay stat projections may supersede accepted projections';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_stat_projections_scope_guard"
BEFORE INSERT ON "replay_stat_projections"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_stat_projection_scope"();

CREATE OR REPLACE FUNCTION "enforce_replay_player_snapshot_scope"()
RETURNS TRIGGER AS $$
DECLARE
  projection_game_stats_id INTEGER;
BEGIN
  SELECT "game_stats_id"
    INTO projection_game_stats_id
  FROM "replay_stat_projections"
  WHERE "id" = NEW."projection_id";

  IF NOT FOUND OR projection_game_stats_id <> NEW."game_stats_id" THEN
    RAISE EXCEPTION
      'replay player snapshot must target its projection game';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_player_snapshots_scope_guard"
BEFORE INSERT ON "replay_player_snapshots"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_player_snapshot_scope"();

CREATE OR REPLACE FUNCTION "enforce_replay_player_metric_scope"()
RETURNS TRIGGER AS $$
DECLARE
  snapshot_projection_id INTEGER;
  snapshot_game_stats_id INTEGER;
  snapshot_stat_eligible BOOLEAN;
BEGIN
  SELECT "projection_id", "game_stats_id", "stat_eligible"
    INTO snapshot_projection_id, snapshot_game_stats_id, snapshot_stat_eligible
  FROM "replay_player_snapshots"
  WHERE "id" = NEW."player_snapshot_id";

  IF NOT FOUND OR
     snapshot_projection_id <> NEW."projection_id" OR
     snapshot_game_stats_id <> NEW."game_stats_id" THEN
    RAISE EXCEPTION
      'replay player metric must target its snapshot projection and game';
  END IF;

  IF NEW."stat_eligible" = TRUE AND snapshot_stat_eligible = FALSE THEN
    RAISE EXCEPTION
      'replay player metric cannot be eligible when its player snapshot is ineligible';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_player_metrics_scope_guard"
BEFORE INSERT ON "replay_player_metrics"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_player_metric_scope"();

CREATE OR REPLACE FUNCTION "enforce_replay_game_metric_scope"()
RETURNS TRIGGER AS $$
DECLARE
  projection_game_stats_id INTEGER;
BEGIN
  SELECT "game_stats_id"
    INTO projection_game_stats_id
  FROM "replay_stat_projections"
  WHERE "id" = NEW."projection_id";

  IF NOT FOUND OR projection_game_stats_id <> NEW."game_stats_id" THEN
    RAISE EXCEPTION
      'replay game metric must target its projection game';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_game_metrics_scope_guard"
BEFORE INSERT ON "replay_game_metrics"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_game_metric_scope"();

-- Corrections are new versioned projections/aggregate builds, never mutation.
DO $$
DECLARE
  history_table TEXT;
BEGIN
  FOREACH history_table IN ARRAY ARRAY[
    'replay_stat_projections',
    'replay_player_snapshots',
    'replay_player_metrics',
    'replay_game_metrics',
    'replay_player_metric_aggregates'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION "prevent_replay_engine_room_mutation"()',
      history_table || '_append_only',
      history_table
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_engine_room_mutation"()',
      history_table || '_append_only_truncate',
      history_table
    );
  END LOOP;
END;
$$;

COMMENT ON TABLE "replay_stat_projections" IS
  'Versioned immutable normalization receipts. Only accepted rows may feed public stats; none can authorize results or settlement.';
COMMENT ON TABLE "replay_player_snapshots" IS
  'Per-projection player identity, team, and independent stat/result eligibility.';
COMMENT ON TABLE "replay_player_metrics" IS
  'Typed per-player facts. Absence means unavailable while numeric zero remains a stored observation.';
COMMENT ON TABLE "replay_game_metrics" IS
  'Typed replay-level facts with exact source and parser provenance.';
COMMENT ON TABLE "replay_player_metric_aggregates" IS
  'Append-only materialized numeric aggregates with explicit coverage and result scope.';

COMMIT;
