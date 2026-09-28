import assert from "node:assert/strict";
import test from "node:test";

import {
  auditYield,
  classifyRosterCase,
  rosterOpportunities,
} from "../scripts/audit-replay-roster-opportunities.mts";

test("roster audit selects the exact result-known incomplete-roster grain once", () => {
  const rows = [
    { gameStatsId: 7, resultEligible: true, rosterComplete: false, registeredPlayerIds: [1] },
    { gameStatsId: 8, resultEligible: true, rosterComplete: false, registeredPlayerIds: [] },
    { gameStatsId: 9, resultEligible: false, rosterComplete: false, registeredPlayerIds: [2] },
    { gameStatsId: 10, resultEligible: true, rosterComplete: true, registeredPlayerIds: [] },
  ];
  const selected = rosterOpportunities({ unresolved: rows });
  assert.deepEqual(selected.map((row) => row.gameStatsId), [7, 8]);
  assert.throws(() => rosterOpportunities({ unresolved: [rows[0], rows[0]] }), /duplicate_logical_battle/);
});

test("roster audit preserves one primary disposition while retaining exact blocker", () => {
  assert.deepEqual(classifyRosterCase([], 0), {
    disposition: "complete_recovery_candidate",
    primaryReason: "complete_authoritative_roster_candidate",
  });
  assert.deepEqual(classifyRosterCase(["teams_resolution_missing", "participant_count_incomplete"], 2), {
    disposition: "side_team_ambiguity",
    primaryReason: "teams_resolution_missing",
  });
  assert.deepEqual(classifyRosterCase(["source_replay_hash_mismatch"], 1), {
    disposition: "parser_evidence_disagreement",
    primaryReason: "source_replay_hash_mismatch",
  });
});

test("roster audit projected yield counts only metric-complete candidate plans", () => {
  const result = auditYield(
    { logicalBattleTruthComplete: 68, uniqueLogicalBattles: 100 },
    [
      { logicalIdentity: "hash:a", disposition: "complete_recovery_candidate", projectedMetricComplete: true, resultEligible: true, registeredPlayerIds: [5], registeredUsers: [{ uid: "u5", name: "Player" }], gameStatsId: 1, plan: { projection: { projectedPlayers: [] } }, planSha256: "a" },
      { logicalIdentity: "hash:b", disposition: "complete_recovery_candidate", projectedMetricComplete: false, resultEligible: true, registeredPlayerIds: [], gameStatsId: 2 },
      { logicalIdentity: "hash:c", disposition: "partial_roster_evidence", projectedMetricComplete: true, resultEligible: true, registeredPlayerIds: [], gameStatsId: 3 },
    ],
  );
  assert.equal(result.additions, 1);
  assert.equal(result.projectedNumerator, 69);
  assert.equal(result.projectedPercent, 69);
  assert.equal(result.percentagePointGain, 1);
  assert.equal(result.playerFirstAdditions, 1);
  assert.deepEqual(result.playerFirstCandidates[0].users, [{ uid: "u5", name: "Player" }]);
});
