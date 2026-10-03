import assert from "node:assert/strict";
import test from "node:test";
import { buildRecoveryEvidenceSummary, classifyRecoveryEvidenceCase,
  type RecoveryEvidenceCaseInput } from "../lib/replayRecoveryCensus.ts";

function row(overrides: Partial<RecoveryEvidenceCaseInput> = {}): RecoveryEvidenceCaseInput {
  return {
    gameStatsId: 10, parseReason: "winner_unproven", resultResolved: false, archivePresent: false,
    attemptCount: 0, exactParserRunCount: 0, currentParserCandidateStatus: null,
    decisiveCandidate: false, siblingIds: [], authoritativeSiblingIds: [], modernAttemptIds: [],
    acceptedRatingAdjudicationIds: [], adjudicationIds: [], effectiveLedger: false,
    conflicts: false, disconnected: false, review: false, ...overrides,
  };
}

test("census uses final-row grain and the shared resolver's result, retaining every unresolved row", () => {
  const report = buildRecoveryEvidenceSummary([row(), row({ gameStatsId: 11, resultResolved: true }),
    row({ gameStatsId: 12, archivePresent: true })]);
  assert.equal(report.grain, "final_game_stats_row");
  assert.equal(report.totalFinalBattles, 3);
  assert.equal(report.resolvedCount, 1);
  assert.equal(report.unresolvedCount, 2);
  assert.equal(report.resolvedPercentage, 100 / 3);
  assert.deepEqual(report.primaryFamilyCounts, { archive_only: 1, evidence_empty: 1 });
});

test("one primary family coexists with overlapping evidence shapes", () => {
  const report = buildRecoveryEvidenceSummary([row({ archivePresent: true, attemptCount: 4,
    exactParserRunCount: 2, modernAttemptIds: [40, 41], siblingIds: [20], authoritativeSiblingIds: [20],
    decisiveCandidate: true, currentParserCandidateStatus: "complete" })]);
  assert.deepEqual(report.primaryFamilyCounts, { authoritative_sibling_requires_revalidation: 1 });
  assert.equal(report.evidenceShapeCounts.modernReceipts, 1);
  assert.equal(report.evidenceShapeCounts.decisiveParserCandidate, 1);
  assert.equal(report.evidenceShapeCounts.authoritativeSiblings, 1);
  assert.equal(report.safeYield, 0);
});

test("conflicts and disconnected/review evidence cannot qualify as recovery yield", () => {
  for (const guard of [{ conflicts: true }, { disconnected: true }, { review: true }]) {
    const candidate = classifyRecoveryEvidenceCase(row({ decisiveCandidate: true,
      modernAttemptIds: [42], effectiveLedger: true, ...guard }));
    assert.equal(candidate.primaryFamily, guard.conflicts ? "conflicting_evidence" : "disconnected_or_review");
    assert.equal(candidate.safeYield, 0);
    assert.equal(candidate.authorityGranted, false);
  }
});

test("stale parser and superseded evidence stay unresolved despite decisive flags", () => {
  for (const guard of [{ staleParserEvidence: true }, { supersededEvidence: true }]) {
    const candidate = classifyRecoveryEvidenceCase(row({ decisiveCandidate: true, ...guard }));
    assert.equal(candidate.primaryFamily, "stale_or_superseded_evidence");
    assert.equal(candidate.resultResolved, false);
  }
});

test("siblings are distinct evidence ids, never extra final rows or fabricated authority", () => {
  const report = buildRecoveryEvidenceSummary([row({ siblingIds: [10, 20, 20, 21],
    authoritativeSiblingIds: [20, 20] })]);
  assert.equal(report.totalFinalBattles, 1);
  assert.deepEqual(report.cases[0].siblingIds, [20, 21]);
  assert.deepEqual(report.cases[0].authoritativeSiblingIds, [20]);
  assert.equal(report.resolvedCount, 0);
  assert.throws(() => classifyRecoveryEvidenceCase(row({ siblingIds: [20], authoritativeSiblingIds: [21] })),
    /authoritative_sibling_outside_inventory/);
});

test("identical inventory rows and evidence ids never double-count cases", () => {
  const a = row({ modernAttemptIds: [41, 40, 41], siblingIds: [21, 20] });
  const b = row({ modernAttemptIds: [40, 41], siblingIds: [20, 21] });
  const report = buildRecoveryEvidenceSummary([a, b, a]);
  assert.equal(report.totalFinalBattles, 1);
  assert.equal(report.duplicateInputCount, 2);
  assert.equal(report.evidenceShapeCounts.modernReceipts, 1);
  assert.equal(report.cases[0].conflictingInventoryRows, false);
});

