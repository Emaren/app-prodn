import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReplayResultAdjudication,
  isRetiredAutomaticReplayResultAdjudication,
  loadReplayResultReviewState,
  type EffectiveReplayResultAdjudication,
} from "../lib/replayResultAdjudications.ts";
import { buildRosterHash, normalizeReplayPlayers } from "../lib/teamResolution.ts";
import { resolveReplayWinnerTruth } from "../lib/unresolvedWatcherResult.ts";

// Reduced exact #31588 observation, 2026-10-06T19:08:23.070Z.
// Receipt SHA-256: 2ac596a70974d00cf95baf2d7b1ae971e943c986826110d1b2d00c2dad40a29a.
// The unchanged roster is essential: the former projection passed every
// replay/roster fence and manufactured Zodiac's win from recorder shutdown.
const game = {
  id: 31588,
  replayHash: "4d4f87af5f6408364f1be50fb83a8986b8138a6db2340c244430e8972a49ae9f",
  parse_iteration: 51,
  winner: "Unknown",
  is_final: true,
  disconnect_detected: true,
  parse_source: "watcher_final",
  parse_reason: "watcher_final_submission",
  players: [
    { name: "Emaren", steam_id: "76561198065420384", number: 1, team_id: null, winner: null },
    { name: "Zodiac", steam_id: "76561198103810510", number: 2, team_id: null, winner: null },
  ],
  key_events: {
    rated: true, completed: false, postgame_available: false,
    resigned_player_numbers: [], resigned_player_names: [],
    team_resolution: { format: "1v1", status: "resolved", confidence: "high" },
    result_resolution: { result_status: "review_required", result_trusted: false },
  },
};
const legacy: EffectiveReplayResultAdjudication = {
  id: 135,
  idempotencyKey: "evidence:auto:replay-terminal-recorder-exit-v2:31588:4d4f87af5f640836:51",
  decisionStatus: "accepted",
  affectsStats: true,
  affectsBets: false,
  actorDisplayNameSnapshot: "Emaren",
  actorRole: "verified_submitter",
  teamAssignments: game.players.map(p => ({
    teamKey: `steam:${p.steam_id}`,
    players: [{ name: p.name, normalizedName: p.name.toLowerCase(), steamId: p.steam_id, stablePlayerKey: `steam:${p.steam_id}`, playerNumber: p.number, sourceTeamId: null }],
  })),
  winningTeamKey: "steam:76561198103810510",
  winningPlayerKeys: ["steam:76561198103810510"],
  reason: "Automatic provisional stats inference: authenticated watcher recorder Emaren ended an unresolved final rated 1v1 with no serialized or postgame result evidence; Zodiac is projected as the opposing winner pending stronger evidence.",
  evidence: { policyVersion: "replay-terminal-recorder-exit-v2", serializedResultAbsent: true, provisionalStatsInference: true, financialAuthority: false },
  sourceReplayHash: game.replayHash,
  sourceParseIteration: 51,
  sourceRosterHash: "caf0b522edcda8fdab1727f85e9bae8e0aa360efadd4e1d7310896b195313085",
  sourcePropositionHash: "03baef1b06f56bf449a8dc896123def128729643cb41fd55457028aa61b98318",
  createdAt: "2026-09-05T00:39:49.398Z",
};

test("#31588 matching-roster recorder-exit ledger row cannot manufacture public result truth", () => {
  assert.equal(buildRosterHash(normalizeReplayPlayers(game.players)), legacy.sourceRosterHash);
  const before = structuredClone({ game, legacy });
  const projected = applyReplayResultAdjudication(game, legacy);
  assert.strictEqual(projected, game);
  assert.equal(projected.winner, "Unknown");
  assert.deepEqual(projected.players.map(p => p.winner), [null, null]);
  const truth = resolveReplayWinnerTruth({ winner: projected.winner, players: projected.players, parseSource: projected.parse_source, parseReason: projected.parse_reason, isFinal: projected.is_final, disconnectDetected: projected.disconnect_detected, keyEvents: projected.key_events });
  assert.equal(truth.winner, null);
  assert.equal(truth.statsEligible, false);
  assert.equal(truth.bettingEligible, false);
  assert.deepEqual({ game, legacy }, before);
});

test("#31588 review retains historical ledger evidence while showing no current accepted inference", async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, uid: "admin", isAdmin: true }) },
    gameStats: { findUnique: async () => game },
    replayResultAdjudication: { findMany: async () => [legacy] },
    replayDesyncIncident: { findMany: async () => [] },
    betMarket: { findMany: async () => [] },
    pendingWoloClaim: { findMany: async () => [] },
  };
  const state = await loadReplayResultReviewState(prisma as never, "admin", game.id);
  assert.equal(state.currentAdjudication, null);
  assert.equal(state.effectiveGame.winner, "Unknown");
  assert.equal(state.adjudications.length, 1);
  assert.equal(state.adjudications[0]?.id, 135);
  assert.equal(state.adjudications[0]?.decisionStatus, "accepted");
});

test("only exact retired automatic recorder/action-tail policies are excluded", () => {
  for (const policy of ["replay-terminal-recorder-exit-v2", "replay-terminal-action-tail-v3", "replay-team-terminal-action-tail-v4"]) {
    const row = { ...legacy, idempotencyKey: `evidence:auto:${policy}:31588` };
    assert.equal(isRetiredAutomaticReplayResultAdjudication(row), true);
    assert.strictEqual(applyReplayResultAdjudication(game, row), game);
    for (const changedFlags of [{ affectsStats: false }, { affectsBets: true }]) {
      assert.equal(isRetiredAutomaticReplayResultAdjudication({ ...row, ...changedFlags }), true);
      assert.strictEqual(applyReplayResultAdjudication(game, { ...row, ...changedFlags }), game);
    }
  }
  // Synthetic positive contracts: no commissioner verdict is appended here.
  for (const key of ["review:31588:commissioner", "title-authority:replay-rating-delta-v1:31588:later", "evidence:auto:replay-terminal-action-tail-v30:31588"]) {
    assert.equal(isRetiredAutomaticReplayResultAdjudication({ ...legacy, idempotencyKey: key }), false);
  }
});
