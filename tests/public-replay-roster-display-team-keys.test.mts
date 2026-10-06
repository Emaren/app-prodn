import assert from "node:assert/strict";
import test from "node:test";

import { publicReplayRosterV2DisplayState } from "../lib/publicReplayRosterV2.ts";
import {
  applyReplayResultAdjudication,
  validateReplayResultAdjudication,
  type EffectiveReplayResultAdjudication,
} from "../lib/replayResultAdjudications.ts";
import { resolveReplayResultForPlayer } from "../lib/replayPlayerResult.ts";
import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";
import { buildRosterHash, normalizeReplayPlayers } from "../lib/teamResolution.ts";

function roster(size: number) {
  return Array.from({ length: size * 2 }, (_, index) => ({
    name: `Participant ${index + 1}`,
    number: index + 1,
    steam_id: `7656119800000010${index + 1}` as string | null,
    team_id: (index % 2) as unknown,
    human: true,
    winner: null as boolean | null,
  }));
}

function serialized(rosterValue: ReturnType<typeof roster>): ReturnType<typeof roster> {
  return rosterValue.map((player) => ({ ...player, team_id: `team:${player.team_id}` }));
}

for (const size of [2, 3, 4]) {
  test(`canonical team keys preserve the exact ${size}v${size} display roster`, () => {
    const numeric = roster(size);
    const canonical = serialized(numeric);
    const before = structuredClone(canonical);
    assert.deepEqual(publicReplayRosterV2DisplayState(canonical), publicReplayRosterV2DisplayState(numeric));
    assert.equal(publicReplayRosterV2DisplayState(canonical).complete, true);
    assert.deepEqual(canonical, before);
  });
}

// These two preserved adjudications exhibited the same serialization mismatch.
// The identities are anonymized; each fixture exercises the actual ledger transform.
for (const [gameStatsId, replayHash] of [
  [41041, "5a16af83553846ea9cf2ef81c458532930c09b382fa0415ed8801b0249de4968"],
  [25985, "451ac8b4712a7a0d05daabb42dfd946014084698ef04781d4822d5e8c1681320"],
] as const) {
  test(`accepted adjudication representation ${gameStatsId} preserves roster and result authority`, () => {
    const players = roster(4);
    const sourceRosterHash = buildRosterHash(normalizeReplayPlayers(players))!;
    const validated = validateReplayResultAdjudication({
      replayHash,
      parseIteration: 2,
      players,
      payload: {
        idempotencyKey: `evidence:auto:test:${gameStatsId}`,
        sourceReplayHash: replayHash,
        sourceParseIteration: 2,
        sourceRosterHash,
        teams: [0, 1].map((side) => ({
          teamKey: `team:${side}`,
          playerKeys: players.filter((player) => player.team_id === side).map((player) => `steam:${player.steam_id}`),
        })),
        winningTeamKey: "team:0",
        reason: "Preserved statistics adjudication fixture.",
      },
    });
    const adjudication: EffectiveReplayResultAdjudication = {
      id: gameStatsId,
      ...validated,
      decisionStatus: "accepted",
      affectsStats: true,
      affectsBets: false,
      actorDisplayNameSnapshot: "Reviewer",
      actorRole: "verified_submitter",
      teamAssignments: JSON.parse(JSON.stringify(validated.teams)),
      evidence: null,
      createdAt: "2026-09-21T04:35:29.685Z",
    };
    const game = applyReplayResultAdjudication({
      id: gameStatsId,
      replayHash,
      players,
      winner: "Unknown",
      is_final: true,
      disconnect_detected: false,
      parse_reason: "team_resignation_not_complete",
      parse_source: "watcher_final",
      replayResultAdjudications: [adjudication],
    }, adjudication);
    const before = structuredClone(game);
    const authority = publicReplayWinnerTruth(game);
    const outcomes = players.map((participant) => resolveReplayResultForPlayer(game, (player) => player.steamId === participant.steam_id));
    assert.equal(authority.statsEligible, true);
    assert.equal(authority.bettingEligible, false);
    assert.deepEqual(outcomes, ["win", "loss", "win", "loss", "win", "loss", "win", "loss"]);
    assert.equal(publicReplayRosterV2DisplayState(game.players).complete, true);
    assert.deepEqual(publicReplayWinnerTruth(game), authority);
    assert.deepEqual(players.map((participant) => resolveReplayResultForPlayer(game, (player) => player.steamId === participant.steam_id)), outcomes);
    assert.deepEqual(game, before);
  });
}

test("complete serialized roster cannot authorize an unknown result or raw winner flags", () => {
  const players = serialized(roster(2)).map((player, index) => ({ ...player, winner: index % 2 === 0 }));
  const game = {
    players,
    winner: "Participant 1 / Participant 3",
    is_final: true,
    parse_source: "watcher_final",
    parse_reason: "team_resignation_not_complete",
    key_events: { result_resolution: { result_trusted: false, result_status: "review_required" } },
  };
  assert.equal(publicReplayRosterV2DisplayState(players).complete, true);
  assert.equal(publicReplayWinnerTruth(game).statsEligible, false);
  for (const participant of players) {
    assert.equal(resolveReplayResultForPlayer(game, (player) => player.steamId === participant.steam_id), "unknown");
  }
});

test("canonical display keys do not expand supported counts, identity or topology", () => {
  const duplicate1v1 = serialized(roster(1));
  duplicate1v1[1].steam_id = duplicate1v1[0].steam_id;
  assert.equal(publicReplayRosterV2DisplayState(duplicate1v1).complete, false);
  const threeSides = serialized(roster(2));
  threeSides[3].team_id = "team:2";
  assert.equal(publicReplayRosterV2DisplayState(threeSides).reason, "team_count_3");
  const asymmetric = serialized(roster(2));
  asymmetric[3].team_id = "team:0";
  assert.equal(publicReplayRosterV2DisplayState(asymmetric).reason, "unbalanced_1v3");
  assert.equal(publicReplayRosterV2DisplayState(serialized(roster(4)).slice(0, 7)).complete, false);
  const nonhuman = serialized(roster(4));
  nonhuman[1].human = false;
  nonhuman[1].steam_id = null;
  assert.equal(publicReplayRosterV2DisplayState(nonhuman).reason, "participant_count_incomplete");
});

for (const invalid of [null, "team:-1", "team:01", "TEAM:0", "team: 0", "side:0", "team:1.5", "team:1e0", "team:9007199254740992"]) {
  test(`canonical display keys reject invalid side ${String(invalid)}`, () => {
    const players = serialized(roster(2));
    players[0].team_id = invalid;
    assert.equal(publicReplayRosterV2DisplayState(players).reason, "team_id_missing");
  });
}
