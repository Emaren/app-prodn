import assert from "node:assert/strict";
import test from "node:test";

import type { CurrentWatcherAccountState } from "../lib/currentWatcherAccountState.ts";
import { readPlayerSteamDmRating, readPlayerSteamRmRating } from "../lib/gameStatsView.ts";
import { buildPlayerPerformanceStats } from "../lib/playerPerformance.ts";
import { buildClaimedPublicPlayerRef, buildReplayPublicPlayerRef } from "../lib/publicPlayers.ts";

const steamId = "76561198000000001";
const player = buildClaimedPublicPlayerRef({
  uid: "current-rating-test",
  steamId,
  inGameName: "Current Warrior",
  steamPersonaName: "Current Warrior",
  verified: true,
  verificationLevel: 2,
});
const current: CurrentWatcherAccountState = {
  steamId,
  latestObservedName: "Current Warrior",
  nameObservedAt: "2026-10-05T00:00:00.000Z",
  steamRmRating: 1671,
  steamRmObservedAt: "2026-10-05T00:00:00.000Z",
  steamDmRating: 2200,
  steamDmObservedAt: "2026-10-04T00:00:00.000Z",
  ratingObservedAt: "2026-10-05T00:00:00.000Z",
  lastObservedAt: "2026-10-05T00:00:00.000Z",
};

function historical(id = 1, rm = 1300, dm = 1500) {
  return {
    id,
    winner: null,
    players: [
      { name: "Historical Alias", steam_id: steamId, steam_rm_rating: rm, steam_dm_rating: dm },
      { name: "Opponent", steam_id: "76561198000000002" },
    ],
    map: { name: "Arabia" },
    played_on: "2015-04-01T00:00:00.000Z",
    timestamp: "2026-10-05T12:00:00.000Z",
    parse_source: "file_upload",
    is_final: true,
  };
}

function rating(stats: ReturnType<typeof buildPlayerPerformanceStats>) {
  return [stats.steamRating, stats.ladderRating, stats.ratingLastSeenAt];
}

const expected = [1671, 2200, "2026-10-05T00:00:00.000Z"];

test("old replay uploaded today cannot replace current rating or registered identity", () => {
  const before = structuredClone(player);
  assert.deepEqual(rating(buildPlayerPerformanceStats([historical()], player, current)), expected);
  assert.deepEqual(player, before);
});

test("historical batch in random upload order cannot change current rating", () => {
  const batch = [historical(30, 900, 2900), historical(2, 2300, 800), historical(45, 1200, 1500)];
  for (const order of [batch, [...batch].reverse(), [batch[1], batch[2], batch[0]]]) {
    assert.deepEqual(rating(buildPlayerPerformanceStats(order, player, current)), expected);
  }
});

test("higher historical rating cannot replace current rating", () => {
  assert.deepEqual(rating(buildPlayerPerformanceStats([historical(1, 3000, 4000)], player, current)), expected);
});

test("lower historical rating cannot replace current rating", () => {
  assert.deepEqual(rating(buildPlayerPerformanceStats([historical(1, 500, 700)], player, current)), expected);
});

test("duplicate historical uploads cannot change current rating", () => {
  const replay = historical();
  assert.deepEqual(rating(buildPlayerPerformanceStats([replay, structuredClone(replay)], player, current)), expected);
});

test("alias reconciliation cannot transfer another Steam account's current rating", () => {
  const aliasPlayer = { ...player, aliases: [...player.aliases, "Historical Alias"] };
  assert.deepEqual(rating(buildPlayerPerformanceStats([historical()], aliasPlayer, {
    ...current,
    steamId: "76561198000000002",
  })), [null, null, null]);
  assert.deepEqual(rating(buildPlayerPerformanceStats([historical()], buildReplayPublicPlayerRef("Current Warrior"), current)), [null, null, null]);
});

test("RM and DM remain separate and generic historical rate_snapshot cannot fill current DM", () => {
  const replay = { ...historical(), players: [{ name: player.name, steam_id: steamId, rate_snapshot: 3999 }] };
  const rmOnly = { ...current, steamDmRating: null, steamDmObservedAt: null };
  assert.deepEqual(rating(buildPlayerPerformanceStats([replay], player, rmOnly)), [1671, null, current.ratingObservedAt]);
  const dmOnly = { ...current, steamRmRating: null, steamRmObservedAt: null, ratingObservedAt: current.steamDmObservedAt };
  assert.deepEqual(rating(buildPlayerPerformanceStats([replay], player, dmOnly)), [null, 2200, current.steamDmObservedAt]);
});

test("parser regeneration cannot recalculate current rating from replay snapshots", () => {
  const replay = historical();
  const reparsed = { ...replay, parse_source: "parser_regeneration", players: [{ name: "New Historical Alias", steam_id: steamId, steam_rm_rating: 2500, steam_dm_rating: 1200 }] };
  assert.deepEqual(rating(buildPlayerPerformanceStats([reparsed], player, current)), rating(buildPlayerPerformanceStats([replay], player, current)));
});

test("historical ratings remain queryable without becoming current account authority", () => {
  const replay = historical(1, 1333, 2444);
  assert.equal(readPlayerSteamRmRating(replay.players[0]), 1333);
  assert.equal(readPlayerSteamDmRating(replay.players[0]), 2444);
  const stats = buildPlayerPerformanceStats([replay], player);
  assert.equal(stats.matches, 1);
  assert.deepEqual(rating(stats), [null, null, null]);
  assert.equal(replay.players[0].steam_rm_rating, 1333);
  assert.equal(replay.players[0].steam_dm_rating, 2444);
});

test("a legitimate newer current account observation advances the appropriate lane", () => {
  const next = { ...current, steamRmRating: 1684, steamRmObservedAt: "2026-10-06T00:00:00.000Z", ratingObservedAt: "2026-10-06T00:00:00.000Z" };
  assert.deepEqual(rating(buildPlayerPerformanceStats([historical()], player, next)), [1684, 2200, next.ratingObservedAt]);
});
