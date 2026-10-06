import {
  Prisma,
  type PrismaClient,
} from "@/lib/generated/prisma";

import {
  normalizeLeaderboardDisplayName,
  normalizeLeaderboardSteamId,
} from "@/lib/leaderboardIdentity";
/*
 * Receipt v1 is a frozen authority contract. An Engine Room parser upgrade
 * must not revoke or reinterpret an already accepted current-state snapshot.
 * Supporting a new parser contract requires a separately validated schema.
 */
export const CURRENT_ACCOUNT_OBSERVATION_V1_PARSER = Object.freeze({
  parserName: "aoe2war.mgz_hd",
  parserVersion: "1.8.51",
  schemaVersion: "2026-07-25.1",
  passName: "hd_deterministic_evidence",
  passVersion: "10",
} as const);

export type CurrentWatcherAccountState = {
  steamId: string;
  latestObservedName: string | null;
  nameObservedAt: string | null;
  steamRmRating: number | null;
  steamRmObservedAt: string | null;
  steamDmRating: number | null;
  steamDmObservedAt: string | null;
  ratingObservedAt: string | null;
  lastObservedAt: string | null;
};

type RawCurrentWatcherAccountState = {
  steamId: string;
  latestObservedName: string | null;
  nameObservedAt: Date | null;
  steamRmRating: number | null;
  steamRmObservedAt: Date | null;
  steamDmRating: number | null;
  steamDmObservedAt: Date | null;
};

type CurrentWatcherAccountStateCache = {
  expiresAt: number;
  value: CurrentWatcherAccountState[];
};

const CURRENT_WATCHER_ACCOUNT_STATE_TTL_MS =
  15_000;

let currentWatcherAccountStateCache:
  CurrentWatcherAccountStateCache | null =
    null;

let currentWatcherAccountStatePromise:
  Promise<CurrentWatcherAccountState[]> | null =
    null;

function iso(
  value: Date | null,
) {
  if (!value) {
    return null;
  }

  const ms = value.getTime();

  return Number.isFinite(ms)
    ? new Date(ms).toISOString()
    : null;
}

function newestIso(
  ...values: Array<Date | null>
) {
  let newest: number | null = null;

  for (const value of values) {
    if (!value) continue;

    const ms = value.getTime();

    if (
      Number.isFinite(ms) &&
      (newest === null || ms > newest)
    ) {
      newest = ms;
    }
  }

  return newest === null
    ? null
    : new Date(newest).toISOString();
}

/*
 * Current account state comes from append-only server-owned parse-attempt
 * observations. A verified live source label on mutable GameStats is not a
 * rating snapshot: later imports/reparses may replace its metadata or players.
 * The first valid observation per exact Steam identity and artifact freezes
 * the name, lanes and actual game clock. New distinct live artifacts advance
 * each lane independently; historical/result evidence grants no authority.
 */
async function loadCurrentWatcherAccountStatesFresh(
  prisma: PrismaClient,
): Promise<CurrentWatcherAccountState[]> {
  const rows =
    await prisma.$queryRaw<
      RawCurrentWatcherAccountState[]
    >(Prisma.sql`
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
            '{current_account_observation,parser,name}' = ${CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserName}
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,version}' = ${CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.parserVersion}
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,schema_version}' = ${CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.schemaVersion}
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,pass_name}' = ${CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passName}
          AND a.evidence::jsonb #>>
            '{current_account_observation,parser,pass_version}' = ${CURRENT_ACCOUNT_OBSERVATION_V1_PARSER.passVersion}
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
    `);

  const result:
    CurrentWatcherAccountState[] = [];

  for (const row of rows) {
    const steamId =
      normalizeLeaderboardSteamId(
        row.steamId,
      );

    if (!steamId) {
      continue;
    }

    const latestObservedName =
      normalizeLeaderboardDisplayName(
        row.latestObservedName,
      ) || null;

    result.push({
      steamId,
      latestObservedName,

      nameObservedAt:
        iso(row.nameObservedAt),

      steamRmRating:
        Number.isFinite(
          row.steamRmRating,
        )
          ? row.steamRmRating
          : null,

      steamRmObservedAt:
        iso(row.steamRmObservedAt),

      steamDmRating:
        Number.isFinite(
          row.steamDmRating,
        )
          ? row.steamDmRating
          : null,

      steamDmObservedAt:
        iso(row.steamDmObservedAt),

      ratingObservedAt:
        newestIso(
          row.steamRmObservedAt,
          row.steamDmObservedAt,
        ),

      lastObservedAt:
        newestIso(
          row.nameObservedAt,
          row.steamRmObservedAt,
          row.steamDmObservedAt,
        ),
    });
  }

  return result;
}

function startCurrentWatcherAccountStateRefresh(
  prisma: PrismaClient,
): Promise<CurrentWatcherAccountState[]> {
  if (currentWatcherAccountStatePromise) {
    return currentWatcherAccountStatePromise;
  }

  const run =
    loadCurrentWatcherAccountStatesFresh(
      prisma,
    )
      .then((value) => {
        currentWatcherAccountStateCache = {
          expiresAt:
            Date.now() +
            CURRENT_WATCHER_ACCOUNT_STATE_TTL_MS,
          value,
        };
        return value;
      })
      .finally(() => {
        if (
          currentWatcherAccountStatePromise ===
          run
        ) {
          currentWatcherAccountStatePromise =
            null;
        }
      });

  currentWatcherAccountStatePromise =
    run;
  return run;
}

export async function loadCurrentWatcherAccountStates(
  prisma: PrismaClient,
): Promise<CurrentWatcherAccountState[]> {
  const cached =
    currentWatcherAccountStateCache;

  if (cached) {
    if (
      cached.expiresAt <= Date.now() &&
      !currentWatcherAccountStatePromise
    ) {
      /*
       * Current Watcher ratings are a presentation overlay. Once one good
       * snapshot exists, an expensive exact-Steam history refresh must never
       * turn an unrelated page navigation into a cold request cliff.
       */
      void startCurrentWatcherAccountStateRefresh(
        prisma,
      ).catch((error) => {
        console.warn(
          "Current Watcher account-state background refresh failed:",
          error,
        );
      });
    }

    return cached.value;
  }

  // Only the first process-local population waits for the historical scan.
  return startCurrentWatcherAccountStateRefresh(
    prisma,
  );
}

export function invalidateCurrentWatcherAccountStateCache() {
  currentWatcherAccountStateCache = null;
  currentWatcherAccountStatePromise = null;
}
