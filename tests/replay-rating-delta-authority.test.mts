import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateReplayRatingDeltaAuthority,
  REPLAY_RATING_DELTA_MAX_ABS,
} from "../lib/replayRatingDeltaAuthority.ts";

function player(
  name: string,
  steamId: string,
  rm: number | null,
  dm: number | null,
) {
  return {
    name,
    steam_id: steamId,
    user_id: steamId,
    number: name === "Jim" ? 1 : 2,
    team_id: name === "Jim" ? 0 : null,
    steam_rm_rating: rm,
    steam_dm_rating: dm,
  };
}

test("exact RM zero-sum rating movement proves the winner", () => {
  const result =
    evaluateReplayRatingDeltaAuthority({
      lane: "rm",
      sourcePlayers: [
        player(
          "Jim",
          "76561198166409520",
          960,
          1676,
        ),
        player(
          "Emaren",
          "76561198065420384",
          1071,
          1549,
        ),
      ],
      laterPlayers: [
        player(
          "Jim",
          "76561198166409520",
          980,
          1676,
        ),
        player(
          "Emaren",
          "76561198065420384",
          1051,
          1549,
        ),
      ],
    });

  assert.equal(
    result.eligible,
    true,
  );
  if (!result.eligible) return;

  assert.equal(
    result.winner.player.name,
    "Jim",
  );
  assert.equal(
    result.loser.player.name,
    "Emaren",
  );
  assert.equal(
    result.delta,
    20,
  );
  assert.equal(
    result.winningTeamKey,
    "steam:76561198166409520",
  );
  assert.deepEqual(
    result.evidence.sourceRatings,
    {
      "76561198166409520": 960,
      "76561198065420384": 1071,
    },
  );
  assert.deepEqual(
    result.evidence.laterRatings,
    {
      "76561198166409520": 980,
      "76561198065420384": 1051,
    },
  );
});

test("DM proof ignores ambiguous generic rate_snapshot and uses explicit DM fields", () => {
  const source = [
    {
      ...player(
        "Alpha",
        "76561198000000001",
        1400,
        1600,
      ),
      rate_snapshot: 900,
    },
    {
      ...player(
        "Bravo",
        "76561198000000002",
        1400,
        1700,
      ),
      rate_snapshot: 2100,
    },
  ];
  const later = [
    {
      ...player(
        "Alpha",
        "76561198000000001",
        1400,
        1615,
      ),
      rate_snapshot: 100,
    },
    {
      ...player(
        "Bravo",
        "76561198000000002",
        1400,
        1685,
      ),
      rate_snapshot: 3000,
    },
  ];

  const result =
    evaluateReplayRatingDeltaAuthority({
      lane: "dm",
      sourcePlayers: source,
      laterPlayers: later,
    });

  assert.equal(
    result.eligible,
    true,
  );
  if (!result.eligible) return;
  assert.equal(
    result.winner.player.name,
    "Alpha",
  );
  assert.equal(
    result.delta,
    15,
  );
});

test("same roster with unchanged ratings stays unknown", () => {
  const players = [
    player(
      "Alpha",
      "76561198000000001",
      1200,
      1600,
    ),
    player(
      "Bravo",
      "76561198000000002",
      1300,
      1700,
    ),
  ];

  assert.deepEqual(
    evaluateReplayRatingDeltaAuthority({
      lane: "rm",
      sourcePlayers: players,
      laterPlayers: players,
    }),
    {
      eligible: false,
      reason: "rating_unchanged",
    },
  );
});

test("non-zero movement must be exactly zero-sum", () => {
  const result =
    evaluateReplayRatingDeltaAuthority({
      lane: "rm",
      sourcePlayers: [
        player(
          "Alpha",
          "76561198000000001",
          1200,
          1600,
        ),
        player(
          "Bravo",
          "76561198000000002",
          1300,
          1700,
        ),
      ],
      laterPlayers: [
        player(
          "Alpha",
          "76561198000000001",
          1210,
          1600,
        ),
        player(
          "Bravo",
          "76561198000000002",
          1295,
          1700,
        ),
      ],
    });

  assert.deepEqual(
    result,
    {
      eligible: false,
      reason:
        "rating_delta_not_zero_sum",
    },
  );
});

test("the exact Steam roster cannot change between snapshots", () => {
  const result =
    evaluateReplayRatingDeltaAuthority({
      lane: "rm",
      sourcePlayers: [
        player(
          "Alpha",
          "76561198000000001",
          1200,
          1600,
        ),
        player(
          "Bravo",
          "76561198000000002",
          1300,
          1700,
        ),
      ],
      laterPlayers: [
        player(
          "Alpha",
          "76561198000000001",
          1210,
          1600,
        ),
        player(
          "Charlie",
          "76561198000000003",
          1290,
          1700,
        ),
      ],
    });

  assert.deepEqual(
    result,
    {
      eligible: false,
      reason: "roster_mismatch",
    },
  );
});

test("implausibly large rating movement is not automatic authority", () => {
  const result =
    evaluateReplayRatingDeltaAuthority({
      lane: "rm",
      sourcePlayers: [
        player(
          "Alpha",
          "76561198000000001",
          1000,
          1600,
        ),
        player(
          "Bravo",
          "76561198000000002",
          1500,
          1700,
        ),
      ],
      laterPlayers: [
        player(
          "Alpha",
          "76561198000000001",
          1000 +
            REPLAY_RATING_DELTA_MAX_ABS +
            1,
          1600,
        ),
        player(
          "Bravo",
          "76561198000000002",
          1500 -
            REPLAY_RATING_DELTA_MAX_ABS -
            1,
          1700,
        ),
      ],
    });

  assert.deepEqual(
    result,
    {
      eligible: false,
      reason:
        "rating_delta_out_of_bounds",
    },
  );
});

test("generic rate_snapshot alone never establishes lane authority", () => {
  const source = [
    {
      name: "Alpha",
      steam_id: "76561198000000001",
      number: 1,
      rate_snapshot: 1000,
    },
    {
      name: "Bravo",
      steam_id: "76561198000000002",
      number: 2,
      rate_snapshot: 1100,
    },
  ];
  const later = [
    {
      ...source[0],
      rate_snapshot: 1020,
    },
    {
      ...source[1],
      rate_snapshot: 1080,
    },
  ];

  assert.deepEqual(
    evaluateReplayRatingDeltaAuthority({
      lane: "rm",
      sourcePlayers: source,
      laterPlayers: later,
    }),
    {
      eligible: false,
      reason:
        "exact_rated_steam_1v1_required",
    },
  );
});
