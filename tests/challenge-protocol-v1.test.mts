import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  CHALLENGE_PROTOCOL_VERSION,
  ChallengeProtocolError,
  bindChallengeSteamIdentities,
  challengeWinnerUserIdFromSteam,
  resolveBoundSteamWinnerId,
  sessionMatchesBoundSteamDuel,
} from "../lib/challengeProtocol.ts";

const LEFT = "76561198000000001";
const RIGHT = "76561198000000002";

function players(overrides: Array<Record<string, unknown>> = []) {
  return [
    { name: "Emaren Renamed", steamId: LEFT, winner: true, ...overrides[0] },
    { name: "Jim Renamed", steamId: RIGHT, winner: false, ...overrides[1] },
  ];
}

test("new WOLO challenge binds immutable distinct Steam identities", () => {
  assert.deepEqual(
    bindChallengeSteamIdentities({ challengerSteamId: ` ${LEFT} `, challengedSteamId: RIGHT }),
    {
      protocolVersion: CHALLENGE_PROTOCOL_VERSION,
      challengerSteamIdSnapshot: LEFT,
      challengedSteamIdSnapshot: RIGHT,
    },
  );
});

test("missing or invalid Steam identity fails closed with a stable code", () => {
  assert.throws(
    () => bindChallengeSteamIdentities({ challengerSteamId: null, challengedSteamId: RIGHT }),
    (error) => error instanceof ChallengeProtocolError &&
      error.code === "CHALLENGE_STEAM_IDENTITY_REQUIRED" && error.status === 422,
  );
});

test("same Steam account cannot occupy both sides", () => {
  assert.throws(
    () => bindChallengeSteamIdentities({ challengerSteamId: LEFT, challengedSteamId: LEFT }),
    (error) => error instanceof ChallengeProtocolError &&
      error.code === "CHALLENGE_STEAM_IDENTITY_CONFLICT",
  );
});

test("exact Steam duel survives mutable persona renames", () => {
  assert.equal(sessionMatchesBoundSteamDuel({
    players: players(),
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), true);
});

test("same display names with the wrong Steam account never satisfy the duel", () => {
  assert.equal(sessionMatchesBoundSteamDuel({
    players: players([{}, { steamId: "76561198000000003", name: "Jim Renamed" }]),
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), false);
});

test("missing replay Steam identity fails closed", () => {
  assert.equal(sessionMatchesBoundSteamDuel({
    players: players([{}, { steamId: null }]),
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), false);
});

test("team game containing both duelists never satisfies a 1v1 Challenge", () => {
  assert.equal(sessionMatchesBoundSteamDuel({
    players: [...players(), { name: "Third", steamId: "76561198000000003" }],
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), false);
});

test("winner resolves from canonical winner flag before mutable winner text", () => {
  assert.equal(resolveBoundSteamWinnerId({
    players: players(),
    winnerName: "some stale persona",
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), LEFT);
});

test("ambiguous winner flags fail closed", () => {
  assert.equal(resolveBoundSteamWinnerId({
    players: players([{}, { winner: true }]),
    winnerName: "Emaren Renamed",
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), null);
});

test("winner name fallback is only allowed inside an already exact Steam duel", () => {
  assert.equal(resolveBoundSteamWinnerId({
    players: players([{ winner: null }, { winner: null }]),
    winnerName: "Jim Renamed",
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), RIGHT);
});

test("stable winner user id is derived from frozen Steam identity", () => {
  assert.equal(challengeWinnerUserIdFromSteam({
    winnerSteamId: RIGHT,
    challengerUserId: 11,
    challengedUserId: 22,
    challengerSteamIdSnapshot: LEFT,
    challengedSteamIdSnapshot: RIGHT,
  }), 22);
});

test("migration adds constraints without manufacturing historical Steam identity", () => {
  const sql = fs.readFileSync(
    new URL("../prisma/migrations/20260911170000_challenge_protocol_v1/migration.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /protocol_version/);
  assert.match(sql, /challenger_steam_id_snapshot/);
  assert.match(sql, /challenged_steam_id_snapshot/);
  assert.match(sql, /result_winner_user_id/);
  assert.match(sql, /ck_scheduled_matches_result_winner_participant/);
  assert.doesNotMatch(sql, /UPDATE\s+"scheduled_matches"/i);
});
