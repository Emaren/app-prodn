import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source =
  fs.readFileSync(
    new URL(
      "../app/api/statistics/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

const pageSource =
  fs.readFileSync(
    new URL(
      "../app/statistics/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

test(
  "Statistics exposes completed UTC days only",
  () => {
    assert.match(
      source,
      /AT TIME ZONE\s+'UTC'[\s\S]*?\)::date - 1/,
    );

    assert.doesNotMatch(
      source,
      /DATE '2026-05-22',\s*CURRENT_DATE/,
    );
  },
);

test(
  "Statistics does not query the separate video-stream table",
  () => {
    assert.doesNotMatch(
      source,
      /FROM\s+game_watch_streams\b/i,
    );
  },
);

test(
  "Games Streamed is built from watcher_live parser sessions",
  () => {
    const block =
      source.match(
        /watcher_live_rows AS \([\s\S]*?\n\),\n\nwatcher_live_ranked/,
      )?.[0] ?? "";

    assert.match(
      block,
      /FROM game_stats/,
    );

    assert.match(
      block,
      /parse_source =\s+'watcher_live'/,
    );

    assert.match(
      block,
      /parse_iteration > 0/,
    );

    assert.match(
      block,
      /platform_match_id/,
    );

    assert.match(
      block,
      /original_filename/,
    );

    assert.match(
      block,
      /replay_file/,
    );
  },
);

test(
  "watcher_live iterations collapse to one stable game session",
  () => {
    const block =
      source.match(
        /watcher_live_ranked AS \([\s\S]*?\n\),\n\nmanaged_streams_daily/,
      )?.[0] ?? "";

    assert.match(
      block,
      /PARTITION BY\s+session_key/,
    );

    assert.match(
      block,
      /MIN\(\s*created_at\s*\)/,
    );

    assert.match(
      block,
      /ROW_NUMBER\(\)/,
    );

    assert.match(
      block,
      /parse_iteration DESC/,
    );
  },
);

test(
  "Games Streamed and Players Streamed come from the same canonical live sessions",
  () => {
    const block =
      source.match(
        /managed_streams_daily AS \([\s\S]*?\n\),\n\n\n\/\*\n \* Watcher Games/,
      )?.[0] ?? "";

    assert.match(
      block,
      /FROM watcher_live_ranked/,
    );

    assert.match(
      block,
      /best_row = 1/,
    );

    assert.match(
      block,
      /COUNT\(\*\) AS games_streamed/,
    );

    assert.match(
      block,
      /jsonb_array_length/,
    );

    assert.match(
      source,
      /s\.streamed_player_seats/,
    );

    assert.doesNotMatch(
      source,
      /wg\.streamed_player_seats/,
    );
  },
);

test(
  "Watcher Games counts distinct watcher_final replays and keeps batch uploads",
  () => {
    const block =
      source.match(
        /watcher_games_daily AS \([\s\S]*?\n\),\n\nwatcher_first_seen/,
      )?.[0] ?? "";

    assert.match(
      block,
      /FROM game_stats/,
    );

    assert.match(
      block,
      /parse_source =\s+'watcher_final'/,
    );

    assert.match(
      block,
      /COUNT\(\s*DISTINCT/,
    );

    assert.match(
      block,
      /replay_hash/,
    );

    assert.doesNotMatch(
      block,
      /batchUploadActive/,
    );

    assert.doesNotMatch(
      block,
      /importRunning/,
    );

    assert.doesNotMatch(
      block,
      /activeReplay/,
    );

    assert.doesNotMatch(
      block,
      /watcher_client_events/,
    );
  },
);

test(
  "both return metrics require a later page view",
  () => {
    const daily =
      source.match(
        /returning_daily AS \([\s\S]*?\n\),\n\nfirst_return_by_user/,
      )?.[0] ?? "";

    const cumulative =
      source.match(
        /first_return_by_user AS \([\s\S]*?\n\),\n\nreturned_cumulative/,
      )?.[0] ?? "";

    assert.match(
      daily,
      /e\.type =\s+'page_view'/,
    );

    assert.match(
      cumulative,
      /e\.type =\s+'page_view'/,
    );
  },
);

test(
  "Statistics reports ready only after real chart data is rendered",
  () => {
    assert.match(
      pageSource,
      /points\.length === 0/,
    );

    assert.match(
      pageSource,
      /requestAnimationFrame/,
    );

    assert.match(
      pageSource,
      /publishExplicitSpeedReady\("\/statistics"\)/,
    );
  },
);
