import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminLeaderboardLaneBreakdown,
  buildAdminTileViewBreakdown,
} from "../lib/adminTileViewAnalytics.ts";
import { normalizeLeaderboardLane } from "../lib/leaderboardLane.ts";
import {
  applyTileViewDefaultMigration,
  TILE_VIEW_DEFAULT_VERSION_KEY,
} from "../lib/tileViewPreferences.ts";

test("tile-view analytics separate explicit choices from effective defaults", () => {
  const breakdown = buildAdminTileViewBreakdown([
    { appearance: { tileViewPreferences: {} } },
    {
      appearance: {
        tileViewPreferences: {
          community_lobby: "basic",
          live_games: "extreme",
          forum: "basic",
        },
      },
    },
    { appearance: { tileViewPreferences: { forum: "extreme" } } },
  ]);

  const forum = breakdown.find((entry) => entry.tileKey === "forum");
  assert.deepEqual(forum, {
    tileKey: "forum",
    label: "Forum",
    basicCount: 1,
    advancedCount: 0,
    extremeCount: 2,
    basicPercent: 33,
    advancedPercent: 0,
    extremePercent: 67,
    explicitCount: 2,
    defaultCount: 1,
    preferredMode: "extreme",
  });

  const liveGames = breakdown.find((entry) => entry.tileKey === "live_games");
  assert.equal(liveGames?.basicCount, 2);
  assert.equal(liveGames?.advancedCount, 0);
  assert.equal(liveGames?.extremeCount, 1);
  assert.equal(liveGames?.explicitCount, 1);
});

test("leaderboard-lane analytics default invalid or missing values to RM", () => {
  const breakdown = buildAdminLeaderboardLaneBreakdown([
    { appearance: { tileViewPreferences: {}, leaderboardLane: "dm" } },
    { appearance: { tileViewPreferences: {}, leaderboardLane: "rm" } },
    { appearance: { tileViewPreferences: {}, leaderboardLane: "unknown" } },
    { appearance: null },
  ]);

  assert.deepEqual(breakdown, {
    rmCount: 3,
    dmCount: 1,
    rmPercent: 75,
    dmPercent: 25,
    preferredLane: "rm",
  });
  assert.equal(normalizeLeaderboardLane("dm"), "dm");
  assert.equal(normalizeLeaderboardLane(null), "rm");
});

test("the current tile migration restores Basic as the live-games default", () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return key === TILE_VIEW_DEFAULT_VERSION_KEY ? "previous-defaults" : null;
        },
      },
    },
  });

  try {
    assert.deepEqual(
      applyTileViewDefaultMigration({
        live_games: "advanced",
        community_lobby: "extreme",
      }),
      {
        live_games: "basic",
        community_lobby: "extreme",
        forum: "extreme",
      }
    );
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});
