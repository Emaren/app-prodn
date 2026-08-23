/*
 * Challenge Foundation V3 — rematch-aware canonical replay identity.
 *
 * Constitution:
 *
 *   one final GameStats replay → at most one ScheduledMatch
 *
 *   one ScheduledMatch → zero or more immutable replay claims
 *   across explicitly authorized competitive attempts
 *
 *   one ScheduledMatch → zero or one explicit CURRENT replay claim
 *
 * linked_session_key remains provenance/display metadata.
 */

CREATE TABLE "scheduled_match_replay_claims" (
  "id" SERIAL NOT NULL,

  "scheduled_match_id"
    INTEGER NOT NULL,

  "game_stats_id"
    INTEGER NOT NULL,

  "linked_session_key_snapshot"
    VARCHAR(255) NOT NULL,

  "claim_source"
    VARCHAR(40) NOT NULL
    DEFAULT 'watcher_reconciler',

  "created_at"
    TIMESTAMP(6) NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scheduled_match_replay_claims_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "uq_sched_match_replay_claim_game"
    UNIQUE ("game_stats_id"),

  CONSTRAINT "ck_sched_match_replay_claim_session"
    CHECK (
      char_length(
        btrim(
          "linked_session_key_snapshot"
        )
      ) > 0
    ),

  CONSTRAINT "scheduled_match_replay_claim_match_fkey"
    FOREIGN KEY ("scheduled_match_id")
    REFERENCES "scheduled_matches"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION,

  CONSTRAINT "scheduled_match_replay_claim_game_fkey"
    FOREIGN KEY ("game_stats_id")
    REFERENCES "game_stats"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION
);


CREATE INDEX
  "ix_sched_match_replay_claim_match_history"
ON "scheduled_match_replay_claims"(
  "scheduled_match_id",
  "id"
);


CREATE INDEX
  "ix_sched_match_replay_claim_created"
ON "scheduled_match_replay_claims"(
  "created_at"
);


/*
 * Historical exact backfill.
 *
 * Mirrors resolveFinalGameStatsIdForSessionKey().
 */
WITH resolved AS (
  SELECT
    sm."id"
      AS scheduled_match_id,

    sm."linked_session_key"
      AS linked_session_key,

    canonical_game."id"
      AS game_stats_id

  FROM "scheduled_matches" sm

  JOIN LATERAL (
    SELECT
      gs."id"

    FROM "game_stats" gs

    WHERE
      gs."is_final" = TRUE

      AND gs."parse_reason" <>
        'watcher_final_unparsed'

      AND (
        (
          left(
            btrim(
              sm."linked_session_key"
            ),
            9
          ) = 'platform:'

          AND (
            gs."key_events"
            #>>
            '{platform_match_id}'
          ) =
          nullif(
            btrim(
              substring(
                btrim(
                  sm."linked_session_key"
                )
                FROM 10
              )
            ),
            ''
          )
        )

        OR

        (
          left(
            btrim(
              sm."linked_session_key"
            ),
            9
          ) <> 'platform:'

          AND (
            gs."original_filename" =
              btrim(
                sm."linked_session_key"
              )

            OR

            gs."replay_file" =
              btrim(
                sm."linked_session_key"
              )

            OR

            gs."original_filename" =
              regexp_replace(
                btrim(
                  sm."linked_session_key"
                ),
                '^.*/',
                ''
              )

            OR

            gs."replay_file" =
              regexp_replace(
                btrim(
                  sm."linked_session_key"
                ),
                '^.*/',
                ''
              )
          )
        )
      )

    ORDER BY
      gs."timestamp" DESC,
      gs."created_at" DESC,
      gs."id" DESC

    LIMIT 1
  ) canonical_game
    ON TRUE

  WHERE
    sm."linked_session_key"
      IS NOT NULL

    AND btrim(
      sm."linked_session_key"
    ) <> ''
)

INSERT INTO "scheduled_match_replay_claims" (
  "scheduled_match_id",
  "game_stats_id",
  "linked_session_key_snapshot",
  "claim_source"
)

SELECT
  resolved.scheduled_match_id,

  resolved.game_stats_id,

  btrim(
    resolved.linked_session_key
  ),

  'legacy_linked_session_backfill'

FROM resolved

ORDER BY
  resolved.scheduled_match_id;


/*
 * Current competitive identity is an explicit pointer.
 *
 * Nullable keeps the migration backward compatible with old
 * application code and represents "no currently verified replay"
 * during a desync rematch.
 */
ALTER TABLE "scheduled_matches"
ADD COLUMN "current_replay_claim_id"
  INTEGER;


