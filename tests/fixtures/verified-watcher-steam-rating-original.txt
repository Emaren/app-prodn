-- Exact original SQL source at f833d7e633cee4b36f1427fa45d76081fa0796ef
WITH verified_games AS MATERIALIZED (
      SELECT g.id, g.played_on, g.timestamp, g.players::jsonb AS players
      FROM game_stats g
      WHERE g.parse_source IN ('watcher_live','watcher_final')
        -- Historical backfills can retain a watcher_final parse_source;
        -- their manual result/metadata repair is never rating authority.
        AND COALESCE(g.parse_reason, '') NOT IN (
          'manual_backfill', 'manual_override',
          'engine_room_structural_projection'
        )
        AND g.played_on IS NOT NULL
        AND g.played_on <= NOW() + INTERVAL '5 minutes'
        -- An authentic archived game date is not a current rating.
        AND g.played_on >= g.created_at - INTERVAL '48 hours'
        -- Original client replay source must agree with alleged game clock.
        -- Filename is source-local; 48h accounts for timezone ambiguity.
        AND (
          SUBSTRING(g.original_filename FROM
            '@([0-9]{4}[.][0-9]{2}[.][0-9]{2})') IS NULL
          OR SUBSTRING(g.original_filename FROM
            '@([0-9]{4}[.][0-9]{2}[.][0-9]{2})') IN (
            TO_CHAR(g.played_on - INTERVAL '2 days', 'YYYY.MM.DD'),
            TO_CHAR(g.played_on - INTERVAL '1 day', 'YYYY.MM.DD'),
            TO_CHAR(g.played_on, 'YYYY.MM.DD'),
            TO_CHAR(g.played_on + INTERVAL '1 day', 'YYYY.MM.DD'),
            TO_CHAR(g.played_on + INTERVAL '2 days', 'YYYY.MM.DD')
          )
        )
        AND CASE WHEN
          (g.key_events::jsonb #>> '{watcher_upload,file_mtime_ms}') ~ '^[0-9]{13}$'
          THEN g.played_on <= (
            TO_TIMESTAMP((
              g.key_events::jsonb #>> '{watcher_upload,file_mtime_ms}'
            )::numeric / 1000) AT TIME ZONE 'UTC'
          ) + INTERVAL '48 hours'
          ELSE true
        END
        AND g.user_uid IS NOT NULL AND BTRIM(g.user_uid) <> ''
        AND g.user_uid <> 'system'
        AND LOWER(g.replay_hash) ~ '^[a-f0-9]{64}$'
        AND g.key_events::jsonb #>> '{watcher_upload,ingestion_provenance}' = 'live_monitor'
        AND (
          g.key_events::jsonb #>
            '{watcher_upload,provenance_signature_verified}' = 'true'::jsonb
          OR (
            -- Frozen, display-only compatibility window for Watcher rows
            -- ingested before the corrected signed-UID API/proxy contract.
            -- The old verifier rejected all known live-monitor signatures
            -- because it used the account UID, not the Watcher's signed UID.
            -- No future reupload can enter this window by backdating replay.
            g.created_at < TIMESTAMP '2026-10-09 00:00:00'
            AND g.played_on < TIMESTAMP '2026-10-09 00:00:00'
            AND g.key_events::jsonb #>
              '{watcher_upload,provenance_signature_verified}' = 'false'::jsonb
          )
        )
        AND g.key_events::jsonb #> '{watcher_upload,client_sha256_verified}' = 'true'::jsonb
        AND LOWER(g.key_events::jsonb #>> '{watcher_upload,server_sha256}') = LOWER(g.replay_hash)
        AND LOWER(g.key_events::jsonb #>> '{watcher_upload,client_sha256}') = LOWER(g.replay_hash)
        AND g.key_events::jsonb #> '{watcher_upload,checkpoint_final_rejected}' = 'false'::jsonb
        AND (
          (g.parse_source = 'watcher_live' AND NOT g.is_final
           AND g.key_events::jsonb #>> '{watcher_upload,file_role}' = 'live_checkpoint')
          OR
          (g.parse_source = 'watcher_final' AND g.is_final
           AND g.key_events::jsonb #>> '{watcher_upload,file_role}'
             IN ('final_recording','legacy_recording'))
        )
    ),
    observations AS (
      SELECT game.id, game.played_on, game.timestamp, p->>'steam_id' AS steam_id,
        COUNT(*) OVER (PARTITION BY game.id, p->>'steam_id') AS identity_count,
        CASE WHEN jsonb_typeof(p->'steam_rm_rating') = 'number'
            AND p->>'steam_rm_rating' ~ '^[0-9]{1,5}$'
            AND (p->>'steam_rm_rating')::integer BETWEEN 1 AND 5000
            AND COALESCE(p #>> '{steam_rating_sources,steam_rm_rating}', 'unmarked')
              IN ('hd_header','unmarked')
          THEN (p->>'steam_rm_rating')::integer END AS rm,
        CASE WHEN jsonb_typeof(p->'steam_dm_rating') = 'number'
            AND p->>'steam_dm_rating' ~ '^[0-9]{1,5}$'
            AND (p->>'steam_dm_rating')::integer BETWEEN 1 AND 5000
            AND COALESCE(p #>> '{steam_rating_sources,steam_dm_rating}', 'unmarked')
              IN ('hd_header','unmarked','summary_rate_snapshot')
          THEN (p->>'steam_dm_rating')::integer END AS dm
      FROM verified_games game
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(game.players) = 'array'
          THEN game.players ELSE '[]'::jsonb END
      ) participant(p)
      WHERE jsonb_typeof(p) = 'object' AND p->>'steam_id' ~ '^[0-9]{17}$'
    ),
    rm AS (
      SELECT DISTINCT ON (steam_id) steam_id, rm AS value, played_on
      FROM observations WHERE rm IS NOT NULL AND identity_count = 1
      ORDER BY steam_id, played_on DESC, timestamp DESC NULLS LAST, id DESC
    ),
    dm AS (
      SELECT DISTINCT ON (steam_id) steam_id, dm AS value, played_on
      FROM observations WHERE dm IS NOT NULL AND identity_count = 1
      ORDER BY steam_id, played_on DESC, timestamp DESC NULLS LAST, id DESC
    ),
    ids AS (SELECT steam_id FROM rm UNION SELECT steam_id FROM dm)
    SELECT ids.steam_id AS "steamId",
      rm.value AS "steamRmRating",
      rm.played_on AT TIME ZONE 'UTC' AS "steamRmObservedAt",
      dm.value AS "steamDmRating",
      dm.played_on AT TIME ZONE 'UTC' AS "steamDmObservedAt"
    FROM ids
    LEFT JOIN rm USING (steam_id)
    LEFT JOIN dm USING (steam_id)
    ORDER BY ids.steam_id
