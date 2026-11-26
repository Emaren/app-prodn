-- R25 nonfinancial public Watcher-account state; exact frozen parser SQL.
-- Source parity with lib/currentWatcherAccountState.ts is checked by tests.
-- Only seven sanitized account display fields are exposed, no raw replay
-- evidence, source hashes, uploader identities, signed keys or financial data.
BEGIN;
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
   OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='aoe2war_web_prod' AND rolcanlogin
         AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole)
   OR pg_catalog.to_regclass('public.replay_parse_attempts') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_WATCHER_SOURCE_PREFLIGHT_HOLD';
 END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS aoe2war_public_v3 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v3 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v3 TO aoe2war_web_prod;
CREATE OR REPLACE VIEW aoe2war_public_v3.current_watcher_account_states
WITH (security_barrier=true) AS
WITH eligible_attempts AS (
        SELECT
          a.id AS attempt_id,
          LOWER(a.replay_hash) AS replay_hash,
          a.played_on AS observed_game_at,
          a.evidence::jsonb->'current_account_observation' AS observation
        FROM replay_parse_attempts a
        WHERE a.upload_mode = 'watcher'
          AND a.parse_source IN ('watcher_live', 'watcher_final')
          AND a.status IN (
            'stored', 'duplicate_final', 'duplicate_final_refreshed',
            'duplicate_live', 'live_placeholder_refreshed',
            'duplicate_reviewed_match', 'reviewed_match_refreshed',
            'reviewed_match_artifact_advanced'
          )
          AND a.played_on IS NOT NULL
          AND a.played_on <= a.created_at
          -- Current Steam account evidence must be a fresh observed match;
          -- late arrival of a truly old replay stays historical evidence.
          AND a.played_on >= a.created_at - INTERVAL '48 hours'
          -- Original client replay filename is immutable receipt metadata.
          -- A match saved in 2025 must never become an October 2026
          -- current-account rating merely because an API temp file was new.
          -- Allow 48h for source-local timezone/date ambiguity.
          AND (
            SUBSTRING(a.original_filename FROM
              '@([0-9]{4}[.][0-9]{2}[.][0-9]{2})') IS NULL
            OR SUBSTRING(a.original_filename FROM
              '@([0-9]{4}[.][0-9]{2}[.][0-9]{2})') IN (
              TO_CHAR(a.played_on - INTERVAL '2 days', 'YYYY.MM.DD'),
              TO_CHAR(a.played_on - INTERVAL '1 day', 'YYYY.MM.DD'),
              TO_CHAR(a.played_on, 'YYYY.MM.DD'),
              TO_CHAR(a.played_on + INTERVAL '1 day', 'YYYY.MM.DD'),
              TO_CHAR(a.played_on + INTERVAL '2 days', 'YYYY.MM.DD')
            )
          )
          AND a.user_uid IS NOT NULL AND BTRIM(a.user_uid) <> '' AND a.user_uid <> 'system'
          AND LOWER(a.replay_hash) ~ '^[a-f0-9]{64}$'
          AND a.evidence::jsonb #>>
            '{current_account_observation,schema}' = 'aoe2war-current-account-observation/v1'
          AND a.evidence::jsonb #>>
            '{current_account_observation,uploader_uid}' = a.user_uid
          AND LOWER(a.evidence::jsonb #>>
            '{current_account_observation,replay_sha256}') = LOWER(a.replay_hash)
          AND a.evidence::jsonb #>>
            '{current_account_observation,parse_source}' = a.parse_source
          AND a.evidence::jsonb #>>
            '{current_account_observation,upload_mode}' = a.upload_mode
          AND a.evidence::jsonb #>>
            '{current_account_observation,observed_game_at}' =
              TO_CHAR(a.played_on, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
          AND a.evidence::jsonb #>>
            '{current_account_observation,captured_at}' =
              TO_CHAR(a.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') || 'Z'
          AND a.evidence::jsonb #>
            '{current_account_observation,archive_verified}' = 'true'::jsonb
          AND a.evidence::jsonb #>
            '{current_account_observation,result_authority}' = 'false'::jsonb
          AND a.evidence::jsonb #>
            '{current_account_observation,candidate_result_authority}' = 'false'::jsonb
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,name}' = 'aoe2war.mgz_hd'
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,version}' = '1.8.51'
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,schema_version}' = '2026-07-25.1'
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,pass_name}' = 'hd_deterministic_evidence'
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,pass_version}' = '10'
          AND (
            (a.parse_source = 'watcher_live' AND a.evidence::jsonb #>
              '{current_account_observation,parser,options,apply_hd_early_exit_rules}' = 'false'::jsonb)
            OR (a.parse_source = 'watcher_final' AND a.evidence::jsonb #>
              '{current_account_observation,parser,options,apply_hd_early_exit_rules}' = 'true'::jsonb)
          )
          AND a.evidence::jsonb #>>
            '{current_account_observation,provenance,ingestion_provenance}' = 'live_monitor'
          AND a.evidence::jsonb #>
            '{current_account_observation,provenance,provenance_signature_verified}' = 'true'::jsonb
          AND a.evidence::jsonb #>
            '{current_account_observation,provenance,client_sha256_verified}' = 'true'::jsonb
          AND LOWER(a.evidence::jsonb #>>
            '{current_account_observation,provenance,server_sha256}') = LOWER(a.replay_hash)
          AND LOWER(a.evidence::jsonb #>>
            '{current_account_observation,provenance,client_sha256}') = LOWER(a.replay_hash)
          AND (
            (a.parse_source = 'watcher_live' AND a.evidence::jsonb #>>
              '{current_account_observation,provenance,file_role}' = 'live_checkpoint')
            OR (a.parse_source = 'watcher_final' AND a.evidence::jsonb #>>
              '{current_account_observation,provenance,file_role}' IN ('final_recording', 'legacy_recording'))
          )
          AND CASE WHEN jsonb_typeof(a.evidence::jsonb #>
            '{current_account_observation,players}') = 'array'
            THEN jsonb_array_length(a.evidence::jsonb #>
              '{current_account_observation,players}') BETWEEN 2 AND 8
            ELSE false END
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(a.evidence::jsonb #>
                '{current_account_observation,players}') = 'array'
                THEN a.evidence::jsonb #> '{current_account_observation,players}'
                ELSE '[]'::jsonb END
            ) v
            WHERE jsonb_typeof(v) <> 'object'
              OR jsonb_typeof(v->'steam_id') IS DISTINCT FROM 'string'
              OR COALESCE(v->>'steam_id', '') !~ '^[0-9]{17}$'
              OR jsonb_typeof(v->'name') IS DISTINCT FROM 'string'
              OR COALESCE(BTRIM(v->>'name'), '') = ''
              OR CASE WHEN v->'steam_rm_rating' IS NULL OR jsonb_typeof(v->'steam_rm_rating') = 'null'
                THEN v #> '{steam_rating_sources,steam_rm_rating}' IS DISTINCT FROM 'null'::jsonb
                ELSE v #>> '{steam_rating_sources,steam_rm_rating}' IS DISTINCT FROM 'hd_header' END
              OR CASE WHEN v->'steam_dm_rating' IS NULL OR jsonb_typeof(v->'steam_dm_rating') = 'null'
                THEN v #> '{steam_rating_sources,steam_dm_rating}' IS DISTINCT FROM 'null'::jsonb
                ELSE v #>> '{steam_rating_sources,steam_dm_rating}' IS DISTINCT FROM 'hd_header' END
              OR CASE
                WHEN v->'steam_rm_rating' IS NULL OR jsonb_typeof(v->'steam_rm_rating') = 'null' THEN false
                WHEN jsonb_typeof(v->'steam_rm_rating') = 'number' AND v->>'steam_rm_rating' ~ '^[0-9]{1,10}$'
                  THEN (v->>'steam_rm_rating')::numeric > 2147483647
                ELSE true END
              OR CASE
                WHEN v->'steam_dm_rating' IS NULL OR jsonb_typeof(v->'steam_dm_rating') = 'null' THEN false
                WHEN jsonb_typeof(v->'steam_dm_rating') = 'number' AND v->>'steam_dm_rating' ~ '^[0-9]{1,10}$'
                  THEN (v->>'steam_dm_rating')::numeric > 2147483647
                ELSE true END
          )
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(a.evidence::jsonb #>
                '{current_account_observation,players}') = 'array'
                THEN a.evidence::jsonb #> '{current_account_observation,players}'
                ELSE '[]'::jsonb END
            ) v GROUP BY v->>'steam_id' HAVING COUNT(*) > 1
          )
      ),
      raw_observations AS (
        SELECT
          a.attempt_id,
          a.replay_hash,
          a.observed_game_at,
          player->>'steam_id' AS steam_id,
          NULLIF(BTRIM(player->>'name'), '') AS display_name,
          CASE WHEN jsonb_typeof(player->'steam_rm_rating') = 'number'
            AND player->>'steam_rm_rating' ~ '^[0-9]{1,10}$'
            THEN CASE WHEN (player->>'steam_rm_rating')::numeric <= 2147483647
              THEN (player->>'steam_rm_rating')::integer END
          END AS steam_rm_rating,
          CASE WHEN jsonb_typeof(player->'steam_dm_rating') = 'number'
            AND player->>'steam_dm_rating' ~ '^[0-9]{1,10}$'
            THEN CASE WHEN (player->>'steam_dm_rating')::numeric <= 2147483647
              THEN (player->>'steam_dm_rating')::integer END
          END AS steam_dm_rating,
          COUNT(*) OVER (
            PARTITION BY a.attempt_id, player->>'steam_id'
          ) AS identity_count
        FROM eligible_attempts a
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(a.observation->'players') = 'array'
            THEN a.observation->'players' ELSE '[]'::jsonb END
        ) AS participant(player)
      ),
      valid_observations AS (
        SELECT DISTINCT ON (steam_id, replay_hash) *
        FROM raw_observations
        WHERE steam_id ~ '^[0-9]{17}$' AND identity_count = 1
        ORDER BY steam_id, replay_hash, attempt_id ASC
      ),

      latest_name AS (
        SELECT DISTINCT ON (steam_id)
          steam_id,
          display_name,
          observed_game_at,
          attempt_id
        FROM valid_observations
        WHERE display_name IS NOT NULL
        ORDER BY
          steam_id,
          observed_game_at DESC,
          attempt_id DESC
      ),

      latest_rm AS (
        SELECT DISTINCT ON (steam_id)
          steam_id,
          steam_rm_rating,
          observed_game_at,
          attempt_id
        FROM valid_observations
        WHERE steam_rm_rating IS NOT NULL
        ORDER BY
          steam_id,
          observed_game_at DESC,
          attempt_id DESC
      ),

      latest_dm AS (
        SELECT DISTINCT ON (steam_id)
          steam_id,
          steam_dm_rating,
          observed_game_at,
          attempt_id
        FROM valid_observations
        WHERE steam_dm_rating IS NOT NULL
        ORDER BY
          steam_id,
          observed_game_at DESC,
          attempt_id DESC
      ),

      account_ids AS (
        SELECT steam_id FROM latest_name
        UNION
        SELECT steam_id FROM latest_rm
        UNION
        SELECT steam_id FROM latest_dm
      )

      SELECT
        account_ids.steam_id
          AS "steamId",

        latest_name.display_name
          AS "latestObservedName",

        latest_name.observed_game_at AT TIME ZONE 'UTC'
          AS "nameObservedAt",

        latest_rm.steam_rm_rating
          AS "steamRmRating",

        latest_rm.observed_game_at AT TIME ZONE 'UTC'
          AS "steamRmObservedAt",

        latest_dm.steam_dm_rating
          AS "steamDmRating",

        latest_dm.observed_game_at AT TIME ZONE 'UTC'
          AS "steamDmObservedAt"

      FROM account_ids

      LEFT JOIN latest_name
        USING (steam_id)

      LEFT JOIN latest_rm
        USING (steam_id)

      LEFT JOIN latest_dm
        USING (steam_id)

      ORDER BY account_ids.steam_id
;
REVOKE ALL ON aoe2war_public_v3.current_watcher_account_states FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v3.current_watcher_account_states TO aoe2war_web_prod;
DO $postflight$
BEGIN
 IF pg_catalog.has_table_privilege('aoe2war_web_prod','public.replay_parse_attempts','SELECT')
 OR pg_catalog.has_schema_privilege('aoe2war_web_prod','aoe2war_public_v3','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_WATCHER_RAW_EVIDENCE_AUTHORITY_DRIFT';
 END IF;
END
$postflight$;
COMMIT;
