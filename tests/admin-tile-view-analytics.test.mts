import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminTileViewBreakdown } from "../lib/adminTileViewAnalytics.ts";

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
  assert.equal(liveGames?.advancedCount, 2);
  assert.equal(liveGames?.extremeCount, 1);
  assert.equal(liveGames?.explicitCount, 1);
});
