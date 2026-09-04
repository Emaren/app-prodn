import {
  Prisma,
  type PrismaClient,
} from "@/lib/generated/prisma";

import {
  normalizeLeaderboardDisplayName,
  normalizeLeaderboardSteamId,
} from "@/lib/leaderboardIdentity";

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
 * Current account state is deliberately separate from historical
 * replay/publication truth.
 *
 * Only exact-Steam Watcher observations with a real played_on may enter
 * this rail. Upload time, parse time, acceptance time, and finality are
 * not current-state chronology.
 *
 * watcher_live is intentionally included: it may be the newest exact
 * observation even though it is not eligible for historical W/L truth.
 */
async function loadCurrentWatcherAccountStatesFresh(
  prisma: PrismaClient,
): Promise<CurrentWatcherAccountState[]> {
  const rows =
    await prisma.$queryRaw<
      RawCurrentWatcherAccountState[]
    >(Prisma.sql`
      WITH raw_observations AS (
        SELECT
          COALESCE(
            NULLIF(player->>'steam_id', ''),
            NULLIF(player->>'steamId', ''),
            NULLIF(player->>'user_id', '')
          ) AS steam_id,

          NULLIF(
            BTRIM(player->>'name'),
            ''
          ) AS display_name,

          CASE
            WHEN NULLIF(
              player->>'steam_rm_rating',
              ''
            ) ~ '^[0-9]+$'
            THEN (
              player->>'steam_rm_rating'
            )::integer
            ELSE NULL
          END AS steam_rm_rating,

          CASE
            WHEN NULLIF(
              player->>'steam_dm_rating',
              ''
            ) ~ '^[0-9]+$'
            THEN (
              player->>'steam_dm_rating'
            )::integer
            ELSE NULL
          END AS steam_dm_rating,

          g.played_on,
          g.id AS game_stats_id
        FROM game_stats g
        CROSS JOIN LATERAL
          jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(
                COALESCE(
                  g.players::jsonb,
                  '[]'::jsonb
                )
              ) = 'array'
              THEN COALESCE(
                g.players::jsonb,
                '[]'::jsonb
              )
              ELSE '[]'::jsonb
            END
          ) AS participant(player)
        WHERE
          g.parse_source IN (
            'watcher_live',
            'watcher_final'
          )
          AND g.played_on IS NOT NULL
      ),

      valid_observations AS (
        SELECT *
        FROM raw_observations
        WHERE
          steam_id ~ '^[0-9]{17}$'
      ),

      latest_name AS (
        SELECT DISTINCT ON (steam_id)
          steam_id,
          display_name,
          played_on,
          game_stats_id
        FROM valid_observations
        WHERE display_name IS NOT NULL
        ORDER BY
          steam_id,
          played_on DESC,
          game_stats_id DESC
      ),

      latest_rm AS (
        SELECT DISTINCT ON (steam_id)
          steam_id,
          steam_rm_rating,
          played_on,
          game_stats_id
        FROM valid_observations
        WHERE steam_rm_rating IS NOT NULL
        ORDER BY
          steam_id,
          played_on DESC,
          game_stats_id DESC
      ),

      latest_dm AS (
        SELECT DISTINCT ON (steam_id)
          steam_id,
          steam_dm_rating,
          played_on,
          game_stats_id
        FROM valid_observations
        WHERE steam_dm_rating IS NOT NULL
        ORDER BY
          steam_id,
          played_on DESC,
          game_stats_id DESC
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

        latest_name.played_on
          AS "nameObservedAt",

        latest_rm.steam_rm_rating
          AS "steamRmRating",

        latest_rm.played_on
          AS "steamRmObservedAt",

        latest_dm.steam_dm_rating
          AS "steamDmRating",

        latest_dm.played_on
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

export async function loadCurrentWatcherAccountStates(
  prisma: PrismaClient,
): Promise<CurrentWatcherAccountState[]> {
  const now = Date.now();

  if (
    currentWatcherAccountStateCache &&
    currentWatcherAccountStateCache
      .expiresAt > now
  ) {
    return currentWatcherAccountStateCache
      .value;
  }

  if (currentWatcherAccountStatePromise) {
    return currentWatcherAccountStatePromise;
  }

  const run =
    loadCurrentWatcherAccountStatesFresh(
      prisma,
    );

  currentWatcherAccountStatePromise =
    run;

  try {
    const value = await run;

    currentWatcherAccountStateCache = {
      expiresAt:
        Date.now() +
        CURRENT_WATCHER_ACCOUNT_STATE_TTL_MS,
      value,
    };

    return value;
  } finally {
    if (
      currentWatcherAccountStatePromise ===
      run
    ) {
      currentWatcherAccountStatePromise =
        null;
    }
  }
}

export function invalidateCurrentWatcherAccountStateCache() {
  currentWatcherAccountStateCache = null;
  currentWatcherAccountStatePromise = null;
}
