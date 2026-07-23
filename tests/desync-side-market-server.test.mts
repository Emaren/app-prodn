import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";


const source =
  readFileSync(
    new URL(
      "../lib/bets.ts",
      import.meta.url
    ),
    "utf8"
  );


test(
  "winner market seeds explicitly retain winner proposition type",
  () => {
    assert.match(
      source,
      /marketType:\s*WINNER_MARKET_TYPE/
    );
  }
);


test(
  "live battles derive an independent desync sibling seed",
  () => {
    assert.match(
      source,
      /function buildDesyncSideMarketSeed/
    );

    assert.match(
      source,
      /parent\.status !== "live"/
    );

    assert.match(
      source,
      /buildDesyncSideMarketSlug/
    );

    assert.match(
      source,
      /marketType:\s*DESYNC_SIDE_MARKET_TYPE/
    );
  }
);


test(
  "desync sibling is NO versus YES and not a team roster",
  () => {
    assert.match(
      source,
      /leftLabel:\s*DESYNC_SIDE_MARKET_LEFT_LABEL/
    );

    assert.match(
      source,
      /rightLabel:\s*DESYNC_SIDE_MARKET_RIGHT_LABEL/
    );

    assert.match(
      source,
      /teamResolutionStatus:\s*null/
    );

    assert.match(
      source,
      /leftRosterSnapshot:\s*\[\]/
    );

    assert.match(
      source,
      /rightRosterSnapshot:\s*\[\]/
    );
  }
);


test(
  "desync sibling preserves battle identity without stealing scheduled match ownership",
  () => {
    assert.match(
      source,
      /scheduledMatchId:\s*null/
    );

    assert.match(
      source,
      /!parent\.propositionHash/
    );

    assert.match(
      source,
      /!normalizeName\(parent\.linkedSessionKey\)/
    );
  }
);


test(
  "desync sibling seeds are appended once through the normal market upsert pipeline",
  () => {
    assert.match(
      source,
      /const desyncSeeds\s*=/
    );

    assert.match(
      source,
      /\.map\(\s*buildDesyncSideMarketSeed\s*\)/
    );

    assert.match(
      source,
      /seenSlugs\.has\(seed\.slug\)/
    );

    assert.match(
      source,
      /seeds\.push\(seed\)/
    );
  }
);


test(
  "winner replay reconciliation excludes desync side markets",
  () => {
    assert.match(
      source,
      /marketType:\s*WINNER_MARKET_TYPE,\s*status:\s*\{\s*in:\s*RECONCILABLE_WATCHER_STATUSES/
    );
  }
);


test(
  "generic stale cleanup is restricted to winner markets",
  () => {
    const staleWinnerGuards =
      source.match(
        /marketType:\s*WINNER_MARKET_TYPE,\s*status:\s*\{\s*in:\s*OPEN_STATUSES/g
      ) ?? [];

    assert.ok(
      staleWinnerGuards.length >= 2,
      `expected at least 2 winner-only stale cleanup guards, found ${staleWinnerGuards.length}`
    );
  }
);
