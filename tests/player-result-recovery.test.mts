import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlayerResultRecoveryPlan, parsePlayerResultRecoveryRequest, PLAYER_RESULT_RECOVERY_TARGETS,
  type PlayerResultRecoveryFacts,
} from "../lib/playerResultRecovery.ts";
import { HD_REPLAY_PARSER_CONTRACT } from "../lib/replayEngineRoom.ts";
import { validateReplayResultAdjudication } from "../lib/replayResultAdjudications.ts";
import { buildRosterHash, normalizeReplayPlayers } from "../lib/teamResolution.ts";

const zodiac = PLAYER_RESULT_RECOVERY_TARGETS[0].steamId;
const vegeta = PLAYER_RESULT_RECOVERY_TARGETS[1].steamId;
const jiren = PLAYER_RESULT_RECOVERY_TARGETS[2].steamId;
const hash = "a".repeat(64);
const request = parsePlayerResultRecoveryRequest({ target: "all", dryRun: true, maxGames: 2 });
function game(id = 1, extra: Record<string, unknown> = {}) {
  return { id, replayHash: hash, replay_file: `${hash}.aoe2record`, is_final: true,
    parse_source: "watcher_final", parse_reason: "hd_final_parse_match_fallback", parse_iteration: 3,
    winner: null, disconnect_detected: false, played_on: "2026-01-01T00:00:00Z", key_events: {},
    players: [{ name: "Any historical alias", steam_id: zodiac, number: 1, team_id: 0, winner: null },
      { name: "Another alias", steam_id: vegeta, number: 2, team_id: 1, winner: null }], ...extra };
}
function facts(rows = [game()]): PlayerResultRecoveryFacts {
  return { rows,
    runs: [{ id: 101, inputHash: hash, ...HD_REPLAY_PARSER_CONTRACT, status: "completed", candidateOutputHash: "b".repeat(64), candidateOutputStorageKey: "/not-consumed-by-planner" }],
    archives: new Map([[hash, { present: true, byteSize: 100, reason: null }]]),
    exposures: new Map(), rosterPlans: new Map() };
}

test("fixed player cohort matches exact Steam identity across aliases, never display names", () => {
  const rows = [game(), game(2, { replayHash: "b".repeat(64), players: [{ name: "Zodiac", steam_id: jiren, number: 1, team_id: 0 }, { name: "Other", steam_id: "76561198123456789", number: 2, team_id: 1 }] })];
  const plan = buildPlayerResultRecoveryPlan(facts(rows), { ...request, target: "zodiac" });
  assert.equal(plan.players[0].totalBattles, 1);
  assert.equal(plan.cases.length, 1);
  assert.deepEqual(plan.cases[0].targetSteamIds, [zodiac]);
});

test("shared-player battles and duplicate source rows produce one replay job", () => {
  const plan = buildPlayerResultRecoveryPlan(facts([game(), game(2, { parse_iteration: 4 })]), request);
  assert.equal(plan.counts.unknownPlayerCount, 2);
  assert.equal(plan.counts.unknownResultPlayerCount, 2);
  assert.equal(plan.counts.distinctLogicalBattles, 1);
  assert.equal(plan.counts.distinctReplayJobs, 1);
  assert.deepEqual(plan.cases[0].sourceGameStatsIds, [1, 2]);
  assert.deepEqual(plan.selectedGameStatsIds, [2]);
});

test("one SHA with conflicting logical battle identities remains deduplicated and fenced", () => {
  const plan = buildPlayerResultRecoveryPlan(facts([game(1, { key_events: { platform_match_id: "left" } }), game(2, { key_events: { platform_match_id: "right" } })]), request);
  assert.equal(plan.counts.distinctLogicalBattles, 2);
  assert.equal(plan.counts.distinctReplayJobs, 1);
  assert.equal(plan.cases[0].primaryRoute, "human_review_only");
  assert.equal(plan.cases[0].nativeStructurallyEligible, false);
});

