import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { canonicalDirectoryParticipantResult } from "../lib/publicDirectoryResultAuthority.ts";

const source = readFileSync(new URL("../lib/publicPlayerDirectory.ts", import.meta.url), "utf8");
const ALPHA = "76561198103810510";
const BRAVO = "76561198000000002";

function game() {
  return {
    id: 25590,
    winner: "Alpha",
    is_final: true,
    disconnect_detected: false,
    parse_source: "upload",
    parse_reason: "recorded_postgame_final",
    key_events: { completed: true, postgame_available: true, has_scores: true },
    event_types: ["resign", "postgame"],
    players: [
      { name: "Alpha", steam_id: ALPHA, number: 1, winner: true, score: 1000 },
      { name: "Bravo", steam_id: BRAVO, number: 2, winner: false, score: 300 },
    ],
  };
}
const alpha = {
  resultEligible: true,
  resultStatus: "win",
  steamId: ALPHA,
  playerSlot: 1,
  normalizedName: "alpha",
};
const bravo = {
  ...alpha,
  resultStatus: "loss",
  steamId: BRAVO,
  playerSlot: 2,
  normalizedName: "bravo",
};

test("live directory recomputes W/L from current canonical participant resolver, not accepted snapshots alone", () => {
  assert.match(source, /canonicalDirectoryParticipantResult\(game, snapshot\)/);
  assert.doesNotMatch(source, /resultFromSnapshot\(snapshot\)/);
  assert.match(source, /loadPublicLeaderboardRawGames\(prisma\)/);
});

test("a complete final-game result still credits exactly the correct Steam participants", () => {
  const row = game();
  assert.equal(canonicalDirectoryParticipantResult(row, alpha), "win");
  assert.equal(canonicalDirectoryParticipantResult(row, bravo), "loss");
});

test("stale accepted Zodiac win and loss snapshots are both vetoed after disconnect", () => {
  const row = { ...game(), disconnect_detected: true };
  assert.equal(canonicalDirectoryParticipantResult(row, alpha), "unknown");
  assert.equal(canonicalDirectoryParticipantResult(row, bravo), "unknown");
});

test("untrusted team outcome cannot resurrect an old snapshot result", () => {
  const row = { ...game(),
    winner: "Alpha",
    parse_source: "watcher_final",
    parse_reason: "watcher_final_unparsed",
    key_events: {
      completed: false,
      postgame_available: false,
      has_scores: false,
      result_resolution: { result_status: "review_required", result_trusted: false },
    },
    event_types: ["build", "move"],
    players: [
      { name: "Alpha", steam_id: ALPHA, number: 1, team_id: 1, winner: true, score: null },
      { name: "Ally", steam_id: "76561198000000003", number: 2, team_id: 1, winner: true, score: null },
      { name: "Bravo", steam_id: BRAVO, number: 3, team_id: 2, winner: false, score: null },
      { name: "Opponent", steam_id: "76561198000000004", number: 4, team_id: 2, winner: false, score: null },
    ],
  };
  assert.equal(canonicalDirectoryParticipantResult(row, alpha), "unknown");
  assert.equal(canonicalDirectoryParticipantResult(row, bravo), "unknown");
});

test("foreign or ambiguous Steam identity never falls back to nickname", () => {
  const row = game();
  assert.equal(canonicalDirectoryParticipantResult(row, { ...alpha, steamId: "76561198000000033" }), "unknown");
  const duplicate = { ...row, players: [row.players[0], { ...row.players[0], number: 2 }] };
  assert.equal(canonicalDirectoryParticipantResult(duplicate, alpha), "unknown");
});

test("snapshot eligibility and status cannot create new resolved results", () => {
  const row = game();
  assert.equal(canonicalDirectoryParticipantResult(row, { ...alpha, resultEligible: false }), "unknown");
  assert.equal(canonicalDirectoryParticipantResult(row, { ...alpha, resultStatus: "loss" }), "unknown");
  assert.equal(canonicalDirectoryParticipantResult(row, { ...alpha, resultStatus: "unknown" }), "unknown");
});

test("slot or name without exact Steam identity cannot hijack a claimed account", () => {
  const row = game();
  const unclaimed = { ...alpha, steamId: null, playerSlot: 1 };
  assert.equal(canonicalDirectoryParticipantResult(row, unclaimed), "win");
  assert.equal(canonicalDirectoryParticipantResult(row, { ...unclaimed, normalizedName: "Bravo" }), "unknown");
  assert.equal(canonicalDirectoryParticipantResult(row, { ...unclaimed, playerSlot: 2 }), "unknown");
});

test("raw game's independently proven result must remain final", () => {
  const row = { ...game(), is_final: false };
  assert.equal(canonicalDirectoryParticipantResult(row, alpha), "unknown");
});
