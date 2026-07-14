ALTER TABLE "users"
  ADD COLUMN "can_review_own_replay_results" BOOLEAN NOT NULL DEFAULT FALSE;

-- Initial trusted replay reviewers. Route authorization remains capability-based and
-- also requires immutable submission evidence for the specific game.
UPDATE "users"
SET "can_review_own_replay_results" = TRUE
WHERE "uid" IN (
  'u_0df73bdbb64646c19e4a9bfd225b3285',
  'u_79ce46af3d504ceca718e5fda83e3502'
);

CREATE INDEX "ix_replay_parse_attempts_game_stats_user_uid"
  ON "replay_parse_attempts"("game_stats_id", "user_uid");

CREATE TABLE "replay_result_adjudications" (
  "id" SERIAL PRIMARY KEY,
  "game_stats_id" INTEGER NOT NULL,
  "actor_user_id" INTEGER NOT NULL,
  "supersedes_id" INTEGER,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "input_hash" VARCHAR(64) NOT NULL,
  "decision_status" VARCHAR(32) NOT NULL DEFAULT 'accepted',
  "actor_uid_snapshot" VARCHAR(100) NOT NULL,
  "actor_display_name_snapshot" VARCHAR(100) NOT NULL,
  "actor_role" VARCHAR(32) NOT NULL,
  "team_assignments" JSONB NOT NULL,
  "winning_team_key" VARCHAR(128) NOT NULL,
  "winning_player_keys" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence" JSONB,
  "source_replay_hash" VARCHAR(64) NOT NULL,
  "source_parse_iteration" INTEGER NOT NULL,
  "source_roster_hash" VARCHAR(64) NOT NULL,
  "source_proposition_hash" VARCHAR(64) NOT NULL,
  "raw_parser_snapshot" JSONB NOT NULL,
  "market_snapshot" JSONB,
  "has_linked_market" BOOLEAN NOT NULL DEFAULT FALSE,
  "financial_disposition" VARCHAR(40) NOT NULL DEFAULT 'none',
  "affects_stats" BOOLEAN NOT NULL DEFAULT FALSE,
  "affects_bets" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "fk_replay_result_adjudications_game_stats"
    FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_result_adjudications_actor"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "fk_replay_result_adjudications_supersedes"
    FOREIGN KEY ("supersedes_id") REFERENCES "replay_result_adjudications"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "ck_replay_result_adjudications_status"
    CHECK ("decision_status" IN ('accepted', 'pending_admin_approval')),
  CONSTRAINT "ck_replay_result_adjudications_actor_role"
    CHECK ("actor_role" IN ('site_admin', 'verified_submitter')),
  CONSTRAINT "ck_replay_result_adjudications_financial_disposition"
    CHECK ("financial_disposition" IN ('none', 'operator_review_required')),
  CONSTRAINT "ck_replay_result_adjudications_stats_effect"
    CHECK (
      ("decision_status" = 'accepted' AND "affects_stats" = TRUE) OR
      ("decision_status" = 'pending_admin_approval' AND "affects_stats" = FALSE)
    ),
  CONSTRAINT "ck_replay_result_adjudications_market_disposition"
    CHECK (
      ("has_linked_market" = TRUE AND "financial_disposition" = 'operator_review_required') OR
      ("has_linked_market" = FALSE AND "financial_disposition" = 'none')
    ),
  CONSTRAINT "ck_replay_result_adjudications_team_shape"
    CHECK (jsonb_typeof("team_assignments") = 'array' AND jsonb_array_length("team_assignments") = 2),
  CONSTRAINT "ck_replay_result_adjudications_winner_shape"
    CHECK (jsonb_typeof("winning_player_keys") = 'array' AND jsonb_array_length("winning_player_keys") > 0),
  CONSTRAINT "ck_replay_result_adjudications_bets_immutable"
    CHECK ("affects_bets" = FALSE)
);

CREATE UNIQUE INDEX "uq_replay_result_adjudications_idempotency"
  ON "replay_result_adjudications"("idempotency_key");
CREATE INDEX "ix_replay_result_adjudications_game_status"
  ON "replay_result_adjudications"("game_stats_id", "decision_status", "created_at");
CREATE INDEX "ix_replay_result_adjudications_actor"
  ON "replay_result_adjudications"("actor_user_id", "created_at");
CREATE INDEX "ix_replay_result_adjudications_supersedes"
  ON "replay_result_adjudications"("supersedes_id");
CREATE INDEX "ix_replay_result_adjudications_replay_hash"
  ON "replay_result_adjudications"("source_replay_hash");

COMMENT ON TABLE "replay_result_adjudications" IS
  'Append-only replay result verdicts. Accepted verdicts affect the read projection only; financial records require a separate operator workflow.';
COMMENT ON COLUMN "replay_result_adjudications"."market_snapshot" IS
  'Point-in-time market, wager, claim, and integrity state captured before accepting or proposing the verdict.';
COMMENT ON COLUMN "replay_result_adjudications"."affects_bets" IS
  'Always false in this ledger. Settlement, refunds, claims, and chain movement are handled by separate audited workflows.';

CREATE OR REPLACE FUNCTION "prevent_replay_result_adjudication_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'replay_result_adjudications is append-only; append a superseding verdict instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "replay_result_adjudications_append_only"
BEFORE UPDATE OR DELETE ON "replay_result_adjudications"
FOR EACH ROW EXECUTE FUNCTION "prevent_replay_result_adjudication_mutation"();