test("exact archive absence cannot become native eligibility", () => {
  const data = facts(); data.archives.clear();
  const plan = buildPlayerResultRecoveryPlan(data, request);
  assert.equal(plan.counts.sourceMissing, 1);
  assert.equal(plan.cases[0].primaryRoute, "source_artifact_missing");
  assert.deepEqual(plan.selectedGameStatsIds, []);
});

test("roster slot omission, duplicate slot and fractional slot are rejected", () => {
  for (const number of [undefined, 1, 2.5]) {
    const row = game(); row.players[1] = { ...row.players[1], number: number as number };
    const plan = buildPlayerResultRecoveryPlan(facts([row]), request);
    assert.equal(plan.cases[0].nativeStructurallyEligible, false);
    assert.equal(plan.cases[0].primaryRoute, "parser_research_required");
  }
});

test("any linked market, claim or confirmed desync requires existing commissioner review", () => {
  for (const kind of ["market", "claim", "desync"]) {
    const data = facts([game(1, { currentDesyncOccurred: kind === "desync" })]);
    data.exposures.set(1, { marketIds: kind === "market" ? [99] : [], wagers: 0, stakeIntents: 0, claims: kind === "claim" ? 1 : 0, settlementRecorded: false });
    const plan = buildPlayerResultRecoveryPlan(data, request);
    assert.equal(plan.cases[0].primaryRoute, "human_review_only");
    assert.equal(plan.cases[0].reviewHref, "/game-stats/1");
    assert.equal(plan.cases[0].nativeStructurallyEligible, false);
  }
});

test("existing targeted roster recovery precedes native candidate work", () => {
  const data = facts();
  data.rosterPlans.set(1, { status: "eligible", blockers: [], decisionHash: "c".repeat(64) });
  const plan = buildPlayerResultRecoveryPlan(data, request);
  assert.equal(plan.cases[0].primaryRoute, "roster_recovery_eligible");
  assert.equal(plan.counts.parserRecoverable, 1);
  assert.deepEqual(plan.selectedGameStatsIds, []);
});

test("missing parser routes to current reparse; identical current failed bytes go to research", () => {
  const absent = facts(); absent.runs = [];
  assert.equal(buildPlayerResultRecoveryPlan(absent, request).cases[0].primaryRoute, "current_parser_reparse_eligible");
  const failed = facts(); failed.runs[0].status = "failed";
  assert.equal(buildPlayerResultRecoveryPlan(failed, request).cases[0].primaryRoute, "parser_research_required");
  const stale = facts(); stale.runs[0].passVersion = "8";
  assert.equal(buildPlayerResultRecoveryPlan(stale, request).cases[0].primaryRoute, "current_parser_reparse_eligible");
});

test("different source hash cannot satisfy current parser run for selected bytes", () => {
  const data = facts(); data.runs[0].inputHash = "d".repeat(64);
  assert.equal(buildPlayerResultRecoveryPlan(data, request).cases[0].primaryRoute, "current_parser_reparse_eligible");
});

test("a known accepted adjudication suppresses native result repair", () => {
  const original = game();
  const validated = validateReplayResultAdjudication({ replayHash: hash, parseIteration: 3, players: original.players, payload: {
    idempotencyKey: "commissioner:control:1", sourceReplayHash: hash, sourceParseIteration: 3,
    sourceRosterHash: buildRosterHash(normalizeReplayPlayers(original.players)),
    teams: [{ teamKey: "team:0", playerKeys: [`steam:${zodiac}`] }, { teamKey: "team:1", playerKeys: [`steam:${vegeta}`] }], winningTeamKey: "team:0", reason: "Independently confirmed terminal control.",
  } });
  const row = game(1, { replayResultAdjudications: [{ ...validated, id: 999, decisionStatus: "accepted", affectsStats: true, affectsBets: false, teamAssignments: validated.teams, actorRole: "site_admin", actorDisplayNameSnapshot: "Commissioner", createdAt: "2026-01-01T00:00:00Z" }] });
  const plan = buildPlayerResultRecoveryPlan(facts([row]), request);
  assert.equal(plan.players[0].unknownResults, 0);
  assert.equal(plan.players[1].unknownResults, 0);
  assert.equal(plan.cases.length, 0);
});

