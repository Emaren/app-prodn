import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminLeaderboardLaneBreakdown,
  buildAdminTileViewBreakdown,
} from "../lib/adminTileViewAnalytics.ts";
import { normalizeLeaderboardLane } from "../lib/leaderboardLane.ts";
import {
  applyTileViewDefaultMigration,
  LIVE_GAMES_VIEW_STORAGE_KEY,
  readStoredLiveGamesViewMode,
  TILE_VIEW_DEFAULT_VERSION_KEY,
  writeStoredLiveGamesViewMode,
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
  const storage = new Map<string, string>([
    [
      "aoe2hdbets:tile-view-preferences",
      JSON.stringify({ live_games: "extreme" }),
    ],
  ]);

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem(key: string) {
          return storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          storage.set(key, value);
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
    assert.equal(readStoredLiveGamesViewMode(), "basic");

    writeStoredLiveGamesViewMode("advanced");
    assert.equal(storage.get(LIVE_GAMES_VIEW_STORAGE_KEY), "advanced");
    assert.equal(readStoredLiveGamesViewMode(), "advanced");
    assert.equal(
      applyTileViewDefaultMigration({ live_games: "extreme" }).live_games,
      "advanced"
    );

    storage.set(TILE_VIEW_DEFAULT_VERSION_KEY, "explicit-live-games-view-20260704");
    storage.delete(LIVE_GAMES_VIEW_STORAGE_KEY);
    assert.equal(
      applyTileViewDefaultMigration({ live_games: "extreme" }).live_games,
      "basic"
    );
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});


test("rivalries BAE defaults to Extreme and tracks explicit choices", () => {
  const breakdown =
    buildAdminTileViewBreakdown([
      {
        appearance: {
          tileViewPreferences: {},
        },
      },
      {
        appearance: {
          tileViewPreferences: {
            rivalries: "basic",
          },
        },
      },
      {
        appearance: {
          tileViewPreferences: {
            rivalries: "advanced",
          },
        },
      },
    ]);

  const rivalries = breakdown.find(
    (entry) =>
      entry.tileKey === "rivalries"
  );

  assert.deepEqual(rivalries, {
    tileKey: "rivalries",
    label: "Rivalries",
    basicCount: 1,
    advancedCount: 1,
    extremeCount: 1,
    basicPercent: 33,
    advancedPercent: 33,
    extremePercent: 34,
    explicitCount: 2,
    defaultCount: 1,
    preferredMode: "extreme",
  });
});
