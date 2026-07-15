-- Additive private replay Engine Room foundation. These tables preserve raw
-- artifacts, provenance, parser candidates, promotion history, and resumable
-- reprocessing state without changing game_stats or any public aggregate.

BEGIN;

CREATE TABLE "replay_artifacts" (
  "id" SERIAL PRIMARY KEY,
  "sha256" VARCHAR(64) NOT NULL,
  "byte_size" BIGINT NOT NULL,
  "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'filesystem',
  "storage_key" VARCHAR(1000) NOT NULL,
  "original_extension" VARCHAR(32),
  "media_type" VARCHAR(100),
  "header_fingerprint" VARCHAR(128),
  "archive_metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_replay_artifacts_sha256"
    CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ck_replay_artifacts_byte_size"
    CHECK ("byte_size" > 0)
);

CREATE UNIQUE INDEX "uq_replay_artifacts_sha256"
  ON "replay_artifacts"("sha256");
CREATE UNIQUE INDEX "uq_replay_artifacts_storage_key"
  ON "replay_artifacts"("storage_key");
CREATE INDEX "ix_replay_artifacts_created_at"
  ON "replay_artifacts"("created_at");

CREATE TABLE "replay_submissions" (
  "id" SERIAL PRIMARY KEY,
  "artifact_id" INTEGER NOT NULL,
  "submitted_by_user_id" INTEGER,
  "legacy_parse_attempt_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "submitter_uid_snapshot" VARCHAR(100),
  "source" VARCHAR(32) NOT NULL,
  "original_filename" VARCHAR(255),
  "client_submission_id" VARCHAR(128),
  "transport_metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_submissions_artifact"
    FOREIGN KEY ("artifact_id") REFERENCES "replay_artifacts"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_submissions_user"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_submissions_legacy_attempt"
    FOREIGN KEY ("legacy_parse_attempt_id") REFERENCES "replay_parse_attempts"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_submissions_source"
    CHECK (char_length(btrim("source")) > 0)
);

CREATE UNIQUE INDEX "uq_replay_submissions_idempotency"
  ON "replay_submissions"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_submissions_legacy_attempt"
  ON "replay_submissions"("legacy_parse_attempt_id");
CREATE INDEX "ix_replay_submissions_artifact_created"
  ON "replay_submissions"("artifact_id", "created_at");
CREATE INDEX "ix_replay_submissions_user_created"
  ON "replay_submissions"("submitted_by_user_id", "created_at");
CREATE INDEX "ix_replay_submissions_source_created"
  ON "replay_submissions"("source", "created_at");

