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

const claimedProfileUsers =
  Array.from(
    { length: 60 },
    (_, index) => {
      const number = index + 1;

      return {
        id: 100 + number,
        uid: `u_claimed_${number
          .toString()
          .padStart(3, "0")}`,
        inGameName:
          number === 1
            ? "Grimer"
            : `Profile ${number
                .toString()
                .padStart(3, "0")}`,
        steamPersonaName: null,
        steamId: null,
        verified: true,
        verificationLevel: 1,
        lastSeen: null,
      };
    },
  );

const users = [
  {
    id: 1,
    uid: "u_alpha",
    inGameName: "New Alpha",
    steamPersonaName: "New Alpha",
    steamId: STEAM_ALPHA,
    verified: true,
    verificationLevel: 2,
    lastSeen: null,
  },
  ...claimedProfileUsers,
  {
    id: 1001,
    uid: "aoe2hd_ai_concierge",
    inGameName: null,
    steamPersonaName: "The AI Scribe",
    steamId: null,
    verified: true,
    verificationLevel: 1,
    lastSeen: null,
  },
  {
    id: 1002,
    uid: "aoe2hd_ai_grimer",
    inGameName: null,
    steamPersonaName: "Grimer",
    steamId: null,
    verified: true,
    verificationLevel: 1,
    lastSeen: null,
  },
  {
    id: 1003,
    uid: "challenge-protocol",
    inGameName: null,
    steamPersonaName:
      "Challenge Protocol",
    steamId: null,
    verified: true,
    verificationLevel: 1,
    lastSeen: null,
  },
  {
    id: 1004,
    uid: "aoe2hd_ai_guy",
    inGameName: null,
    steamPersonaName:
      "Guy of Moxica",
    steamId: null,
    verified: true,
    verificationLevel: 1,
    lastSeen: null,
  },
];

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
  /*
   * This historical-directory fixture intentionally supplies no independent
   * current Watcher account-state observations.
   */
  $queryRaw: async () => [],

  user: {
    findMany: async () => users,
  },
  gameStats: {
    findMany: async () => games,
  },
  managedMediaAsset: {
    findMany: async () => [
      {
        target:
          "user-u_claimed_060-featured",
      },
      {
        target:
          "user-aoe2hd_ai_grimer-featured",
      },
    ],
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
    69,
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
  assert.equal(alpha.claimed, true);
  assert.equal(alpha.uid, "u_alpha");
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

test("default pages stay strict and sequential even when off-page profiles are featured", async () => {
  const firstPage =
    await loadLobbyLeaderboard(
      prisma as never,
      {
        lane: "dm",
        scope: "all",
        offset: 0,
        limit: 50,
        includePendingClaimed: false,
        includeFeaturedClaimed: false,
      },
    );
  const secondPage =
    await loadLobbyLeaderboard(
      prisma as never,
      {
        lane: "dm",
        scope: "all",
        offset: 50,
        limit: 50,
        includePendingClaimed: false,
        includeFeaturedClaimed: false,
      },
    );

  assert.equal(firstPage.entries.length, 50);
  assert.deepEqual(
    firstPage.entries.map(
      (entry) => entry.rank,
    ),
    Array.from(
      { length: 50 },
      (_, index) => index + 1,
    ),
  );
  assert.deepEqual(
    secondPage.entries.map(
      (entry) => entry.rank,
    ),
    Array.from(
      { length: 15 },
      (_, index) => index + 51,
    ),
  );
  assert.equal(firstPage.trackedPlayers, 65);
  assert.equal(
    new Set(
      [
        ...firstPage.entries,
        ...secondPage.entries,
      ].map((entry) => entry.key),
    ).size,
    65,
  );
});

test("claimed scope is contiguous and excludes reserved systems by UID, not name", async () => {
  const leaderboard =
    await loadLobbyLeaderboard(
      prisma as never,
      {
        lane: "dm",
        scope: "claimed",
        offset: 0,
        limit: 100,
        includePendingClaimed: false,
        includeFeaturedClaimed: false,
      },
    );
  const uids = new Set(
    leaderboard.entries.map(
      (entry) => entry.uid,
    ),
  );

  assert.equal(leaderboard.scope, "claimed");
  assert.equal(leaderboard.trackedPlayers, 61);
  assert.equal(leaderboard.claimedIdentityRows, 61);
  assert.equal(leaderboard.identityRows, 65);
  assert.equal(
    leaderboard.entries.every(
      (entry) => entry.claimed,
    ),
    true,
  );
  assert.deepEqual(
    leaderboard.entries.map(
      (entry) => entry.rank,
    ),
    Array.from(
      { length: 61 },
      (_, index) => index + 1,
    ),
  );

  for (const uid of [
    "aoe2hd_ai_concierge",
    "aoe2hd_ai_grimer",
    "aoe2hd_ai_guy",
    "challenge-protocol",
  ]) {
    assert.equal(uids.has(uid), false);
  }

  assert.equal(
    leaderboard.entries.some(
      (entry) =>
        entry.uid ===
          "u_claimed_001" &&
        entry.name === "Grimer",
    ),
    true,
  );
});
