BEGIN;

-- Human-confirmed desync truth is intentionally independent from winner/result
-- adjudication and from financial settlement. A later YES/NO desync prop may use
-- this ledger as authoritative evidence, but this migration creates no market or
-- payout behavior.
CREATE TABLE "replay_desync_incidents" (
  "id" SERIAL PRIMARY KEY,
  "game_stats_id" INTEGER NOT NULL,
  "scheduled_match_id" INTEGER,
  "reviewer_user_id" INTEGER NOT NULL,
  "supersedes_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "input_hash" VARCHAR(64) NOT NULL,
  "desync_occurred" BOOLEAN NOT NULL,
  "competitive_result_status" VARCHAR(24) NOT NULL DEFAULT 'unresolved',
  "settlement_disposition" VARCHAR(32) NOT NULL DEFAULT 'commissioner_review',
  "reviewer_uid_snapshot" VARCHAR(100) NOT NULL,
  "reviewer_display_name_snapshot" VARCHAR(100) NOT NULL,
  "note" TEXT,
  "source_replay_hash" VARCHAR(64) NOT NULL,
  "source_parse_iteration" INTEGER NOT NULL,
  "parser_desync_candidate" BOOLEAN NOT NULL DEFAULT FALSE,
  "machine_evidence" JSONB NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_desync_incidents_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_desync_incidents_scheduled_match"
    FOREIGN KEY ("scheduled_match_id") REFERENCES "scheduled_matches"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_desync_incidents_reviewer"
    FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_desync_incidents_supersedes"
    FOREIGN KEY ("supersedes_id") REFERENCES "replay_desync_incidents"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_desync_incidents_correction"
    CHECK ("desync_occurred" = TRUE OR "supersedes_id" IS NOT NULL),
  CONSTRAINT "ck_replay_desync_incidents_initial_review"
    CHECK (
      "supersedes_id" IS NOT NULL OR (
        "desync_occurred" = TRUE AND
        "competitive_result_status" = 'unresolved' AND
        "settlement_disposition" = 'commissioner_review'
      )
    ),
  CONSTRAINT "ck_replay_desync_incidents_competitive_status"
    CHECK ("competitive_result_status" IN ('unresolved', 'not_applicable')),
  CONSTRAINT "ck_replay_desync_incidents_settlement_disposition"
    CHECK ("settlement_disposition" IN ('commissioner_review', 'rematch', 'void_refund', 'not_applicable')),
  CONSTRAINT "ck_replay_desync_incidents_axis_consistency"
    CHECK (
      (
        "desync_occurred" = TRUE AND
        "competitive_result_status" = 'unresolved' AND
        "settlement_disposition" IN ('commissioner_review', 'rematch', 'void_refund')
      ) OR (
        "desync_occurred" = FALSE AND
        "competitive_result_status" = 'not_applicable' AND
        "settlement_disposition" = 'not_applicable'
      )
    ),
  CONSTRAINT "ck_replay_desync_incidents_machine_evidence"
    CHECK (jsonb_typeof("machine_evidence") = 'object')
);

CREATE UNIQUE INDEX "uq_replay_desync_incidents_idempotency"
  ON "replay_desync_incidents"("idempotency_key");
CREATE UNIQUE INDEX "uq_replay_desync_incidents_supersedes"
  ON "replay_desync_incidents"("supersedes_id");
-- PostgreSQL permits multiple NULLs in a regular unique index. This partial
-- unique index additionally permits only one root incident chain per replay.
CREATE UNIQUE INDEX "uq_replay_desync_incidents_game_root"
  ON "replay_desync_incidents"("game_stats_id")
  WHERE "supersedes_id" IS NULL;
CREATE INDEX "ix_replay_desync_incidents_game_created"
  ON "replay_desync_incidents"("game_stats_id", "created_at");
CREATE INDEX "ix_replay_desync_incidents_match_created"
  ON "replay_desync_incidents"("scheduled_match_id", "created_at");
CREATE INDEX "ix_replay_desync_incidents_reviewer_created"
  ON "replay_desync_incidents"("reviewer_user_id", "created_at");
CREATE INDEX "ix_replay_desync_incidents_truth_created"
  ON "replay_desync_incidents"("desync_occurred", "created_at");
CREATE INDEX "ix_replay_desync_incidents_parser_ground_truth"
  ON "replay_desync_incidents"("parser_desync_candidate", "desync_occurred");
CREATE INDEX "ix_replay_desync_incidents_replay_hash"
  ON "replay_desync_incidents"("source_replay_hash");

COMMENT ON TABLE "replay_desync_incidents" IS
  'Append-only human desync ground truth. It neither chooses a winner nor authorizes settlement.';
COMMENT ON COLUMN "replay_desync_incidents"."desync_occurred" IS
  'The human conclusion for this append event. FALSE is only valid as a superseding correction.';
COMMENT ON COLUMN "replay_desync_incidents"."competitive_result_status" IS
  'Independent competitive-result axis. A confirmed desync never manufactures a winner.';
COMMENT ON COLUMN "replay_desync_incidents"."settlement_disposition" IS
  'Independent protocol disposition; not proof that any refund or payment executed.';
COMMENT ON COLUMN "replay_desync_incidents"."parser_desync_candidate" IS
  'Machine suspicion captured separately at review time; never promoted to human truth automatically.';
COMMENT ON COLUMN "replay_desync_incidents"."scheduled_match_id" IS
  'Optional exact Challenge Match association resolved from existing application linkage.';

CREATE OR REPLACE FUNCTION "enforce_replay_desync_incident_scope"()
RETURNS TRIGGER AS $$
DECLARE
  superseded_game_stats_id INTEGER;
BEGIN
  IF NEW."supersedes_id" IS NOT NULL THEN
    SELECT "game_stats_id"
      INTO superseded_game_stats_id
    FROM "replay_desync_incidents"
    WHERE "id" = NEW."supersedes_id";

    IF NOT FOUND THEN
      RAISE EXCEPTION 'superseded replay desync incident does not exist';
    END IF;

    IF superseded_game_stats_id <> NEW."game_stats_id" THEN
      RAISE EXCEPTION 'replay desync correction must remain in the same game scope';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_desync_incidents_scope"
BEFORE INSERT ON "replay_desync_incidents"
FOR EACH ROW EXECUTE FUNCTION "enforce_replay_desync_incident_scope"();

CREATE OR REPLACE FUNCTION "prevent_replay_desync_incident_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'replay_desync_incidents is append-only; append a superseding incident instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_desync_incidents_append_only"
BEFORE UPDATE OR DELETE ON "replay_desync_incidents"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_desync_incident_mutation"();

CREATE TRIGGER "replay_desync_incidents_append_only_truncate"
BEFORE TRUNCATE ON "replay_desync_incidents"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_desync_incident_mutation"();

COMMIT;
