-- Direct battle-level provenance target for evidence that exists before
-- a parser run, observation, or human adjudication exists.

ALTER TABLE "replay_evidence_links"
  ADD COLUMN "game_stats_id" INTEGER;

ALTER TABLE "replay_evidence_links"
  ADD CONSTRAINT "fk_replay_evidence_links_game_stats"
  FOREIGN KEY ("game_stats_id")
  REFERENCES "game_stats"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

CREATE INDEX "ix_replay_evidence_links_game_stats"
  ON "replay_evidence_links"("game_stats_id");

ALTER TABLE "replay_evidence_links"
  DROP CONSTRAINT "ck_replay_evidence_links_target";

ALTER TABLE "replay_evidence_links"
  ADD CONSTRAINT "ck_replay_evidence_links_target"
  CHECK (
    "game_stats_id" IS NOT NULL OR
    "parse_run_id" IS NOT NULL OR
    "observation_id" IS NOT NULL OR
    "result_adjudication_id" IS NOT NULL
  );


-- Preserve and strengthen evidence scope integrity.
-- A link may target a GameStats row directly. When multiple provenance
-- targets are supplied, every resolvable game scope must agree.

CREATE OR REPLACE FUNCTION "enforce_replay_evidence_link_scope"()
RETURNS TRIGGER AS $$
DECLARE
  parse_run_game_id INTEGER;
  observation_parse_run_id INTEGER;
  observation_game_id INTEGER;
  adjudication_game_id INTEGER;
BEGIN
  IF NEW."parse_run_id" IS NOT NULL THEN
    SELECT "game_stats_id"
      INTO parse_run_game_id
    FROM "replay_parse_runs"
    WHERE "id" = NEW."parse_run_id";

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'replay evidence parse_run_id does not exist';
    END IF;
  END IF;

  IF NEW."observation_id" IS NOT NULL THEN
    SELECT
      observation."parse_run_id",
      run."game_stats_id"
    INTO
      observation_parse_run_id,
      observation_game_id
    FROM "replay_observations" observation
    JOIN "replay_parse_runs" run
      ON run."id" = observation."parse_run_id"
    WHERE observation."id" = NEW."observation_id";

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'replay evidence observation_id does not exist';
    END IF;
  END IF;

  IF NEW."result_adjudication_id" IS NOT NULL THEN
    SELECT "game_stats_id"
      INTO adjudication_game_id
    FROM "replay_result_adjudications"
    WHERE "id" =
      NEW."result_adjudication_id";

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'replay evidence result_adjudication_id does not exist';
    END IF;
  END IF;


  IF
    NEW."parse_run_id" IS NOT NULL AND
    NEW."observation_id" IS NOT NULL AND
    observation_parse_run_id <>
      NEW."parse_run_id"
  THEN
    RAISE EXCEPTION
      'replay evidence observation must belong to parse_run_id';
  END IF;


  IF
    NEW."game_stats_id" IS NOT NULL AND
    NEW."parse_run_id" IS NOT NULL AND
    parse_run_game_id IS DISTINCT FROM
      NEW."game_stats_id"
  THEN
    RAISE EXCEPTION
      'replay evidence parse_run_id must match game_stats_id';
  END IF;


  IF
    NEW."game_stats_id" IS NOT NULL AND
    NEW."observation_id" IS NOT NULL AND
    observation_game_id IS DISTINCT FROM
      NEW."game_stats_id"
  THEN
    RAISE EXCEPTION
      'replay evidence observation must match game_stats_id';
  END IF;


  IF
    NEW."game_stats_id" IS NOT NULL AND
    NEW."result_adjudication_id" IS NOT NULL AND
    adjudication_game_id IS DISTINCT FROM
      NEW."game_stats_id"
  THEN
    RAISE EXCEPTION
      'replay evidence adjudication must match game_stats_id';
  END IF;


  IF
    NEW."parse_run_id" IS NOT NULL AND
    NEW."result_adjudication_id" IS NOT NULL AND
    parse_run_game_id IS DISTINCT FROM
      adjudication_game_id
  THEN
    RAISE EXCEPTION
      'replay evidence parse run and adjudication must target the same game';
  END IF;


  IF
    NEW."observation_id" IS NOT NULL AND
    NEW."result_adjudication_id" IS NOT NULL AND
    observation_game_id IS DISTINCT FROM
      adjudication_game_id
  THEN
    RAISE EXCEPTION
      'replay evidence observation and adjudication must target the same game';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
