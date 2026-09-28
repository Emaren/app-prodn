import assert from "node:assert/strict";
import test from "node:test";
import { parseCensusArguments, potentialModernQuorum, projectedYield, blockerCategory, finalizeCensusCases } from "../scripts/census-watcher-receipt-yield.mts";
const paths = ["--api-root", "/api", "--python", "/python", "--archive-dir", "/archive", "--receipt-dir", "/receipts"];
const receipt = (n: number) => ({ schema: "aoe2war-watcher-final-observation/v1", uploader_uid: `u${n}`,
  watcher_session_hash: `s${n}`, replay_hash: `r${n}`, participant_side_hash: `side${n}` });

test("census has no apply mode and rejects unknown/duplicate flags", () => {
  assert.throws(() => parseCensusArguments([...paths, "--apply", "true"]));
  assert.throws(() => parseCensusArguments([...paths, "--api-root", "/other"]));
});
test("serial planner work is bounded and supports inventory-only execution", () => {
  assert.equal(parseCensusArguments(paths).maxPlans, 32);
  assert.equal(parseCensusArguments([...paths, "--max-plans", "0"]).maxPlans, 0);
  for (const bad of ["257", "-1", "0.5", "NaN"]) assert.throws(() => parseCensusArguments([...paths, "--max-plans", bad]));
});
test("runtime paths must be explicit and absolute", () => {
  assert.throws(() => parseCensusArguments([]));
  assert.throws(() => parseCensusArguments(["--api-root", "relative", ...paths.slice(2)]));
});
test("legacy or absent receipts never produce possible modern quorum", () => {
  assert.equal(potentialModernQuorum([]), false);
  assert.equal(potentialModernQuorum([null, { winner: true }, {}]), false);
  assert.equal(potentialModernQuorum([receipt(1)]), false);
});
test("same side/account/session/bytes cannot pass necessary quorum prefilter", () => {
  for (const field of ["uploader_uid", "watcher_session_hash", "replay_hash", "participant_side_hash"]) {
    const a = receipt(1), b = { ...receipt(2), [field]: a[field as keyof typeof a] };
    assert.equal(potentialModernQuorum([a, b]), false, field);
  }
  assert.equal(potentialModernQuorum([receipt(1), receipt(2)]), true);
});
test("projected gain uses exact logical winner-plus-roster grain and grants no authority", () => {
  const result = projectedYield({ uniqueLogicalBattles: 100, logicalBattleTruthComplete: 68 }, [
    { gameStatsId: 1, outcome: "eligible", rosterComplete: true, resultEligible: false, registeredPlayerIds: [5] },
    { gameStatsId: 2, outcome: "eligible", rosterComplete: false, resultEligible: false, registeredPlayerIds: [] },
    { gameStatsId: 3, outcome: "blocked", rosterComplete: true, resultEligible: false, registeredPlayerIds: [] },
    { gameStatsId: 4, outcome: "eligible", rosterComplete: true, resultEligible: true, registeredPlayerIds: [] },
  ]);
  assert.deepEqual(result.projectedFullTruthGainIds, [1]);
  assert.deepEqual(result.projectedCurrentPlayerGainIds, [1]);
  assert.equal(result.projectedNumerator, 69);
  assert.equal(result.newlyResolvedGames, 0);
  assert.equal(result.resultAuthorityGranted, false);
  assert.equal(result.bettingAuthority, false);
  assert.equal(result.settlementAuthority, false);
  assert.equal(result.woloAuthority, false);
});


test("blocker taxonomy preserves specific evidence failures", () => {
  assert.equal(blockerCategory("no_supported_modern_receipt"), "no_supported_modern_signed_receipt");
  assert.equal(blockerCategory("independent_cross_side_quorum_missing"), "insufficient_cross_side_quorum");
  assert.equal(blockerCategory("archive_roster_mismatch"), "roster_identity");
  assert.equal(blockerCategory("receipt_topology_binding_mismatch"), "topology");
  assert.equal(blockerCategory("mixed_logical_battle"), "logical_battle_identity");
  assert.equal(blockerCategory("archive_digest_mismatch"), "archive_missing_or_mismatch");
  assert.equal(blockerCategory("parser_contract_mismatch"), "parser_contract_or_evidence_mismatch");
  assert.equal(blockerCategory("adjudication_history_exists"), "preexisting_adjudication_desync_review");
  assert.equal(blockerCategory("source_snapshot_changed_during_evaluation"), "freshness_or_source_mutation");
  assert.equal(blockerCategory("new_unknown_failure"), "other");
});
test("only battle-specific source drift fences an otherwise eligible candidate", () => {
  const cases = [
    { gameStatsId: 1, outcome: "eligible", reason: "explicit_apply_required", rosterComplete: true, resultEligible: false, registeredPlayerIds: [5] },
    { gameStatsId: 2, outcome: "eligible", reason: "explicit_apply_required", rosterComplete: true, resultEligible: false, registeredPlayerIds: [] },
  ];
  const stable = finalizeCensusCases(cases, new Set());
  assert.equal(stable[0].outcome, "eligible");
  assert.equal(stable[1].outcome, "eligible");

  const fenced = finalizeCensusCases(cases, new Set([1]));
  assert.equal(fenced[0].outcome, "blocked");
  assert.equal(fenced[0].reason, "battle_source_changed_during_census");
  assert.equal(fenced[1].outcome, "eligible");
  assert.equal(projectedYield({ uniqueLogicalBattles: 100, logicalBattleTruthComplete: 68 }, fenced).percentagePointGain, 1);
});

test("battle-specific drift belongs to freshness/source-mutation taxonomy", () => {
  assert.equal(blockerCategory("battle_source_changed_during_census"), "freshness_or_source_mutation");
});
