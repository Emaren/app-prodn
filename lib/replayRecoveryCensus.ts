/** Read-only evidence census at final GameStats-row grain.
 *
 * These inputs are inventory facts supplied by a loader using the shared public
 * result resolver. Evidence presence is a prefilter, never promotion authority.
 * This module intentionally has no database, filesystem, or runtime dependencies.
 */
export type RecoveryEvidenceCaseInput = {
  gameStatsId: number;
  parseReason: string | null;
  resultResolved: boolean;
  archivePresent: boolean;
  attemptCount: number;
  exactParserRunCount: number;
  currentParserCandidateStatus: string | null;
  decisiveCandidate: boolean;
  siblingIds: readonly number[];
  authoritativeSiblingIds: readonly number[];
  modernAttemptIds: readonly number[];
  acceptedRatingAdjudicationIds: readonly number[];
  adjudicationIds: readonly number[];
  effectiveLedger: boolean;
  conflicts: boolean;
  disconnected: boolean;
  review: boolean;
  staleParserEvidence?: boolean;
  supersededEvidence?: boolean;
  /** The loader must distinguish accepted exact rating authority from deltas. */
  acceptedRatingAuthority?: boolean;
  ratingDiagnosticsPresent?: boolean;
  publicProjectionPresent?: boolean;
  rawWinnerFlagsPresent?: boolean;
};

export type RecoveryPrimaryFamily =
  | "resolved"
  | "conflicting_evidence"
  | "disconnected_or_review"
  | "stale_or_superseded_evidence"
  | "effective_ledger_requires_revalidation"
  | "accepted_rating_requires_revalidation"
  | "authoritative_sibling_requires_revalidation"
  | "decisive_parser_candidate_requires_revalidation"
  | "modern_receipts_require_revalidation"
  | "adjudication_history_requires_review"
  | "duplicate_sibling_evidence"
  | "parser_history_only"
  | "non_result_metadata_only"
  | "archive_only"
  | "evidence_empty";

export type RecoveryEvidenceCase = RecoveryEvidenceCaseInput & {
  primaryFamily: RecoveryPrimaryFamily;
  rawReasons: string[];
  missingParseReason: boolean;
  conflictingInventoryRows: boolean;
  evidenceShape: {
    archive: boolean;
    attempts: boolean;
    exactParserRuns: boolean;
    currentParserCandidate: boolean;
    decisiveParserCandidate: boolean;
    duplicateSiblings: boolean;
    authoritativeSiblings: boolean;
    modernReceipts: boolean;
    acceptedRatingEvidence: boolean;
    acceptedRatingAuthority: boolean;
    ledgerHistory: boolean;
    effectiveLedger: boolean;
    conflictingEvidence: boolean;
    disconnectedOrReview: boolean;
    staleOrSuperseded: boolean;
    ratingDiagnostics: boolean;
    publicProjection: boolean;
    rawWinnerFlags: boolean;
    evidenceEmpty: boolean;
  };
  safeYield: 0;
  requiresIndependentRevalidation: boolean;
  authorityGranted: false;
  bettingAuthority: false;
  settlementAuthority: false;
  woloAuthority: false;
};

function nonnegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid_${name}`);
  return value;
}

function positiveId(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("invalid_game_stats_or_evidence_id");
  return value;
}

function ids(values: readonly number[], excludedId?: number): number[] {
  if (!Array.isArray(values)) throw new Error("invalid_evidence_id_inventory");
  return [...new Set(values.map(positiveId))].filter((id) => id !== excludedId).sort((a, b) => a - b);
}

function normalize(input: RecoveryEvidenceCaseInput): RecoveryEvidenceCaseInput {
  const gameStatsId = positiveId(input.gameStatsId);
  for (const field of ["resultResolved", "archivePresent", "decisiveCandidate", "effectiveLedger",
    "conflicts", "disconnected", "review"] as const) {
    if (typeof input[field] !== "boolean") throw new Error(`invalid_${field}`);
  }
  for (const field of ["staleParserEvidence", "supersededEvidence", "acceptedRatingAuthority",
    "ratingDiagnosticsPresent", "publicProjectionPresent", "rawWinnerFlagsPresent"] as const) {
    if (input[field] !== undefined && typeof input[field] !== "boolean") throw new Error(`invalid_${field}`);
  }
  if (input.parseReason !== null && typeof input.parseReason !== "string") throw new Error("invalid_parse_reason");
  if (input.currentParserCandidateStatus !== null && typeof input.currentParserCandidateStatus !== "string") {
    throw new Error("invalid_parser_candidate_status");
  }
  const siblingIds = ids(input.siblingIds, gameStatsId);
  const authoritativeSiblingIds = ids(input.authoritativeSiblingIds, gameStatsId);
  if (authoritativeSiblingIds.some((id) => !siblingIds.includes(id))) throw new Error("authoritative_sibling_outside_inventory");
  return {
    gameStatsId, parseReason: input.parseReason, resultResolved: input.resultResolved,
    archivePresent: input.archivePresent,
    attemptCount: nonnegativeInteger(input.attemptCount, "attempt_count"),
    exactParserRunCount: nonnegativeInteger(input.exactParserRunCount, "exact_parser_run_count"),
    currentParserCandidateStatus: input.currentParserCandidateStatus,
    decisiveCandidate: input.decisiveCandidate, siblingIds, authoritativeSiblingIds,
    modernAttemptIds: ids(input.modernAttemptIds),
    acceptedRatingAdjudicationIds: ids(input.acceptedRatingAdjudicationIds),
    adjudicationIds: ids(input.adjudicationIds), effectiveLedger: input.effectiveLedger,
    conflicts: input.conflicts, disconnected: input.disconnected, review: input.review,
    staleParserEvidence: input.staleParserEvidence === true,
    supersededEvidence: input.supersededEvidence === true,
    acceptedRatingAuthority: input.acceptedRatingAuthority === true,
    ratingDiagnosticsPresent: input.ratingDiagnosticsPresent === true,
    publicProjectionPresent: input.publicProjectionPresent === true,
    rawWinnerFlagsPresent: input.rawWinnerFlagsPresent === true,
  };
}

export function classifyRecoveryEvidenceCase(input: RecoveryEvidenceCaseInput): RecoveryEvidenceCase {
  const value = normalize(input);
  const evidenceShape = {
    archive: value.archivePresent,
    attempts: value.attemptCount > 0,
    exactParserRuns: value.exactParserRunCount > 0,
    currentParserCandidate: Boolean(value.currentParserCandidateStatus),
    decisiveParserCandidate: value.decisiveCandidate,
    duplicateSiblings: value.siblingIds.length > 0,
    authoritativeSiblings: value.authoritativeSiblingIds.length > 0,
    modernReceipts: value.modernAttemptIds.length > 0,
    acceptedRatingEvidence: value.acceptedRatingAdjudicationIds.length > 0,
    acceptedRatingAuthority: value.acceptedRatingAuthority === true && value.acceptedRatingAdjudicationIds.length > 0,
    ledgerHistory: value.adjudicationIds.length > 0,
    effectiveLedger: value.effectiveLedger,
    conflictingEvidence: value.conflicts,
    disconnectedOrReview: value.disconnected || value.review,
    staleOrSuperseded: value.staleParserEvidence === true || value.supersededEvidence === true,
    ratingDiagnostics: value.ratingDiagnosticsPresent === true,
    publicProjection: value.publicProjectionPresent === true,
    rawWinnerFlags: value.rawWinnerFlagsPresent === true,
    evidenceEmpty: false,
  };
  // An archive, diagnostics, and a public projection are real evidence shapes,
  // but none independently establishes a winner. Keep them visible in counts.
  evidenceShape.evidenceEmpty = ![
    evidenceShape.archive, evidenceShape.attempts, evidenceShape.exactParserRuns,
    evidenceShape.currentParserCandidate, evidenceShape.decisiveParserCandidate,
    evidenceShape.duplicateSiblings, evidenceShape.authoritativeSiblings, evidenceShape.modernReceipts,
    evidenceShape.acceptedRatingEvidence, evidenceShape.ledgerHistory, evidenceShape.effectiveLedger,
    evidenceShape.ratingDiagnostics, evidenceShape.publicProjection, evidenceShape.rawWinnerFlags,
  ].some(Boolean);
  const primaryFamily: RecoveryPrimaryFamily = value.resultResolved ? "resolved"
    : evidenceShape.conflictingEvidence ? "conflicting_evidence"
    : evidenceShape.disconnectedOrReview ? "disconnected_or_review"
    : evidenceShape.staleOrSuperseded ? "stale_or_superseded_evidence"
    : evidenceShape.effectiveLedger ? "effective_ledger_requires_revalidation"
    : evidenceShape.acceptedRatingAuthority ? "accepted_rating_requires_revalidation"
    : evidenceShape.authoritativeSiblings ? "authoritative_sibling_requires_revalidation"
    : evidenceShape.decisiveParserCandidate ? "decisive_parser_candidate_requires_revalidation"
    : evidenceShape.modernReceipts ? "modern_receipts_require_revalidation"
    : evidenceShape.ledgerHistory || evidenceShape.acceptedRatingEvidence ? "adjudication_history_requires_review"
    : evidenceShape.duplicateSiblings ? "duplicate_sibling_evidence"
    : evidenceShape.attempts || evidenceShape.exactParserRuns || evidenceShape.currentParserCandidate ? "parser_history_only"
    : evidenceShape.archive ? "archive_only"
    : evidenceShape.ratingDiagnostics || evidenceShape.publicProjection || evidenceShape.rawWinnerFlags ? "non_result_metadata_only"
    : "evidence_empty";
  return {
    ...value, primaryFamily, evidenceShape,
    rawReasons: value.parseReason === null ? [] : [value.parseReason],
    missingParseReason: value.parseReason === null,
    conflictingInventoryRows: false, safeYield: 0,
    requiresIndependentRevalidation: !value.resultResolved,
    authorityGranted: false, bettingAuthority: false, settlementAuthority: false, woloAuthority: false,
  };
}

function unionIds(left: readonly number[], right: readonly number[]): number[] {
  return ids([...left, ...right]);
}

/** Duplicate final rows are counted once. Contradictory rows fail closed rather
 * than selecting whichever source happened to be encountered last.
 */
export function buildRecoveryEvidenceSummary(inputs: readonly RecoveryEvidenceCaseInput[]) {
  const casesById = new Map<number, RecoveryEvidenceCase>();
  let duplicateInputCount = 0;
  for (const input of inputs) {
    const next = classifyRecoveryEvidenceCase(input);
    const prior = casesById.get(next.gameStatsId);
    if (!prior) { casesById.set(next.gameStatsId, next); continue; }
    duplicateInputCount += 1;
    if (JSON.stringify(prior) === JSON.stringify(next)) continue;
    const merged = classifyRecoveryEvidenceCase({
      ...prior, parseReason: "conflicting_inventory_rows", resultResolved: false, conflicts: true,
      archivePresent: prior.archivePresent || next.archivePresent,
      attemptCount: Math.max(prior.attemptCount, next.attemptCount),
      exactParserRunCount: Math.max(prior.exactParserRunCount, next.exactParserRunCount),
      currentParserCandidateStatus: prior.currentParserCandidateStatus === next.currentParserCandidateStatus
        ? prior.currentParserCandidateStatus : null,
      decisiveCandidate: prior.decisiveCandidate || next.decisiveCandidate,
      siblingIds: unionIds(prior.siblingIds, next.siblingIds),
      authoritativeSiblingIds: unionIds(prior.authoritativeSiblingIds, next.authoritativeSiblingIds),
      modernAttemptIds: unionIds(prior.modernAttemptIds, next.modernAttemptIds),
      acceptedRatingAdjudicationIds: unionIds(prior.acceptedRatingAdjudicationIds, next.acceptedRatingAdjudicationIds),
      adjudicationIds: unionIds(prior.adjudicationIds, next.adjudicationIds),
      effectiveLedger: prior.effectiveLedger || next.effectiveLedger,
      disconnected: prior.disconnected || next.disconnected, review: prior.review || next.review,
      staleParserEvidence: prior.staleParserEvidence || next.staleParserEvidence,
      supersededEvidence: prior.supersededEvidence || next.supersededEvidence,
      acceptedRatingAuthority: prior.acceptedRatingAuthority || next.acceptedRatingAuthority,
      ratingDiagnosticsPresent: prior.ratingDiagnosticsPresent || next.ratingDiagnosticsPresent,
      publicProjectionPresent: prior.publicProjectionPresent || next.publicProjectionPresent,
      rawWinnerFlagsPresent: prior.rawWinnerFlagsPresent || next.rawWinnerFlagsPresent,
    });
    merged.conflictingInventoryRows = true;
    merged.rawReasons = [...new Set([...prior.rawReasons, ...next.rawReasons])].sort();
    merged.missingParseReason = prior.missingParseReason || next.missingParseReason;
    casesById.set(next.gameStatsId, merged);
  }
  const cases = [...casesById.values()].sort((a, b) => a.gameStatsId - b.gameStatsId);
  const unresolved = cases.filter((value) => !value.resultResolved);
  const primaryFamilyCounts: Record<string, number> = Object.create(null);
  const rawReasonCounts: Record<string, number> = Object.create(null);
  const evidenceShapeCounts: Record<string, number> = Object.create(null);
  for (const value of unresolved) {
    primaryFamilyCounts[value.primaryFamily] = (primaryFamilyCounts[value.primaryFamily] ?? 0) + 1;
    for (const reason of value.rawReasons) rawReasonCounts[reason] = (rawReasonCounts[reason] ?? 0) + 1;
    for (const [shape, present] of Object.entries(value.evidenceShape)) {
      if (present) evidenceShapeCounts[shape] = (evidenceShapeCounts[shape] ?? 0) + 1;
    }
  }
  const sortedCounts = (counts: Record<string, number>) => Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0),
  );
  const resolvedCount = cases.length - unresolved.length;
  return {
    schema: "aoe2war-replay-recovery-census/v2",
    grain: "final_game_stats_row",
    totalFinalBattles: cases.length, resolvedCount, unresolvedCount: unresolved.length,
    resolvedPercentage: cases.length ? resolvedCount * 100 / cases.length : 0,
    duplicateInputCount,
    primaryFamilyCounts: sortedCounts(primaryFamilyCounts), rawReasonCounts: sortedCounts(rawReasonCounts),
    missingParseReasonCount: unresolved.filter((value) => value.missingParseReason).length,
    evidenceShapeCounts: sortedCounts(evidenceShapeCounts),
    safeYieldByFamily: Object.fromEntries(Object.keys(primaryFamilyCounts).sort().map((family) => [family, 0])),
    safeYield: 0, requiresIndependentRevalidation: true,
    authorityGranted: false, bettingAuthority: false, settlementAuthority: false, woloAuthority: false,
    cases,
  };
}
