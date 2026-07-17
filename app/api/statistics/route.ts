import { NextResponse } from "next/server";

import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

type StatisticsRow = {
  day: Date;
  wolo_transferred: unknown;
  new_users: bigint;
  total_users: bigint;
  returning_users: bigint;
  users_who_returned: bigint;
  bets_placed: bigint;
  bet_volume_wolo: unknown;
  games_streamed: bigint;
  watcher_games_ingested: bigint;
  streamed_player_seats: bigint;
  watcher_first_launches: bigint;
  active_watchers: bigint;
  marketplace_requests: bigint;
  proposed_shops: bigint;
  feature_requests: bigint;
  bounty_claims: bigint;
  forum_posts: bigint;
  radio_submissions: bigint;
};

function numeric(value: unknown) {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(String(value));

  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET() {
  try {
    const prisma = getPrisma();

    const rows = await prisma.$queryRaw<StatisticsRow[]>`
WITH days AS (
  SELECT generate_series(
    DATE '2026-05-22',
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS day
),

real_users AS (
  SELECT
    u.*
  FROM users u
  WHERE
    u.uid NOT LIKE
      'aoe2hd_ai_%'

    AND lower(
      coalesce(
        u.in_game_name,
        ''
      )
    ) NOT IN (
      'grimer',
      'the ai scribe',
      'moose'
    )

    AND lower(
      coalesce(
        u.steam_persona_name,
        ''
      )
    ) NOT IN (
      'grimer',
      'the ai scribe',
      'moose'
    )
),

users_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS new_users
  FROM real_users
  WHERE created_at >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
),

total_users_daily AS (
  SELECT
    d.day,
    COUNT(
      ru.id
    ) AS total_users
  FROM days d
  LEFT JOIN real_users ru
    ON ru.created_at::date <=
      d.day
  GROUP BY
    d.day
),

returning_daily AS (
  SELECT
    e.created_at::date AS day,
    COUNT(
      DISTINCT e.user_id
    ) AS returning_users
  FROM user_activity_events e
  JOIN real_users u
    ON u.id = e.user_id
  WHERE
    e.created_at >=
      TIMESTAMP '2026-05-22'
    AND e.type =
      'page_view'
    AND e.user_id
      IS NOT NULL
    AND u.created_at::date <
      e.created_at::date
  GROUP BY 1
),

first_return_by_user AS (
  SELECT
    u.id AS user_id,
    MIN(
      e.created_at::date
    ) AS first_return_day
  FROM real_users u
  JOIN user_activity_events e
    ON e.user_id = u.id
  WHERE
    e.created_at::date >
      u.created_at::date
  GROUP BY
    u.id
),

returned_cumulative AS (
  SELECT
    d.day,
    COUNT(
      fr.user_id
    ) AS users_who_returned
  FROM days d
  LEFT JOIN first_return_by_user fr
    ON fr.first_return_day <=
      d.day
  GROUP BY
    d.day
),

wolo_daily AS (
  SELECT
    timestamp::date AS day,
    COALESCE(
      SUM(
        amount_wolo_display
      ),
      0
    ) AS wolo_transferred
  FROM wolo_indexed_transfers
  WHERE timestamp >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
),

bets_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS bets_placed,
    COALESCE(
      SUM(amount_wolo),
      0
    ) AS bet_volume_wolo
  FROM bet_wagers
  WHERE created_at >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
),

managed_streams_daily AS (
  SELECT
    COALESCE(
      started_at,
      created_at
    )::date AS day,
    COUNT(
      DISTINCT session_key
    ) AS games_streamed
  FROM game_watch_streams
  WHERE
    COALESCE(
      started_at,
      created_at
    ) >=
      TIMESTAMP '2026-05-22'
    AND provider =
      'aoe2war'
    AND source_type IN (
      'watcher_native',
      'browser'
    )
    AND status <>
      'removed'
  GROUP BY 1
),

watcher_games_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS watcher_games_ingested,
    COALESCE(
      SUM(
        CASE
          WHEN jsonb_typeof(players) =
            'array'
          THEN jsonb_array_length(
            players
          )
          ELSE 0
        END
      ),
      0
    ) AS streamed_player_seats
  FROM game_stats
  WHERE
    created_at >=
      TIMESTAMP '2026-05-22'
    AND is_final =
      TRUE
    AND parse_source =
      'watcher_final'
  GROUP BY 1
),

watcher_first_seen AS (
  SELECT
    COALESCE(
      NULLIF(
        watcher_id,
        ''
      ),
      NULLIF(
        session_id,
        ''
      ),
      CASE
        WHEN user_id
          IS NOT NULL
        THEN
          'user:' ||
          user_id::text
      END,
      CASE
        WHEN user_uid
          IS NOT NULL
        THEN
          'uid:' ||
          user_uid
      END
    ) AS stable_key,
    MIN(
      created_at
    )::date AS first_day
  FROM watcher_client_events
  WHERE event_type =
    'app_open'
  GROUP BY 1
),

watcher_first_daily AS (
  SELECT
    first_day AS day,
    COUNT(*) AS watcher_first_launches
  FROM watcher_first_seen
  WHERE
    stable_key
      IS NOT NULL
    AND first_day >=
      DATE '2026-05-22'
  GROUP BY 1
),

watcher_active_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(
      DISTINCT COALESCE(
        NULLIF(
          watcher_id,
          ''
        ),
        NULLIF(
          session_id,
          ''
        ),
        CASE
          WHEN user_id
            IS NOT NULL
          THEN
            'user:' ||
            user_id::text
        END,
        CASE
          WHEN user_uid
            IS NOT NULL
          THEN
            'uid:' ||
            user_uid
        END
      )
    ) AS active_watchers
  FROM watcher_client_events
  WHERE
    created_at >=
      TIMESTAMP '2026-05-22'
    AND event_type IN (
      'heartbeat',
      'app_open',
      'watcher_started',
      'watcher_ready',
      'watching_started'
    )
  GROUP BY 1
),

marketplace_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS marketplace_requests
  FROM user_activity_events
  WHERE
    created_at >=
      TIMESTAMP '2026-05-22'
    AND type IN (
      'market_avatar_commission',
      'market_shop_proposal'
    )
  GROUP BY 1
),

proposed_shops_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS proposed_shops
  FROM user_activity_events
  WHERE
    created_at >=
      TIMESTAMP '2026-05-22'
    AND type =
      'market_shop_proposal'
  GROUP BY 1
),

feature_daily AS (
  SELECT
    submitted_at::date AS day,
    COUNT(*) AS feature_requests
  FROM feature_requests
  WHERE submitted_at >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
),

bounty_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS bounty_claims
  FROM bounty_claims
  WHERE created_at >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
),

forum_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS forum_posts
  FROM forum_posts
  WHERE created_at >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
),

radio_daily AS (
  SELECT
    created_at::date AS day,
    COUNT(*) AS radio_submissions
  FROM radio_submissions
  WHERE created_at >=
    TIMESTAMP '2026-05-22'
  GROUP BY 1
)

SELECT
  d.day,

  COALESCE(
    w.wolo_transferred,
    0
  ) AS wolo_transferred,

  COALESCE(
    u.new_users,
    0
  ) AS new_users,

  COALESCE(
    tu.total_users,
    0
  ) AS total_users,

  COALESCE(
    r.returning_users,
    0
  ) AS returning_users,

  COALESCE(
    rc.users_who_returned,
    0
  ) AS users_who_returned,

  COALESCE(
    b.bets_placed,
    0
  ) AS bets_placed,

  COALESCE(
    b.bet_volume_wolo,
    0
  ) AS bet_volume_wolo,

  COALESCE(
    s.games_streamed,
    0
  ) AS games_streamed,

  COALESCE(
    wg.watcher_games_ingested,
    0
  ) AS watcher_games_ingested,

  COALESCE(
    wg.streamed_player_seats,
    0
  ) AS streamed_player_seats,

  COALESCE(
    wf.watcher_first_launches,
    0
  ) AS watcher_first_launches,

  COALESCE(
    wa.active_watchers,
    0
  ) AS active_watchers,

  COALESCE(
    m.marketplace_requests,
    0
  ) AS marketplace_requests,

  COALESCE(
    ps.proposed_shops,
    0
  ) AS proposed_shops,

  COALESCE(
    f.feature_requests,
    0
  ) AS feature_requests,

  COALESCE(
    bc.bounty_claims,
    0
  ) AS bounty_claims,

  COALESCE(
    fp.forum_posts,
    0
  ) AS forum_posts,

  COALESCE(
    rs.radio_submissions,
    0
  ) AS radio_submissions

FROM days d

LEFT JOIN users_daily u
  USING (day)

LEFT JOIN total_users_daily tu
  USING (day)

LEFT JOIN returning_daily r
  USING (day)

LEFT JOIN returned_cumulative rc
  USING (day)

LEFT JOIN wolo_daily w
  USING (day)

LEFT JOIN bets_daily b
  USING (day)

LEFT JOIN managed_streams_daily s
  USING (day)

LEFT JOIN watcher_games_daily wg
  USING (day)

LEFT JOIN watcher_first_daily wf
  USING (day)

LEFT JOIN watcher_active_daily wa
  USING (day)

LEFT JOIN marketplace_daily m
  USING (day)

LEFT JOIN proposed_shops_daily ps
  USING (day)

LEFT JOIN feature_daily f
  USING (day)

LEFT JOIN bounty_daily bc
  USING (day)

LEFT JOIN forum_daily fp
  USING (day)

LEFT JOIN radio_daily rs
  USING (day)

ORDER BY d.day;
`;

    const points = rows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),

      values: {
        woloTransferred: numeric(row.wolo_transferred),

        newUsers: numeric(row.new_users),

        totalUsers: numeric(row.total_users),

        returningUsers: numeric(row.returning_users),

        usersWhoReturned: numeric(row.users_who_returned),

        betsPlaced: numeric(row.bets_placed),

        betVolumeWolo: numeric(row.bet_volume_wolo),

        gamesStreamed: numeric(row.games_streamed),

        watcherGamesIngested: numeric(row.watcher_games_ingested),

        streamedPlayerSeats: numeric(row.streamed_player_seats),

        watcherFirstLaunches: numeric(row.watcher_first_launches),

        activeWatchers: numeric(row.active_watchers),

        marketplaceRequests: numeric(row.marketplace_requests),

        proposedShops: numeric(row.proposed_shops),

        featureRequests: numeric(row.feature_requests),

        bountyClaims: numeric(row.bounty_claims),

        forumPosts: numeric(row.forum_posts),

        radioSubmissions: numeric(row.radio_submissions),
      },
    }));

    return NextResponse.json(
      {
        ok: true,
        startDate: "2026-05-22",
        points,
      },
      {
        headers: {
          "Cache-Control":
            "public, max-age=30, s-maxage=300, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Statistics Observatory failed:", error);

    return NextResponse.json(
      {
        detail: "Statistics Observatory is temporarily unavailable.",
      },
      {
        status: 500,
      },
    );
  }
}
