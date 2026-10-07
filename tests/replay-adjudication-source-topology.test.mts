import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applyReplayResultAdjudication, RETIRED_AUTOMATIC_REPLAY_RESULT_POLICY_VERSIONS,
  validateReplayResultAdjudication, type EffectiveReplayResultAdjudication } from "../lib/replayResultAdjudications.ts";
import { publicReplayRosterV2DisplayState } from "../lib/publicReplayRosterV2.ts";
import { publicReplayWinnerTruth } from "../lib/publicReplayTruth.ts";
import { resolveReplayResultForPlayer } from "../lib/replayPlayerResult.ts";

const rawFixture = JSON.parse(readFileSync(new URL("./fixtures/three-account-recovery-case-bindings.json", import.meta.url), "utf8"))[25782].game;
const sealed = JSON.parse(readFileSync(new URL("./fixtures/25782-approved-adjudication-projection.json", import.meta.url), "utf8"));
const adjudication = sealed.adjudication as EffectiveReplayResultAdjudication;
const sides = ["gold", "blue", "gold", "blue"];
const outcomes = (game: any) => game.players.map((player: any) => resolveReplayResultForPlayer(game, participant => participant.steamId === player.steam_id));

test("actual #25782 adjudication192 preserves complete bound native sides and stats-only forfeit truth", () => {
  const raw = structuredClone(rawFixture), original = structuredClone(raw);
  const verdict = structuredClone(adjudication), originalVerdict = structuredClone(verdict);
  assert.equal(sealed.sourceReceiptSha256, "42df389af7359d5ed9b460ff855583cc69d0b6d37033b6db4ad3788fc59d68ad");
  assert.equal(verdict.id, 192);
  const projected = applyReplayResultAdjudication(raw, verdict);
  assert.equal(publicReplayRosterV2DisplayState(raw.players).complete, true);
  assert.equal(publicReplayRosterV2DisplayState(projected.players).complete, true);
  assert.deepEqual(projected.players.map((p: any) => [p.team_id, p.teamId]), [["0", "0"], ["1", "1"], ["0", "0"], ["1", "1"]]);
  assert.deepEqual(outcomes(projected), ["loss", "win", "loss", "win"]);
  assert.equal(publicReplayWinnerTruth(projected).statsEligible, true);
  assert.equal(publicReplayWinnerTruth(projected).bettingEligible, false);
  assert.equal(projected.winningTeamKey, "1");
  assert.equal(projected.replayResultAdjudication.winning_team_key, "blue");
  assert.equal(projected.key_events.no_rated_result, true);
  assert.equal(projected.key_events.completed, false);
  assert.equal(projected.disconnect_detected, true);
  assert.equal(projected.duration, 50);
  assert.equal(projected.replayResultAdjudication.original_winner, "Unknown");
  assert.equal(projected.replayResultAdjudication.original_parse_reason, "hd_early_exit_under_60s");
  assert.deepEqual(raw, original); assert.deepEqual(verdict, originalVerdict);
});

test("repeated projection is exactly stable including raw provenance and result flags", () => {
  const once = applyReplayResultAdjudication(structuredClone(rawFixture), adjudication);
  const twice = applyReplayResultAdjudication(once, adjudication);
  assert.deepEqual(twice, once);
  assert.deepEqual(applyReplayResultAdjudication(twice, adjudication), once);
  assert.deepEqual(outcomes(twice), outcomes(once));
  assert.deepEqual(publicReplayWinnerTruth(twice), publicReplayWinnerTruth(once));
});

test("trusted manual regrouping keeps reviewed named sides and does not claim source topology", () => {
  const raw = structuredClone(rawFixture);
  const key = (slot: number) => `steam:${raw.players.find((p: any) => p.number === slot).steam_id}`;
  const v = validateReplayResultAdjudication({ replayHash: raw.replayHash, parseIteration: raw.parse_iteration, players: raw.players, payload: {
    idempotencyKey: "commissioner:test:manual-regrouping", sourceReplayHash: raw.replayHash,
    sourceParseIteration: raw.parse_iteration, sourceRosterHash: adjudication.sourceRosterHash,
    teams: [{ teamKey: "gold", playerKeys: [key(1), key(2)] }, { teamKey: "blue", playerKeys: [key(3), key(4)] }],
    winningTeamKey: "blue", reason: "Synthetic trusted manual regrouping control.",
  } });
  const verdict = { ...adjudication, ...v, teamAssignments: v.teams };
  const projected = applyReplayResultAdjudication(raw, verdict);
  assert.deepEqual(projected.players.map((p: any) => p.team_id), ["gold", "gold", "blue", "blue"]);
  assert.equal(publicReplayRosterV2DisplayState(projected.players).reason, "team_id_missing");
  assert.deepEqual(outcomes(projected), ["loss", "loss", "win", "win"]);
  assert.equal(publicReplayWinnerTruth(projected).statsEligible, true);
  assert.equal(publicReplayWinnerTruth(projected).bettingEligible, false);
});