test("scheduled match and trophy links are review-only even without a market", () => {
  for (const edge of [{ scheduledMatchIds: [21] }, { trophyChallengeIds: [22] }, { settlementRecorded: true }]) {
    const data = facts();
    data.exposures.set(1, { marketIds: [], wagers: 0, stakeIntents: 0, claims: 0, settlementRecorded: false, ...edge });
    assert.equal(buildPlayerResultRecoveryPlan(data, request).cases[0].primaryRoute, "human_review_only");
  }
});

test("exposure across duplicate source rows counts each market and claim once", () => {
  const data = facts([game(), game(2)]);
  data.exposures.set(1, { marketIds: [21], wagers: 3, stakeIntents: 1, claims: 1, settlementRecorded: false, marketCounts: [{ id: 21, wagers: 3, stakeIntents: 1 }], claimIds: [91] });
  data.exposures.set(2, { marketIds: [21, 22], wagers: 5, stakeIntents: 2, claims: 2, settlementRecorded: false, marketCounts: [{ id: 21, wagers: 3, stakeIntents: 1 }, { id: 22, wagers: 2, stakeIntents: 1 }], claimIds: [91, 92] });
  const exposure = buildPlayerResultRecoveryPlan(data, request).cases[0].financialExposure;
  assert.equal(exposure.wagers, 5);
  assert.equal(exposure.stakeIntents, 2);
  assert.equal(exposure.claims, 2);
});

test("invalid immutable source hash fails closed even if a caller marks its archive present", () => {
  const data = facts([game(1, { replayHash: "not-a-hash" })]);
  data.archives.set("not-a-hash", { present: true, byteSize: 100, reason: null });
  assert.equal(buildPlayerResultRecoveryPlan(data, request).cases[0].primaryRoute, "source_artifact_missing");
});

test("native structural eligibility remains candidate-only with independent controls missing", () => {
  const plan = buildPlayerResultRecoveryPlan(facts(), request);
  assert.equal(plan.cases[0].primaryRoute, "native_replay_eligible");
  assert.equal(plan.counts.nativeReplayEligible, 1);
  assert.equal(plan.nativeGate.executionEnabled, false);
  assert.equal(plan.nativeGate.controlsGreen, false);
  assert.equal(plan.counts.recoveredDuringCampaign, 0);
  assert.deepEqual(plan.authorityBoundary, { databaseWrites: 0, candidateOnly: true, affectsStats: false, affectsBets: false, settlementAuthority: false, woloAuthority: false });
});

test("request rejects browser-supplied arbitrary paths, hashes, shell and wider concurrency", () => {
  for (const extra of [{ replaySha256: hash }, { path: "/tmp/file" }, { command: "echo unsafe" }, { steamId: zodiac }, { concurrency: 2 }, { dryRun: false }, { maxGames: 11 }]) {
    assert.throws(() => parsePlayerResultRecoveryRequest({ target: "all", dryRun: true, ...extra }));
  }
});

test("unchanged facts produce the same plan fence after interruption or refreshed timestamp", () => {
  const first = buildPlayerResultRecoveryPlan(facts(), request, "2026-01-01T00:00:00Z");
  const resumed = buildPlayerResultRecoveryPlan(facts(), request, "2026-01-02T00:00:00Z");
  assert.equal(first.planSha256, resumed.planSha256);
  assert.deepEqual(first.selectedGameStatsIds, resumed.selectedGameStatsIds);
  const changed = facts(); changed.rows[0].parse_iteration = 5;
  assert.notEqual(first.planSha256, buildPlayerResultRecoveryPlan(changed, request).planSha256);
});
