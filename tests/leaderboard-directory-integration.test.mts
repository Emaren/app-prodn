import assert from "node:assert/strict";
import test from "node:test";

import {
  loadLobbyLeaderboard,
} from "../lib/lobbyLeaderboard.ts";
import {
  loadPublicPlayerDirectory,
} from "../lib/publicPlayerDirectory.ts";

const STEAM_ALPHA =
  "76561198000000001";
const STEAM_SHARED_ONE =
  "76561198000000002";
const STEAM_SHARED_TWO =
  "76561198000000003";
const STEAM_RECENT_ONE =
  "76561198000000004";
const STEAM_RECENT_TWO =
  "76561198000000005";

const now = Date.now();

function player(
  name: string,
  steamId: string,
  winner: boolean,
  rating: number,
  number: number,
) {
  return {
    name,
    steam_id: steamId,
    steam_rm_rating: rating,
    winner,
    number,
  };
}

function game(
  id: number,
  playedAt: string,
  winner: string,
  players: Array<
    ReturnType<typeof player>
  >,
) {
  return {
    id,
    is_final: true,
    createdAt: new Date(playedAt),
    event_types: ["resign"],
    key_events: {
      completed: true,
      postgame_available: true,
      has_scores: true,
    },
    original_filename:
      `integration-${id}.aoe2record`,
    played_on: new Date(playedAt),
    players,
    replay_file: null,
    replayHash: id
      .toString(16)
      .padStart(64, "0"),
    timestamp: new Date(playedAt),
    winner,
    parse_reason:
      "recorded_postgame_final",
    parse_source: "upload",
    replayResultAdjudications: [],
  };
}

const games = [
  game(
    1,
    "2026-07-20T12:00:00.000Z",
    "Old Alpha",
    [
      player(
        "Old Alpha",
        STEAM_ALPHA,
        true,
        1500,
        1,
      ),
      player(
        "Shared",
        STEAM_SHARED_ONE,
        false,
        1450,
        2,
      ),
    ],
  ),
  game(
    2,
    "2026-07-21T12:00:00.000Z",
    "Shared",
    [
      player(
        "New Alpha",
        STEAM_ALPHA,
        false,
        1510,
        1,
      ),
      player(
        "Shared",
        STEAM_SHARED_TWO,
        true,
        1520,
        2,
      ),
    ],
  ),
  game(
    3,
    "2026-06-01T12:00:00.000Z",
    "Recent One",
    [
      player(
        "Recent One",
        STEAM_RECENT_ONE,
        true,
        1600,
        1,
      ),
      player(
        "Recent Two",
        STEAM_RECENT_TWO,
        false,
        1550,
        2,
      ),
    ],
  ),
];

const acceptedOld =
  new Date(now - 48 * 60 * 60 * 1000);
const acceptedRecently =
  new Date(now - 60 * 60 * 1000);

const snapshots = [
  {
    id: 1,
    gameStatsId: 1,
    displayName: "Old Alpha",
    normalizedName: "old alpha",
    steamId: STEAM_ALPHA,
    playerSlot: 1,
    resultEligible: true,
    resultStatus: "win",
    createdAt: acceptedOld,
  },
  {
    id: 2,
    gameStatsId: 1,
    displayName: "Shared",
    normalizedName: "shared",
    steamId: STEAM_SHARED_ONE,
    playerSlot: 2,
    resultEligible: true,
    resultStatus: "loss",
    createdAt: acceptedOld,
  },
  {
    id: 3,
    gameStatsId: 2,
    displayName: "New Alpha",
    normalizedName: "new alpha",
    steamId: STEAM_ALPHA,
    playerSlot: 1,
    resultEligible: true,
    resultStatus: "loss",
    createdAt: acceptedOld,
  },
  {
    id: 4,
    gameStatsId: 2,
    displayName: "Shared",
    normalizedName: "shared",
    steamId: STEAM_SHARED_TWO,
    playerSlot: 2,
    resultEligible: true,
    resultStatus: "win",
    createdAt: acceptedOld,
  },
  {
    id: 5,
    gameStatsId: 3,
    displayName: "Recent One",
    normalizedName: "recent one",
    steamId: STEAM_RECENT_ONE,
    playerSlot: 1,
    resultEligible: true,
    resultStatus: "win",
    createdAt: acceptedRecently,
  },
  {
    id: 6,
    gameStatsId: 3,
    displayName: "Recent Two",
    normalizedName: "recent two",
    steamId: STEAM_RECENT_TWO,
    playerSlot: 2,
    resultEligible: true,
    resultStatus: "loss",
    createdAt: acceptedRecently,
  },
];

const prisma = {
  user: {
    findMany: async () => [],
  },
  gameStats: {
    findMany: async () => games,
  },
  managedMediaAsset: {
    findMany: async () => [],
  },
  replayPlayerSnapshot: {
    findMany: async () => snapshots,
  },
  pendingWoloClaim: {
    findMany: async () => [],
  },
  userBadge: {
    findMany: async () => [],
  },
  userGift: {
    findMany: async () => [],
    groupBy: async () => [],
  },
};

test("directory folds aliases only within one exact Steam account", async () => {
  const directory =
    await loadPublicPlayerDirectory(
      prisma as never,
    );

  assert.equal(
    directory.allEntries.length,
    5,
  );

  const alpha =
    directory.allEntries.find(
      (entry) =>
        entry.steamId ===
        STEAM_ALPHA,
    );
  assert.ok(alpha);
  assert.equal(
    alpha.key,
    `steam:${STEAM_ALPHA}`,
  );
  assert.equal(
    alpha.name,
    "New Alpha",
  );
  assert.equal(alpha.totalMatches, 2);
  assert.equal(alpha.wins, 1);
  assert.equal(alpha.losses, 1);
  assert.deepEqual(
    alpha.nameHistory.map(
      (history) => history.name
    ),
    ["New Alpha", "Old Alpha"],
  );

  const shared =
    directory.allEntries.filter(
      (entry) =>
        entry.name === "Shared",
    );
  assert.equal(shared.length, 2);
  assert.deepEqual(
    new Set(
      shared.map(
        (entry) => entry.steamId
      )
    ),
    new Set([
      STEAM_SHARED_ONE,
      STEAM_SHARED_TWO,
    ]),
  );
});

test("24-hour baseline uses evidence acceptance time, not old match time", async () => {
  const leaderboard =
    await loadLobbyLeaderboard(
      prisma as never,
      {
        lane: "rm",
        offset: 0,
        limit: 20,
        includePendingClaimed: false,
      },
    );

  for (const steamId of [
    STEAM_RECENT_ONE,
    STEAM_RECENT_TWO,
  ]) {
    const entry =
      leaderboard.entries.find(
        (candidate) =>
          candidate.steamId ===
          steamId,
      );

    assert.ok(entry);
    assert.equal(
      entry.rankDelta24hState,
      "new",
    );
    assert.equal(
      entry.rank24hAgo,
      null,
    );
  }

  assert.equal(
    leaderboard.rankDelta24hMethod,
    "reconstructed_current_corpus",
  );
});
