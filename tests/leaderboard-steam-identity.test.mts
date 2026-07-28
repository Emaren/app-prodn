import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLeaderboardIdentityKey,
  buildLeaderboardNameHistory,
  normalizeLeaderboardIdentityName,
  normalizeLeaderboardSteamId,
  resolveRankDelta24h,
} from "../lib/leaderboardIdentity.ts";

const directorySource = readFileSync(
  new URL(
    "../lib/publicPlayerDirectory.ts",
    import.meta.url,
  ),
  "utf8",
);

const leaderboardSource = readFileSync(
  new URL(
    "../lib/lobbyLeaderboard.ts",
    import.meta.url,
  ),
  "utf8",
);

test("exact SteamID64 is the cross-name leaderboard identity key", () => {
  const steamId =
    "76561198000000001";

  assert.equal(
    buildLeaderboardIdentityKey({
      steamId,
      name: "Old Name",
    }),
    `steam:${steamId}`,
  );
  assert.equal(
    buildLeaderboardIdentityKey({
      steamId,
      name: "New Name",
    }),
    `steam:${steamId}`,
  );
  assert.notEqual(
    buildLeaderboardIdentityKey({
      steamId,
      name: "Knight",
    }),
    buildLeaderboardIdentityKey({
      steamId:
        "76561198000000002",
      name: "Knight",
    }),
  );
});

test("invalid Steam values fail closed and never become merge keys", () => {
  for (const value of [
    "123",
    "steam:76561198000000001",
    "7656119800000000",
    76561198000000000,
    null,
  ]) {
    assert.equal(
      normalizeLeaderboardSteamId(
        value,
      ),
      null,
    );
  }
});

test("accepted snapshot normalizedName drives name-only identity keys", () => {
  assert.equal(
    buildLeaderboardIdentityKey({
      name: "Display Name",
      normalizedName:
        "canonical replay name",
    }),
    "replay:canonical replay name",
  );

  assert.equal(
    normalizeLeaderboardIdentityName(
      "Ａｌｉｃｅ",
    ),
    normalizeLeaderboardIdentityName(
      "Alice",
    ),
  );
});

test("name history folds normalized aliases and preserves per-alias results", () => {
  const history =
    buildLeaderboardNameHistory([
      {
        name: "Old Name",
        observedAt:
          "2026-01-01T00:00:00.000Z",
        result: "win",
      },
      {
        name: "  ＯＬＤ   ＮＡＭＥ ",
        normalizedName: "old name",
        observedAt:
          "2026-01-02T00:00:00.000Z",
        result: "unknown",
      },
      {
        name: "New Name",
        observedAt:
          "2026-01-03T00:00:00.000Z",
        result: "loss",
      },
    ]);

  assert.deepEqual(
    history.map((entry) => ({
      name: entry.name,
      games: entry.games,
      wins: entry.wins,
      losses: entry.losses,
      unknowns: entry.unknowns,
    })),
    [
      {
        name: "New Name",
        games: 1,
        wins: 0,
        losses: 1,
        unknowns: 0,
      },
      {
        name: "OLD NAME",
        games: 2,
        wins: 1,
        losses: 0,
        unknowns: 1,
      },
    ],
  );
});

test("24-hour rank delta uses positive numbers for upward movement", () => {
  assert.deepEqual(
    resolveRankDelta24h({
      currentRank: 3,
      previousRank: 8,
      currentlyRanked: true,
      previouslyRanked: true,
    }),
    {
      rank24hAgo: 8,
      rankDelta24h: 5,
      rankDelta24hState: "up",
    },
  );
  assert.equal(
    resolveRankDelta24h({
      currentRank: 8,
      previousRank: 3,
      currentlyRanked: true,
      previouslyRanked: true,
    }).rankDelta24hState,
    "down",
  );
  assert.equal(
    resolveRankDelta24h({
      currentRank: 3,
      previousRank: 3,
      currentlyRanked: true,
      previouslyRanked: true,
    }).rankDelta24hState,
    "unchanged",
  );
  assert.equal(
    resolveRankDelta24h({
      currentRank: 3,
      previousRank: null,
      currentlyRanked: true,
      previouslyRanked: false,
    }).rankDelta24hState,
    "new",
  );
  assert.equal(
    resolveRankDelta24h({
      currentRank: null,
      previousRank: null,
      currentlyRanked: false,
      previouslyRanked: false,
    }).rankDelta24hState,
    "unranked",
  );
});

test("directory consumes only accepted current public-battle projection evidence", () => {
  assert.match(
    directorySource,
    /games\.filter\(\s*isPublicBattleArchiveRow/,
  );
  assert.match(
    directorySource,
    /projectionStatus:\s*"accepted"/,
  );
  assert.match(
    directorySource,
    /affectsPublicAggregates:\s*true/,
  );
  assert.match(
    directorySource,
    /supersededBy:\s*null/,
  );
  assert.match(
    directorySource,
    /buildLeaderboardIdentityKey\(\{\s*steamId,\s*name:\s*replayName,\s*normalizedName,/,
  );
  assert.match(
    directorySource,
    /acceptedAt:\s*snapshot\.createdAt\.toISOString\(\)/,
  );
  assert.doesNotMatch(
    directorySource,
    /statEligible:\s*true/,
  );
  assert.doesNotMatch(
    directorySource,
    /PLAYER_DIRECTORY_GAME_WINDOW|take:\s*5000/,
  );
});

test("leaderboard has no raw discovered-name escape hatch", () => {
  assert.doesNotMatch(
    leaderboardSource,
    /buildDiscoveredLeaderboardEntries|discovered:/,
  );
  assert.match(
    leaderboardSource,
    /publicBattleGames\s*=\s*leaderboardGames\.filter\(\s*isPublicBattleArchiveRow/,
  );
  assert.match(
    leaderboardSource,
    /entry\.identityKind === "steam"[\s\S]*entry\.steamId === steamId/,
  );
  assert.match(
    leaderboardSource,
    /new Date\(\s*evidence\.acceptedAt/,
  );
  assert.match(
    leaderboardSource,
    /rankDelta24hMethod:\s*"reconstructed_current_corpus"/,
  );
  assert.doesNotMatch(
    leaderboardSource,
    /LEADERBOARD_GAME_WINDOW|take:\s*5000/,
  );
  assert.match(
    leaderboardSource,
    /rankDelta24h\s*=\s*input\.previousRank\s*-\s*input\.currentRank|resolveRankDelta24h/,
  );
});