UPDATE "scheduled_matches" sm
SET
  "current_replay_claim_id" =
    claim."id"

FROM "scheduled_match_replay_claims" claim

WHERE
  claim."scheduled_match_id" =
    sm."id"

  AND sm."linked_session_key"
    IS NOT NULL

  AND btrim(
    sm."linked_session_key"
  ) <> '';


ALTER TABLE "scheduled_matches"
ADD CONSTRAINT
  "uq_sched_match_current_replay_claim"
UNIQUE (
  "current_replay_claim_id"
);


ALTER TABLE "scheduled_matches"
ADD CONSTRAINT
  "scheduled_matches_current_replay_claim_fkey"
FOREIGN KEY (
  "current_replay_claim_id"
)
REFERENCES
  "scheduled_match_replay_claims"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;


/*
 * The current pointer must always reference a claim belonging
 * to the SAME ScheduledMatch.
 */
CREATE FUNCTION
  "enforce_scheduled_match_current_replay_claim_owner"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."current_replay_claim_id" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "scheduled_match_replay_claims" claim
    WHERE
      claim."id" =
        NEW."current_replay_claim_id"

      AND claim."scheduled_match_id" =
        NEW."id"
  ) THEN
    RAISE EXCEPTION
      'current replay claim % does not belong to scheduled match %',
      NEW."current_replay_claim_id",
      NEW."id";
  END IF;

  RETURN NEW;
END;
$$;


CREATE TRIGGER
  "scheduled_matches_current_replay_claim_owner"
BEFORE INSERT OR UPDATE OF
  "current_replay_claim_id"
ON "scheduled_matches"
FOR EACH ROW
EXECUTE FUNCTION
  "enforce_scheduled_match_current_replay_claim_owner"();


/*
 * Fail closed on historical resolution.
 */
DO $$
DECLARE
  linked_matches INTEGER;
  replay_claims INTEGER;
  current_claims INTEGER;
  invalid_claims INTEGER;
  invalid_current INTEGER;
BEGIN
  SELECT
    count(*)
  INTO
    linked_matches
  FROM "scheduled_matches"
  WHERE
    "linked_session_key"
      IS NOT NULL
    AND btrim(
      "linked_session_key"
    ) <> '';


  SELECT
    count(*)
  INTO
    replay_claims
  FROM "scheduled_match_replay_claims";


  SELECT
    count(*)
  INTO
    current_claims
  FROM "scheduled_matches"
  WHERE
    "current_replay_claim_id"
      IS NOT NULL;


  IF replay_claims <> linked_matches THEN
    RAISE EXCEPTION
      'Challenge replay backfill failed: % linked matches but % claims',
      linked_matches,
      replay_claims;
  END IF;


  IF current_claims <> linked_matches THEN
    RAISE EXCEPTION
      'Challenge current replay backfill failed: % linked matches but % current claims',
      linked_matches,
      current_claims;
  END IF;


  SELECT
    count(*)
  INTO
    invalid_claims

  FROM "scheduled_match_replay_claims" claim

  JOIN "game_stats" gs
    ON gs."id" =
       claim."game_stats_id"

  WHERE
    gs."is_final" <> TRUE

    OR gs."parse_reason" =
      'watcher_final_unparsed';


  IF invalid_claims <> 0 THEN
    RAISE EXCEPTION
      'Challenge replay backfill produced % invalid final replay claim(s)',
      invalid_claims;
  END IF;


  SELECT
    count(*)
  INTO
    invalid_current

  FROM "scheduled_matches" sm

  JOIN "scheduled_match_replay_claims" claim
    ON claim."id" =
       sm."current_replay_claim_id"

  WHERE
    claim."scheduled_match_id" <>
      sm."id";


  IF invalid_current <> 0 THEN
    RAISE EXCEPTION
      'Challenge current replay backfill produced % cross-match pointer(s)',
      invalid_current;
  END IF;
END
$$;


/*
 * Replay claim history is evidence and cannot be rewritten.
 */
CREATE FUNCTION
  "prevent_scheduled_match_replay_claim_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'scheduled_match_replay_claims are immutable';
END;
$$;


CREATE TRIGGER
  "scheduled_match_replay_claims_immutable"
BEFORE UPDATE OR DELETE
ON "scheduled_match_replay_claims"
FOR EACH ROW
EXECUTE FUNCTION
  "prevent_scheduled_match_replay_claim_mutation"();


CREATE TRIGGER
  "scheduled_match_replay_claims_no_truncate"
BEFORE TRUNCATE
ON "scheduled_match_replay_claims"
FOR EACH STATEMENT
EXECUTE FUNCTION
  "prevent_scheduled_match_replay_claim_mutation"();