CREATE TABLE "replay_parse_runs" (
  "id" SERIAL PRIMARY KEY,
  "artifact_id" INTEGER NOT NULL,
  "submission_id" INTEGER,
  "legacy_parse_attempt_id" INTEGER,
  "game_stats_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "run_identity_hash" VARCHAR(64) NOT NULL,
  "parser_name" VARCHAR(64) NOT NULL,
  "parser_version" VARCHAR(64) NOT NULL,
  "parser_build" VARCHAR(128),
  "pass_name" VARCHAR(64) NOT NULL,
  "pass_version" VARCHAR(64) NOT NULL,
  "schema_version" VARCHAR(64) NOT NULL,
  "input_hash" VARCHAR(64) NOT NULL,
  "parser_config_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(24) NOT NULL,
  "candidate_output_hash" VARCHAR(64),
  "candidate_output_storage_provider" VARCHAR(32),
  "candidate_output_storage_key" VARCHAR(1000),
  "candidate_output_byte_size" BIGINT,
  "observation_count" INTEGER NOT NULL DEFAULT 0,
  "action_count" INTEGER NOT NULL DEFAULT 0,
  "failure_signature" VARCHAR(128),
  "failure_detail" TEXT,
  "metrics" JSONB,
  "candidate_only" BOOLEAN NOT NULL DEFAULT TRUE,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT FALSE,
  "started_at" TIMESTAMP(6) NOT NULL,
  "completed_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_parse_runs_artifact"
    FOREIGN KEY ("artifact_id") REFERENCES "replay_artifacts"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_parse_runs_submission"
    FOREIGN KEY ("submission_id") REFERENCES "replay_submissions"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_parse_runs_legacy_attempt"
    FOREIGN KEY ("legacy_parse_attempt_id") REFERENCES "replay_parse_attempts"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_parse_runs_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_parse_runs_hashes"
    CHECK (
      "run_identity_hash" ~ '^[0-9a-f]{64}$' AND
      "input_hash" ~ '^[0-9a-f]{64}$' AND
      "parser_config_hash" ~ '^[0-9a-f]{64}$' AND
      (
        "candidate_output_hash" IS NULL OR
        "candidate_output_hash" ~ '^[0-9a-f]{64}$'
      )
    ),
  CONSTRAINT "ck_replay_parse_runs_status"
    CHECK ("status" IN ('completed', 'failed', 'skipped')),
  CONSTRAINT "ck_replay_parse_runs_timing"
    CHECK ("completed_at" >= "started_at"),
  CONSTRAINT "ck_replay_parse_runs_failure"
    CHECK ("status" <> 'failed' OR "failure_signature" IS NOT NULL),
  CONSTRAINT "ck_replay_parse_runs_completed_output"
    CHECK (
      "status" <> 'completed' OR
      (
        "candidate_output_hash" IS NOT NULL AND
        "candidate_output_storage_provider" IS NOT NULL AND
        "candidate_output_storage_key" IS NOT NULL AND
        "candidate_output_byte_size" > 0
      )
    ),
  CONSTRAINT "ck_replay_parse_runs_output_locator"
    CHECK (
      (
        "candidate_output_hash" IS NULL AND
        "candidate_output_storage_provider" IS NULL AND
        "candidate_output_storage_key" IS NULL AND
        "candidate_output_byte_size" IS NULL
      ) OR
      (
        "candidate_output_hash" IS NOT NULL AND
        "candidate_output_storage_provider" IS NOT NULL AND
        "candidate_output_storage_key" IS NOT NULL AND
        "candidate_output_byte_size" > 0
      )
    ),
  CONSTRAINT "ck_replay_parse_runs_output_counts"
    CHECK ("observation_count" >= 0 AND "action_count" >= 0),
  CONSTRAINT "ck_replay_parse_runs_candidate_only"
    CHECK ("candidate_only" = TRUE AND "affects_public_aggregates" = FALSE)
);

CREATE UNIQUE INDEX "uq_replay_parse_runs_idempotency"
  ON "replay_parse_runs"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_parse_runs_artifact_identity"
  ON "replay_parse_runs"("artifact_id", "run_identity_hash");
CREATE UNIQUE INDEX "uq_replay_parse_runs_output_storage_key"
  ON "replay_parse_runs"("candidate_output_storage_key");
CREATE INDEX "ix_replay_parse_runs_artifact_created"
  ON "replay_parse_runs"("artifact_id", "created_at");
CREATE INDEX "ix_replay_parse_runs_game_created"
  ON "replay_parse_runs"("game_stats_id", "created_at");
CREATE INDEX "ix_replay_parse_runs_legacy_attempt"
  ON "replay_parse_runs"("legacy_parse_attempt_id");
CREATE INDEX "ix_replay_parse_runs_status_created"
  ON "replay_parse_runs"("status", "created_at");