for (const [name, change] of [
  ["duplicate frozen membership", (v: any) => { v.teamAssignments[0].players.push(structuredClone(v.teamAssignments[0].players[0])); }],
  ["extra frozen membership", (v: any) => { v.teamAssignments[0].players.push({ ...v.teamAssignments[0].players[0], stablePlayerKey: "steam:76561198000000199", steamId: "76561198000000199" }); }],
  ["missing bound source side", (v: any) => { v.teamAssignments[0].players[0].sourceTeamId = null; }],
  ["different bound source side", (v: any) => { v.teamAssignments[0].players[0].sourceTeamId = "0"; }],
  ["altered frozen Steam identity", (v: any) => { v.teamAssignments[0].players[0].steamId = "76561198000000199"; }],
  ["altered frozen slot", (v: any) => { v.teamAssignments[0].players[0].playerNumber = 8; }],
  ["altered frozen name", (v: any) => { v.teamAssignments[0].players[0].name = "Other identity"; }],
  ["inconsistent winning side key", (v: any) => { v.winningTeamKey = "gold"; }],
  ["fractional raw side", (_: any, raw: any) => { raw.players[0].team_id = 0.5; }],
  ["fractional raw slot", (_: any, raw: any) => { raw.players[0].number = 1.5; }],
  ["conflicting raw slot aliases", (_: any, raw: any) => { raw.players[0].playerNumber = 8; }],
  ["conflicting raw team aliases", (_: any, raw: any) => { raw.players[0].teamId = 1; }],
  ["conflicting raw Steam aliases", (_: any, raw: any) => { raw.players[0].steamId = "76561198000000199"; }],
] as Array<[string, (verdict: any, raw: any) => void]>) test(`source-side retention rejects ${name} and keeps the prior named-side projection`, () => {
  const raw = structuredClone(rawFixture), verdict = structuredClone(adjudication);
  change(verdict, raw);
  const projected = applyReplayResultAdjudication(raw, verdict);
  assert.deepEqual(projected.players.map((p: any) => p.team_id), sides);
  assert.equal(publicReplayRosterV2DisplayState(projected.players).complete, false);
});

test("numeric retention cannot repair an inconsistent accepted winning-side key", () => {
  const projected = applyReplayResultAdjudication(structuredClone(rawFixture), { ...adjudication, winningTeamKey: "gold" });
  assert.deepEqual(projected.players.map((p: any) => p.team_id), sides);
  assert.ok(outcomes(projected).every((result: string) => result === "unknown"));
});

test("missing frozen participant or changed source Steam roster cannot project an accepted verdict", () => {
  for (const changedSource of [false, true]) {
    const raw = structuredClone(rawFixture), verdict = structuredClone(adjudication);
    if (changedSource) raw.players[0].steam_id = "76561198000000199";
    else (verdict.teamAssignments as any[])[1].players.pop();
    assert.strictEqual(applyReplayResultAdjudication(raw, verdict), raw);
    assert.equal(publicReplayWinnerTruth(raw).statsEligible, false);
    assert.ok(outcomes(raw).every((result: string) => result === "unknown"));
  }
});

test("complete source topology does not revive any retired result policy", () => {
  for (const policy of RETIRED_AUTOMATIC_REPLAY_RESULT_POLICY_VERSIONS) {
    const raw = structuredClone(rawFixture), verdict = { ...adjudication, idempotencyKey: `evidence:auto:${policy}:25782` };
    assert.strictEqual(applyReplayResultAdjudication(raw, verdict), raw);
    assert.equal(publicReplayRosterV2DisplayState(raw.players).complete, true);
    assert.equal(publicReplayWinnerTruth(raw).statsEligible, false);
    assert.ok(outcomes(raw).every((result: string) => result === "unknown"));
  }
});