test("contradictory duplicate rows fail closed independent of input order", () => {
  const a = row({ resultResolved: true, archivePresent: true });
  const b = row({ resultResolved: false, parseReason: "source_changed", modernAttemptIds: [42] });
  const forward = buildRecoveryEvidenceSummary([a, b]);
  const reverse = buildRecoveryEvidenceSummary([b, a]);
  assert.deepEqual(forward, reverse);
  assert.equal(forward.resolvedCount, 0);
  assert.deepEqual(forward.primaryFamilyCounts, { conflicting_evidence: 1 });
  assert.deepEqual(forward.rawReasonCounts, { source_changed: 1, winner_unproven: 1 });
});

test("raw winner flags and public projections never resolve a result", () => {
  const report = buildRecoveryEvidenceSummary([row({ rawWinnerFlagsPresent: true,
    publicProjectionPresent: true })]);
  assert.equal(report.resolvedCount, 0);
  assert.equal(report.evidenceShapeCounts.rawWinnerFlags, 1);
  assert.equal(report.evidenceShapeCounts.publicProjection, 1);
  assert.equal(report.safeYield, 0);
  assert.equal(report.authorityGranted, false);
});

test("accepted exact rating authority is separate from numeric rating diagnostics and ledger history", () => {
  const report = buildRecoveryEvidenceSummary([
    row({ ratingDiagnosticsPresent: true }),
    row({ gameStatsId: 11, acceptedRatingAdjudicationIds: [51], acceptedRatingAuthority: true }),
    row({ gameStatsId: 12, adjudicationIds: [52], effectiveLedger: true }),
    row({ gameStatsId: 13, acceptedRatingAdjudicationIds: [53] }),
  ]);
  assert.equal(report.evidenceShapeCounts.acceptedRatingAuthority, 1);
  assert.equal(report.evidenceShapeCounts.acceptedRatingEvidence, 2);
  assert.equal(report.evidenceShapeCounts.ratingDiagnostics, 1);
  assert.equal(report.evidenceShapeCounts.effectiveLedger, 1);
  assert.equal(report.primaryFamilyCounts.adjudication_history_requires_review, 1);
  assert.equal(report.resolvedCount, 0);
});

test("no eligibility assertion can supply safe yield or mutation authority", () => {
  const input = { ...row({ decisiveCandidate: true, acceptedRatingAuthority: true,
    acceptedRatingAdjudicationIds: [51], modernAttemptIds: [42] }),
    validatedEligible: true, validatedRecovery: { eligible: true }, resultReady: true };
  const report = buildRecoveryEvidenceSummary([input]);
  assert.equal(report.safeYield, 0);
  assert.deepEqual(report.safeYieldByFamily, { accepted_rating_requires_revalidation: 0 });
  for (const value of [report, ...report.cases]) {
    assert.equal(value.authorityGranted, false);
    assert.equal(value.bettingAuthority, false);
    assert.equal(value.settlementAuthority, false);
    assert.equal(value.woloAuthority, false);
  }
});

test("empty census and reason taxonomy are deterministic without changing raw reasons", () => {
  assert.equal(buildRecoveryEvidenceSummary([]).resolvedPercentage, 0);
  const report = buildRecoveryEvidenceSummary([row({ parseReason: "  Exact Raw Reason  " }),
    row({ gameStatsId: 11, parseReason: null }), row({ gameStatsId: 12, parseReason: "" })]);
  assert.deepEqual(report.rawReasonCounts, { "": 1, "  Exact Raw Reason  ": 1 });
  assert.equal(report.missingParseReasonCount, 1);
  assert.deepEqual(report.cases.map((value) => value.gameStatsId), [10, 11, 12]);
  assert.equal(report.evidenceShapeCounts.evidenceEmpty, 3);
});

test("malformed ids, counters and unresolved-resolver input fail closed", () => {
  for (const value of [row({ gameStatsId: 0 }), row({ attemptCount: -1 }),
    row({ exactParserRunCount: 0.5 }), row({ siblingIds: [Number.MAX_SAFE_INTEGER + 1] }),
    row({ resultResolved: "true" as unknown as boolean })]) {
    assert.throws(() => classifyRecoveryEvidenceCase(value), /invalid_/);
  }
});

test("raw reason keys cannot change count-map prototypes", () => {
  const report = buildRecoveryEvidenceSummary([row({ parseReason: "__proto__" }),
    row({ gameStatsId: 11, parseReason: "constructor" }), row({ gameStatsId: 12, parseReason: "__proto__" })]);
  assert.equal(report.rawReasonCounts.__proto__, 2);
  assert.equal(report.rawReasonCounts.constructor, 1);
  assert.equal(Object.getPrototypeOf(report.rawReasonCounts), Object.prototype);
});
