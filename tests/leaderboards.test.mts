import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateResolvedWinRate,
  matchesLeaderboardSearch,
} from "../lib/leaderboardPage.ts";
import {
  CHALLENGE_PROTOCOL_UID,
  isLeaderboardExcludedSystemUid,
} from "../lib/internalSystemAccounts.ts";
import {
  normalizeLeaderboardScope,
} from "../lib/leaderboardScope.ts";
import { getReplayAchievementGroups } from "../lib/replayAchievementMetrics.ts";

test("leaderboard win rate ignores unresolved games", () => {
  assert.equal(calculateResolvedWinRate(7, 3), 70);
  assert.equal(calculateResolvedWinRate(0, 0), null);
  // Unknown results are intentionally absent from this API.
  assert.equal(calculateResolvedWinRate(2, 2), 50);
});

test("leaderboard search checks every canonical player alias", () => {
  const aliases = ["TheViper", "AM | Viper", "ViperAoE"];
  assert.equal(matchesLeaderboardSearch(aliases, "am | vi"), true);
  assert.equal(matchesLeaderboardSearch(aliases, "viperAOE"), true);
  assert.equal(matchesLeaderboardSearch(aliases, "hera"), false);
});

test("leaderboard scope defaults safely and accepts claimed profiles", () => {
  assert.equal(
    normalizeLeaderboardScope(
      "claimed",
    ),
    "claimed",
  );
  assert.equal(
    normalizeLeaderboardScope("all"),
    "all",
  );
  assert.equal(
    normalizeLeaderboardScope(
      "internal",
    ),
    "all",
  );
});

test("competitive boards exclude exact internal UIDs, never display names", () => {
  for (const uid of [
    "aoe2hd_ai_concierge",
    "aoe2hd_ai_grimer",
    "aoe2hd_ai_guy",
    CHALLENGE_PROTOCOL_UID,
  ]) {
    assert.equal(
      isLeaderboardExcludedSystemUid(
        uid,
      ),
      true,
    );
  }

  assert.equal(
    isLeaderboardExcludedSystemUid(
      "u_human_named_grimer",
    ),
    false,
  );
  assert.equal(
    isLeaderboardExcludedSystemUid(
      null,
    ),
    false,
  );
});

test("achievement projection preserves real zeroes and drops missing values", () => {
  const groups = getReplayAchievementGroups({
    achievements: {
      military: {
        units_killed: 0,
        units_lost: null,
      },
      economy: {
        food_collected: 1234,
        wood_collected: undefined,
      },
      society: {},
    },
  });

  assert.deepEqual(groups, [
    {
      key: "military",
      label: "Military",
      metrics: [{ key: "units_killed", label: "units killed", value: 0 }],
    },
    {
      key: "economy",
      label: "Economy",
      metrics: [{ key: "food_collected", label: "food collected", value: 1234 }],
    },
  ]);
});