CREATE TABLE "replay_observations" (
  "id" SERIAL PRIMARY KEY,
  "parse_run_id" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "observation_key" VARCHAR(160) NOT NULL,
  "observation_kind" VARCHAR(40) NOT NULL,
  "field_path" VARCHAR(255) NOT NULL,
  "value" JSONB NOT NULL,
  "value_hash" VARCHAR(64) NOT NULL,
  "confidence_bps" INTEGER,
  "provenance" JSONB NOT NULL,
  "candidate_only" BOOLEAN NOT NULL DEFAULT TRUE,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_observations_parse_run"
    FOREIGN KEY ("parse_run_id") REFERENCES "replay_parse_runs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_observations_value_hash"
    CHECK ("value_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ck_replay_observations_confidence"
    CHECK ("confidence_bps" IS NULL OR "confidence_bps" BETWEEN 0 AND 10000),
  CONSTRAINT "ck_replay_observations_candidate_only"
    CHECK ("candidate_only" = TRUE AND "affects_public_aggregates" = FALSE)
);

CREATE UNIQUE INDEX "uq_replay_observations_idempotency"
  ON "replay_observations"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_observations_run_key"
  ON "replay_observations"("parse_run_id", "observation_key");
CREATE INDEX "ix_replay_observations_run_field"
  ON "replay_observations"("parse_run_id", "field_path");
CREATE INDEX "ix_replay_observations_kind_created"
  ON "replay_observations"("observation_kind", "created_at");
CREATE INDEX "ix_replay_observations_value_hash"
  ON "replay_observations"("value_hash");

CREATE TABLE "replay_observation_promotions" (
  "id" SERIAL PRIMARY KEY,
  "observation_id" INTEGER NOT NULL,
  "game_stats_id" INTEGER,
  "result_adjudication_id" INTEGER,
  "promoted_by_user_id" INTEGER,
  "supersedes_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "promotion_key" VARCHAR(255) NOT NULL,
  "decision_hash" VARCHAR(64) NOT NULL,
  "policy_version" VARCHAR(64) NOT NULL,
  "reason" TEXT NOT NULL,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_promotions_observation"
    FOREIGN KEY ("observation_id") REFERENCES "replay_observations"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_promotions_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_promotions_adjudication"
    FOREIGN KEY ("result_adjudication_id") REFERENCES "replay_result_adjudications"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_promotions_actor"
    FOREIGN KEY ("promoted_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_promotions_supersedes"
    FOREIGN KEY ("supersedes_id") REFERENCES "replay_observation_promotions"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_promotions_decision_hash"
    CHECK ("decision_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ck_replay_promotions_reason"
    CHECK (char_length(btrim("reason")) >= 8),
  CONSTRAINT "ck_replay_promotions_private"
    CHECK ("affects_public_aggregates" = FALSE),
  CONSTRAINT "ck_replay_promotions_not_self"
    CHECK ("supersedes_id" IS NULL OR "supersedes_id" <> "id")
);

CREATE UNIQUE INDEX "uq_replay_promotions_supersedes"
  ON "replay_observation_promotions"("supersedes_id");
CREATE UNIQUE INDEX "uq_replay_promotions_idempotency"
  ON "replay_observation_promotions"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_promotions_observation_key"
  ON "replay_observation_promotions"("observation_id", "promotion_key");
CREATE INDEX "ix_replay_promotions_game_key"
  ON "replay_observation_promotions"("game_stats_id", "promotion_key", "created_at");
CREATE INDEX "ix_replay_promotions_adjudication"
  ON "replay_observation_promotions"("result_adjudication_id");
CREATE INDEX "ix_replay_promotions_actor_created"
  ON "replay_observation_promotions"("promoted_by_user_id", "created_at");

CREATE TABLE "replay_evidence_artifacts" (
  "id" SERIAL PRIMARY KEY,
  "sha256" VARCHAR(64) NOT NULL,
  "byte_size" BIGINT NOT NULL,
  "storage_provider" VARCHAR(32) NOT NULL DEFAULT 'filesystem',
  "storage_key" VARCHAR(1000) NOT NULL,
  "evidence_kind" VARCHAR(40) NOT NULL,
  "media_type" VARCHAR(100),
  "source_parse_run_id" INTEGER,
  "source_candidate_output_hash" VARCHAR(64),
  "captured_at" TIMESTAMP(6),
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_replay_evidence_artifacts_sha256"
    CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ck_replay_evidence_artifacts_byte_size"
    CHECK ("byte_size" > 0),
  CONSTRAINT "fk_replay_evidence_source_parse_run"
    FOREIGN KEY ("source_parse_run_id") REFERENCES "replay_parse_runs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_evidence_source_output"
    CHECK (
      (
        "source_parse_run_id" IS NULL AND
        "source_candidate_output_hash" IS NULL
      ) OR
      (
        "source_parse_run_id" IS NOT NULL AND
        "source_candidate_output_hash" ~ '^[0-9a-f]{64}$'
      )
    )
);

CREATE UNIQUE INDEX "uq_replay_evidence_artifacts_sha256"
  ON "replay_evidence_artifacts"("sha256");
CREATE UNIQUE INDEX "uq_replay_evidence_storage_key"
  ON "replay_evidence_artifacts"("storage_key");
CREATE INDEX "ix_replay_evidence_kind_created"
  ON "replay_evidence_artifacts"("evidence_kind", "created_at");
CREATE INDEX "ix_replay_evidence_source_parse_run"
  ON "replay_evidence_artifacts"("source_parse_run_id");

CREATE TABLE "replay_evidence_links" (
  "id" SERIAL PRIMARY KEY,
  "evidence_artifact_id" INTEGER NOT NULL,
  "parse_run_id" INTEGER,
  "observation_id" INTEGER,
  "result_adjudication_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "purpose" VARCHAR(64) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_evidence_links_artifact"
    FOREIGN KEY ("evidence_artifact_id") REFERENCES "replay_evidence_artifacts"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_evidence_links_parse_run"
    FOREIGN KEY ("parse_run_id") REFERENCES "replay_parse_runs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_evidence_links_observation"
    FOREIGN KEY ("observation_id") REFERENCES "replay_observations"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_evidence_links_adjudication"
    FOREIGN KEY ("result_adjudication_id") REFERENCES "replay_result_adjudications"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_evidence_links_target"
    CHECK (
      "parse_run_id" IS NOT NULL OR
      "observation_id" IS NOT NULL OR
      "result_adjudication_id" IS NOT NULL
    )
);

CREATE UNIQUE INDEX "uq_replay_evidence_links_idempotency"
  ON "replay_evidence_links"("idempotency_key");
CREATE INDEX "ix_replay_evidence_links_artifact"
  ON "replay_evidence_links"("evidence_artifact_id", "created_at");
CREATE INDEX "ix_replay_evidence_links_parse_run"
  ON "replay_evidence_links"("parse_run_id");
CREATE INDEX "ix_replay_evidence_links_observation"
  ON "replay_evidence_links"("observation_id");
CREATE INDEX "ix_replay_evidence_links_adjudication"
  ON "replay_evidence_links"("result_adjudication_id");

CREATE TABLE "replay_reprocess_jobs" (
  "id" SERIAL PRIMARY KEY,
  "requested_by_user_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "job_identity_hash" VARCHAR(64) NOT NULL,
  "scope_kind" VARCHAR(40) NOT NULL,
  "scope" JSONB NOT NULL,
  "scope_hash" VARCHAR(64) NOT NULL,
  "parser_name" VARCHAR(64) NOT NULL,
  "parser_version" VARCHAR(64) NOT NULL,
  "pass_name" VARCHAR(64) NOT NULL,
  "pass_version" VARCHAR(64) NOT NULL,
  "parser_config_hash" VARCHAR(64) NOT NULL,
  "batch_size" INTEGER NOT NULL DEFAULT 50,
  "max_artifacts" INTEGER NOT NULL,
  "max_attempts_per_artifact" INTEGER NOT NULL DEFAULT 2,
  "dry_run" BOOLEAN NOT NULL DEFAULT TRUE,
  "candidate_only" BOOLEAN NOT NULL DEFAULT TRUE,
  "affects_public_aggregates" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_reprocess_jobs_requester"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_reprocess_jobs_hashes"
    CHECK (
      "job_identity_hash" ~ '^[0-9a-f]{64}$' AND
      "scope_hash" ~ '^[0-9a-f]{64}$' AND
      "parser_config_hash" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "ck_replay_reprocess_jobs_bounds"
    CHECK (
      "batch_size" BETWEEN 1 AND 500 AND
      "max_artifacts" BETWEEN 1 AND 100000 AND
      "batch_size" <= "max_artifacts" AND
      "max_attempts_per_artifact" BETWEEN 1 AND 10
    ),
  CONSTRAINT "ck_replay_reprocess_jobs_candidate_only"
    CHECK ("candidate_only" = TRUE AND "affects_public_aggregates" = FALSE)
);

CREATE UNIQUE INDEX "uq_replay_reprocess_jobs_idempotency"
  ON "replay_reprocess_jobs"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_reprocess_jobs_identity"
  ON "replay_reprocess_jobs"("job_identity_hash");
CREATE INDEX "ix_replay_reprocess_jobs_requester"
  ON "replay_reprocess_jobs"("requested_by_user_id", "created_at");
CREATE INDEX "ix_replay_reprocess_jobs_scope_created"
  ON "replay_reprocess_jobs"("scope_kind", "created_at");

CREATE TABLE "replay_reprocess_job_events" (
  "id" SERIAL PRIMARY KEY,
  "job_id" INTEGER NOT NULL,
  "artifact_id" INTEGER,
  "parse_run_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "event_type" VARCHAR(32) NOT NULL,
  "worker_key" VARCHAR(128),
  "checkpoint_cursor" VARCHAR(500),
  "attempt_number" INTEGER NOT NULL DEFAULT 0,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "succeeded_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "detail" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_reprocess_events_job"
    FOREIGN KEY ("job_id") REFERENCES "replay_reprocess_jobs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_reprocess_events_artifact"
    FOREIGN KEY ("artifact_id") REFERENCES "replay_artifacts"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_reprocess_events_parse_run"
    FOREIGN KEY ("parse_run_id") REFERENCES "replay_parse_runs"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_reprocess_events_sequence"
    CHECK ("sequence" >= 0),
  CONSTRAINT "ck_replay_reprocess_events_type"
    CHECK (
      "event_type" IN (
        'queued', 'leased', 'batch_started', 'artifact_completed',
        'checkpointed', 'paused', 'completed', 'failed', 'cancelled'
      )
    ),
  CONSTRAINT "ck_replay_reprocess_events_attempt"
    CHECK ("attempt_number" >= 0),
  CONSTRAINT "ck_replay_reprocess_events_counts"
    CHECK (
      "processed_count" >= 0 AND
      "succeeded_count" >= 0 AND
      "failed_count" >= 0 AND
      "skipped_count" >= 0 AND
      "processed_count" = "succeeded_count" + "failed_count" + "skipped_count"
    ),
  CONSTRAINT "ck_replay_reprocess_events_shape"
    CHECK (
      ("event_type" <> 'leased' OR "worker_key" IS NOT NULL) AND
      ("event_type" <> 'checkpointed' OR "checkpoint_cursor" IS NOT NULL) AND
      (
        "event_type" <> 'artifact_completed' OR
        (
          "artifact_id" IS NOT NULL AND
          "parse_run_id" IS NOT NULL AND
          "attempt_number" >= 1 AND
          NULLIF(btrim("detail" ->> 'manifest_cursor'), '') IS NOT NULL
        )
      )
    )
);

CREATE UNIQUE INDEX "uq_replay_reprocess_events_idempotency"
  ON "replay_reprocess_job_events"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_reprocess_events_job_sequence"
  ON "replay_reprocess_job_events"("job_id", "sequence");
CREATE INDEX "ix_replay_reprocess_events_job_created"
  ON "replay_reprocess_job_events"("job_id", "created_at");
CREATE INDEX "ix_replay_reprocess_events_artifact"
  ON "replay_reprocess_job_events"("artifact_id", "created_at");
CREATE INDEX "ix_replay_reprocess_events_type_created"
  ON "replay_reprocess_job_events"("event_type", "created_at");
CREATE UNIQUE INDEX "uq_replay_reprocess_events_job_manifest_cursor"
  ON "replay_reprocess_job_events"(
    "job_id",
    (("detail" ->> 'manifest_cursor'))
  )
  WHERE "event_type" = 'artifact_completed';

-- Job state is derived from this immutable stream. The insert trigger locks the
-- job manifest, rejects gaps/branches, enforces monotonic counters, and prevents
-- events after a terminal state so a worker can safely resume from the last row.
CREATE OR REPLACE FUNCTION "enforce_replay_reprocess_event_stream"()
RETURNS TRIGGER AS $$
DECLARE
  previous_event "replay_reprocess_job_events"%ROWTYPE;
  job_max_artifacts INTEGER;
  job_max_attempts INTEGER;
  parse_run_artifact_id INTEGER;
BEGIN
  SELECT "max_artifacts", "max_attempts_per_artifact"
    INTO job_max_artifacts, job_max_attempts
  FROM "replay_reprocess_jobs"
  WHERE "id" = NEW."job_id"
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'reprocess job % does not exist', NEW."job_id";
  END IF;

  SELECT * INTO previous_event
  FROM "replay_reprocess_job_events"
  WHERE "job_id" = NEW."job_id"
  ORDER BY "sequence" DESC
  LIMIT 1;

  IF NOT FOUND THEN
    IF NEW."sequence" <> 0 OR NEW."event_type" <> 'queued' THEN
      RAISE EXCEPTION 'first reprocess job event must be queued at sequence 0';
    END IF;
    IF NEW."processed_count" <> 0 OR
       NEW."succeeded_count" <> 0 OR
       NEW."failed_count" <> 0 OR
       NEW."skipped_count" <> 0 THEN
      RAISE EXCEPTION 'queued reprocess job counters must all be zero';
    END IF;
  ELSE
    IF previous_event."event_type" IN ('completed', 'failed', 'cancelled') THEN
      RAISE EXCEPTION 'reprocess job % is terminal', NEW."job_id";
    END IF;
    IF NEW."sequence" <> previous_event."sequence" + 1 THEN
      RAISE EXCEPTION 'reprocess job % expected sequence %, received %',
        NEW."job_id", previous_event."sequence" + 1, NEW."sequence";
    END IF;
    IF NEW."event_type" = 'queued' THEN
      RAISE EXCEPTION 'queued is valid only at reprocess job sequence 0';
    END IF;
    IF NEW."processed_count" < previous_event."processed_count" OR
       NEW."succeeded_count" < previous_event."succeeded_count" OR
       NEW."failed_count" < previous_event."failed_count" OR
       NEW."skipped_count" < previous_event."skipped_count" THEN
      RAISE EXCEPTION 'reprocess job counters must be monotonic';
    END IF;
    IF NEW."event_type" = 'artifact_completed' THEN
      IF NEW."processed_count" <> previous_event."processed_count" + 1 THEN
        RAISE EXCEPTION 'artifact_completed must advance processed_count by exactly one';
      END IF;

      SELECT "artifact_id" INTO parse_run_artifact_id
      FROM "replay_parse_runs"
      WHERE "id" = NEW."parse_run_id";

      IF NOT FOUND OR parse_run_artifact_id <> NEW."artifact_id" THEN
        RAISE EXCEPTION 'artifact_completed parse_run_id must belong to artifact_id';
      END IF;
    ELSIF NEW."processed_count" <> previous_event."processed_count" OR
          NEW."succeeded_count" <> previous_event."succeeded_count" OR
          NEW."failed_count" <> previous_event."failed_count" OR
          NEW."skipped_count" <> previous_event."skipped_count" THEN
      RAISE EXCEPTION 'only artifact_completed may advance reprocess job counters';
    END IF;
  END IF;

  IF NEW."processed_count" > job_max_artifacts THEN
    RAISE EXCEPTION 'reprocess job % exceeded max_artifacts %',
      NEW."job_id", job_max_artifacts;
  END IF;
  IF NEW."attempt_number" > job_max_attempts THEN
    RAISE EXCEPTION 'reprocess job % exceeded max attempts per artifact %',
      NEW."job_id", job_max_attempts;
  END IF;
  IF NEW."event_type" = 'completed' AND
     NEW."processed_count" <> job_max_artifacts THEN
    RAISE EXCEPTION 'completed reprocess job must account for every manifest artifact';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_reprocess_events_stream_guard"
BEFORE INSERT ON "replay_reprocess_job_events"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_reprocess_event_stream"();

-- A superseding private promotion must stay on the same semantic target. The
-- new observation may differ, but cross-game/cross-field history chains are
-- rejected. An adjudication bridge must name the same GameStats row.
CREATE OR REPLACE FUNCTION "enforce_replay_promotion_history"()
RETURNS TRIGGER AS $$
DECLARE
  prior_promotion "replay_observation_promotions"%ROWTYPE;
  adjudicated_game_id INTEGER;
  observation_game_id INTEGER;
  observation_field_path VARCHAR(255);
  observation_subject JSONB;
  prior_field_path VARCHAR(255);
  prior_subject JSONB;
BEGIN
  SELECT run."game_stats_id", observation."field_path", observation."provenance" -> 'subject'
    INTO observation_game_id, observation_field_path, observation_subject
  FROM "replay_observations" observation
  JOIN "replay_parse_runs" run ON run."id" = observation."parse_run_id"
  WHERE observation."id" = NEW."observation_id";

  IF NOT FOUND OR observation_game_id IS DISTINCT FROM NEW."game_stats_id" THEN
    RAISE EXCEPTION 'replay promotion game_stats_id must match its observation parse run';
  END IF;

  IF NEW."supersedes_id" IS NOT NULL THEN
    SELECT * INTO prior_promotion
    FROM "replay_observation_promotions"
    WHERE "id" = NEW."supersedes_id";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'superseded replay promotion % does not exist', NEW."supersedes_id";
    END IF;
    IF prior_promotion."promotion_key" <> NEW."promotion_key" OR
       prior_promotion."game_stats_id" IS DISTINCT FROM NEW."game_stats_id" OR
       prior_promotion."result_adjudication_id" IS DISTINCT FROM NEW."result_adjudication_id" THEN
      RAISE EXCEPTION 'superseding replay promotion must preserve its semantic target';
    END IF;

    SELECT "field_path", "provenance" -> 'subject'
      INTO prior_field_path, prior_subject
    FROM "replay_observations"
    WHERE "id" = prior_promotion."observation_id";

    IF prior_field_path IS DISTINCT FROM observation_field_path OR
       prior_subject IS DISTINCT FROM observation_subject THEN
      RAISE EXCEPTION 'superseding replay promotion must preserve field and subject';
    END IF;
  END IF;

  IF NEW."result_adjudication_id" IS NOT NULL THEN
    SELECT "game_stats_id" INTO adjudicated_game_id
    FROM "replay_result_adjudications"
    WHERE "id" = NEW."result_adjudication_id";

    IF NOT FOUND OR NEW."game_stats_id" IS NULL OR
       NEW."game_stats_id" <> adjudicated_game_id THEN
      RAISE EXCEPTION 'replay promotion adjudication must match game_stats_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_promotions_history_guard"
BEFORE INSERT ON "replay_observation_promotions"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_promotion_history"();

CREATE OR REPLACE FUNCTION "enforce_replay_evidence_source_output"()
RETURNS TRIGGER AS $$
DECLARE
  parse_run_output_hash VARCHAR(64);
BEGIN
  IF NEW."source_parse_run_id" IS NOT NULL THEN
    SELECT "candidate_output_hash" INTO parse_run_output_hash
    FROM "replay_parse_runs"
    WHERE "id" = NEW."source_parse_run_id";

    IF NOT FOUND OR parse_run_output_hash IS NULL OR
       parse_run_output_hash <> NEW."source_candidate_output_hash" THEN
      RAISE EXCEPTION 'replay evidence must reference the exact immutable candidate output';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_evidence_source_output_guard"
BEFORE INSERT ON "replay_evidence_artifacts"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_evidence_source_output"();

CREATE OR REPLACE FUNCTION "enforce_replay_evidence_link_scope"()
RETURNS TRIGGER AS $$
DECLARE
  observation_parse_run_id INTEGER;
BEGIN
  IF NEW."parse_run_id" IS NOT NULL AND NEW."observation_id" IS NOT NULL THEN
    SELECT "parse_run_id" INTO observation_parse_run_id
    FROM "replay_observations"
    WHERE "id" = NEW."observation_id";

    IF NOT FOUND OR observation_parse_run_id <> NEW."parse_run_id" THEN
      RAISE EXCEPTION 'replay evidence observation must belong to parse_run_id';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_evidence_links_scope_guard"
BEFORE INSERT ON "replay_evidence_links"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_evidence_link_scope"();

-- All Engine Room facts are history. Corrections and progress are represented by
-- new rows (promotion supersession and job events), never UPDATE or DELETE.
CREATE OR REPLACE FUNCTION "prevent_replay_engine_room_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; append a new history row instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  history_table TEXT;
BEGIN
  FOREACH history_table IN ARRAY ARRAY[
    'replay_artifacts',
    'replay_submissions',
    'replay_parse_runs',
    'replay_observations',
    'replay_observation_promotions',
    'replay_evidence_artifacts',
    'replay_evidence_links',
    'replay_reprocess_jobs',
    'replay_reprocess_job_events'
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

COMMENT ON TABLE "replay_artifacts" IS
  'Immutable SHA-256 addressed AoE2HD replay source artifacts.';
COMMENT ON TABLE "replay_parse_runs" IS
  'Immutable completed parser passes. Output is candidate-only and cannot mutate public aggregates.';
COMMENT ON TABLE "replay_observations" IS
  'Immutable parser candidates. Acceptance is a separate replay_observation_promotions row.';
COMMENT ON TABLE "replay_observation_promotions" IS
  'Private Engine Room promotion history; never a direct GameStats/public aggregate write.';
COMMENT ON TABLE "replay_reprocess_jobs" IS
  'Immutable bounded job manifest; status and checkpoints derive from append-only events.';
COMMENT ON TABLE "replay_reprocess_job_events" IS
  'Append-only, gapless, terminal-aware reprocessing event and checkpoint stream.';

COMMIT;
