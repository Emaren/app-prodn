import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeReplayPlayerIterations,
  normalizeReplayPlayers,
  resolveReplayTeams,
  resolveWinningTeamIndex,
  rosterSnapshot,
  validateMarketFinalIntegrity,
} from "../lib/teamResolution.ts";

function teamPlayers(size: number) {
  return Array.from({ length: size * 2 }, (_, index) => ({
    name: `Player ${index + 1}`,
    steam_id: String(76561198000000000n + BigInt(index)),
    team_id: index % 2,
    number: index + 1,
    winner: index % 2 === 0,
  }));
}

for (const size of [2, 3, 4]) {
  test(`${size}v${size} resolves from explicit zero/one team ids`, () => {
    const result = resolveReplayTeams(teamPlayers(size));
    assert.equal(result.status, "resolved");
    assert.equal(result.format, `${size}v${size}`);
    assert.deepEqual(result.teams.map((team) => team.players.length), [size, size]);
  });
}

test("1v1 resolves from exactly two unique players", () => {
  const result = resolveReplayTeams([{ name: "One" }, { name: "Two" }]);
  assert.equal(result.status, "resolved");
  assert.equal(result.format, "1v1");
});

test("shuffled and reversed order preserve the proposition", () => {
  const players = teamPlayers(4);
  const original = resolveReplayTeams(players);
  const shuffled = resolveReplayTeams([players[5], players[0], players[7], players[2], players[1], players[6], players[3], players[4]]);
  const reversed = resolveReplayTeams([...players].reverse());
  assert.equal(shuffled.propositionHash, original.propositionHash);
  assert.equal(reversed.propositionHash, original.propositionHash);
});

test("missing and partial team ids remain unresolved", () => {
  assert.equal(resolveReplayTeams(teamPlayers(4).map(({ team_id: _team, ...player }) => player)).status, "incomplete");
  const partial = teamPlayers(4);
  delete (partial[0] as { team_id?: number }).team_id;
  assert.equal(resolveReplayTeams(partial).status, "incomplete");
});

test("three teams, unequal teams, and duplicate identity conflict", () => {
  const three = teamPlayers(3);
  three[0].team_id = 2;
  assert.equal(resolveReplayTeams(three).status, "conflicting");
  const unequal = teamPlayers(3);
  unequal[0].team_id = 1;
  assert.equal(resolveReplayTeams(unequal).status, "conflicting");
  const duplicate = teamPlayers(2);
  duplicate[1].steam_id = duplicate[0].steam_id;
  assert.equal(resolveReplayTeams(duplicate).status, "conflicting");
});

test("aliases resolve identity without assigning teams", () => {
  const players = teamPlayers(2);
  players[0].name = "Savanger_Ab";
  players[1].name = "Scavenger_Ab";
  const normalized = normalizeReplayPlayers(players);
  const aliasKey = normalized[0].stablePlayerKey;
  const result = resolveReplayTeams(normalized, {
    identityAliases: { [normalized[1].stablePlayerKey]: aliasKey },
  });
  assert.equal(result.status, "conflicting");
  assert.ok(result.reasonCodes.includes("duplicate_player_identity"));
});

test("Savanger and jlann observed aliases retain replay team evidence", () => {
  const result = resolveReplayTeams([
    { name: "Savanger_Ab", steam_id: "76561198124349731", team_id: 0 },
    { name: "Tekki", steam_id: "76561198128506495", team_id: 0 },
    { name: "Jlann85", steam_id: "76561198105942599", team_id: 1 },
    { name: "MTR", steam_id: "76561197984092705", team_id: 1 },
  ]);
  assert.equal(result.status, "resolved");
  assert.deepEqual(result.teams.map((team) => team.teamKey), ["0", "1"]);
});

test("multi-iteration merge preserves complete teams and rejects conflicts", () => {
  const complete = teamPlayers(4);
  const incomplete = complete.map(({ team_id: _team, ...player }) => player);
  const merged = mergeReplayPlayerIterations([complete, incomplete]);
  assert.deepEqual(merged.conflictReasonCodes, []);
  assert.equal(resolveReplayTeams(merged.players).status, "resolved");
  const conflicting = complete.map((player) => ({ ...player }));
  conflicting[0].team_id = 1;
  const conflict = mergeReplayPlayerIterations([complete, conflicting]);
  assert.ok(conflict.conflictReasonCodes.includes("team_assignment_changed_between_iterations"));
  assert.equal(resolveReplayTeams(conflict.players, { conflictReasonCodes: conflict.conflictReasonCodes }).status, "conflicting");
});

test("a complete winning team is required", () => {
  const players = normalizeReplayPlayers(teamPlayers(4));
  const resolution = resolveReplayTeams(players, { final: true });
  assert.equal(resolveWinningTeamIndex(players, resolution), 0);
  players[1].winner = true;
  assert.equal(resolveWinningTeamIndex(players, resolution), null);
});

test("settlement requires the same complete final proposition", () => {
  const players = normalizeReplayPlayers(teamPlayers(4));
  const resolution = resolveReplayTeams(players);
  const valid = validateMarketFinalIntegrity({
    propositionHash: resolution.propositionHash,
    leftRosterSnapshot: rosterSnapshot(resolution.teams[0]),
    rightRosterSnapshot: rosterSnapshot(resolution.teams[1]),
    finalPlayers: players,
    finalWinner: "Player 1",
    finalBettingEligible: true,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.winningSide, "left");

  const mixed = [...players];
  mixed[0] = { ...mixed[0], teamId: "1" };
  const invalid = validateMarketFinalIntegrity({
    propositionHash: resolution.propositionHash,
    leftRosterSnapshot: rosterSnapshot(resolution.teams[0]),
    rightRosterSnapshot: rosterSnapshot(resolution.teams[1]),
    finalPlayers: mixed,
    finalWinner: "Player 1",
    finalBettingEligible: true,
  });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.reasonCodes.includes("final_proposition_hash_mismatch"));
});
