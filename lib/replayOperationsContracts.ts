export const REPLAY_CANDIDATE_PLAN_COHORTS = [
  "missing_current_pass",
  "failed_current_pass",
] as const;

export type ReplayCandidatePlanCohort =
  (typeof REPLAY_CANDIDATE_PLAN_COHORTS)[number];

export const REPLAY_OPERATIONS_DEFAULT_PLAN_LIMIT = 25;
export const REPLAY_OPERATIONS_MAX_PLAN_LIMIT = 100;
export const REPLAY_OPERATIONS_DEFAULT_REVIEW_LIMIT = 20;
export const REPLAY_OPERATIONS_MAX_REVIEW_LIMIT = 100;
export const REPLAY_OPERATIONS_DEFAULT_RECEIPT_LIMIT = 12;
export const REPLAY_OPERATIONS_MAX_RECEIPT_LIMIT = 50;
export const REPLAY_OPERATIONS_MAX_EXECUTION_GAMES = 1;
export const REPLAY_REVIEW_QUEUE_SOURCE_LIMIT = 1_000;
export const REPLAY_OPERATIONS_EXECUTION_CONFIRMATION =
  "RUN CANDIDATE PARSER";

export type ReplayOperationsSafety = {
  mode: "read_only" | "dry_run";
  writesPerformed: false;
  candidateOnly: true;
  affectsPublicAggregates: false;
  affectsResults: false;
  affectsBets: false;
  affectsChain: false;
};

export const REPLAY_OPERATIONS_READ_ONLY_SAFETY: ReplayOperationsSafety = {
  mode: "read_only",
  writesPerformed: false,
  candidateOnly: true,
  affectsPublicAggregates: false,
  affectsResults: false,
  affectsBets: false,
  affectsChain: false,
};

export const REPLAY_OPERATIONS_DRY_RUN_SAFETY: ReplayOperationsSafety = {
  ...REPLAY_OPERATIONS_READ_ONLY_SAFETY,
  mode: "dry_run",
};

export class ReplayOperationsContractError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ReplayOperationsContractError";
    this.status = status;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function boundedInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  field: string
) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ReplayOperationsContractError(
      `${field} must be an integer between 1 and ${maximum}.`
    );
  }
  return parsed;
}

export function parseReplayCandidatePlanRequest(value: unknown): {
  cohort: ReplayCandidatePlanCohort;
  limit: number;
  dryRun: true;
} {
  const record = asRecord(value);
  if (record.dryRun !== true) {
    throw new ReplayOperationsContractError(
      "Candidate planning is dry-run only. Send dryRun: true."
    );
  }
  const cohort =
    typeof record.cohort === "string" ? record.cohort.trim() : "";
  if (
    !REPLAY_CANDIDATE_PLAN_COHORTS.includes(
      cohort as ReplayCandidatePlanCohort
    )
  ) {
    throw new ReplayOperationsContractError(
      `cohort must be one of: ${REPLAY_CANDIDATE_PLAN_COHORTS.join(", ")}.`
    );
  }
  return {
    cohort: cohort as ReplayCandidatePlanCohort,
    limit: boundedInteger(
      record.limit,
      REPLAY_OPERATIONS_DEFAULT_PLAN_LIMIT,
      REPLAY_OPERATIONS_MAX_PLAN_LIMIT,
      "limit"
    ),
    dryRun: true,
  };
}

export function parseReplayCandidateExecutionRequest(value: unknown): {
  gameStatsIds: number[];
  cohort: ReplayCandidatePlanCohort;
  limit: number;
  expectedPlanFingerprint: string;
  candidateOnly: true;
  confirmation: typeof REPLAY_OPERATIONS_EXECUTION_CONFIRMATION;
} {
  const record = asRecord(value);
  if (record.candidateOnly !== true) {
    throw new ReplayOperationsContractError(
      "Candidate execution requires candidateOnly: true."
    );
  }
  if (record.confirmation !== REPLAY_OPERATIONS_EXECUTION_CONFIRMATION) {
    throw new ReplayOperationsContractError(
      `confirmation must equal ${REPLAY_OPERATIONS_EXECUTION_CONFIRMATION}.`
    );
  }
  const cohort =
    typeof record.cohort === "string" ? record.cohort.trim() : "";
  if (
    !REPLAY_CANDIDATE_PLAN_COHORTS.includes(
      cohort as ReplayCandidatePlanCohort
    )
  ) {
    throw new ReplayOperationsContractError(
      `cohort must be one of: ${REPLAY_CANDIDATE_PLAN_COHORTS.join(", ")}.`
    );
  }
  const limit = boundedInteger(
    record.limit,
    REPLAY_OPERATIONS_DEFAULT_PLAN_LIMIT,
    REPLAY_OPERATIONS_MAX_PLAN_LIMIT,
    "limit"
  );
  const expectedPlanFingerprint =
    typeof record.expectedPlanFingerprint === "string"
      ? record.expectedPlanFingerprint.trim().toLowerCase()
      : "";
  if (!/^[a-f0-9]{64}$/.test(expectedPlanFingerprint)) {
    throw new ReplayOperationsContractError(
      "expectedPlanFingerprint must be the complete 64-character fingerprint from the reviewed plan."
    );
  }
  if (!Array.isArray(record.gameStatsIds)) {
    throw new ReplayOperationsContractError(
      "gameStatsIds must be an array of replay game ids."
    );
  }

  const gameStatsIds = [
    ...new Set(
      record.gameStatsIds.map((value) =>
        typeof value === "number"
          ? value
          : typeof value === "string" && /^\d+$/.test(value.trim())
            ? Number(value)
            : Number.NaN
      )
    ),
  ];
  if (
    gameStatsIds.length < 1 ||
    gameStatsIds.length > REPLAY_OPERATIONS_MAX_EXECUTION_GAMES ||
    gameStatsIds.some(
      (value) => !Number.isSafeInteger(value) || value < 1
    )
  ) {
    throw new ReplayOperationsContractError(
      `Select between 1 and ${REPLAY_OPERATIONS_MAX_EXECUTION_GAMES} valid replay game ids.`
    );
  }

  return {
    gameStatsIds,
    cohort:
      cohort as ReplayCandidatePlanCohort,
    limit,
    expectedPlanFingerprint,
    candidateOnly: true,
    confirmation: REPLAY_OPERATIONS_EXECUTION_CONFIRMATION,
  };
}

export function replayCandidateRunSucceeded(input: {
  workerExitCode: number;
  runStatus: string | null | undefined;
}) {
  return input.workerExitCode === 0 && input.runStatus === "completed";
}

export function replayMissingCurrentCandidateRunFilter(
  currentPass: {
    parserName: string;
    parserVersion: string;
    passName: string;
    passVersion: string;
    schemaVersion: string;
  }
) {
  return {
    none: {
      ...currentPass,
      candidateOnly: true,
    },
  } as const;
}

export function replayReviewSourceCoverage(
  fetchedRowCount: number,
  rowLimit = REPLAY_REVIEW_QUEUE_SOURCE_LIMIT
) {
  const safeLimit =
    Number.isSafeInteger(rowLimit) && rowLimit > 0
      ? rowLimit
      : REPLAY_REVIEW_QUEUE_SOURCE_LIMIT;
  const safeFetched =
    Number.isSafeInteger(fetchedRowCount) && fetchedRowCount > 0
      ? fetchedRowCount
      : 0;

  return {
    rowLimit: safeLimit,
    rowsScanned: Math.min(safeFetched, safeLimit),
    hasMore: safeFetched > safeLimit,
  };
}

export function parseReplayReviewQuery(
  searchParams: URLSearchParams
): {
  limit: number;
  financialOnly: boolean;
} {
  return {
    limit: boundedInteger(
      searchParams.get("limit"),
      REPLAY_OPERATIONS_DEFAULT_REVIEW_LIMIT,
      REPLAY_OPERATIONS_MAX_REVIEW_LIMIT,
      "limit"
    ),
    financialOnly: searchParams.get("financialOnly") === "1",
  };
}

export function parseReplayReceiptQuery(searchParams: URLSearchParams): {
  limit: number;
} {
  return {
    limit: boundedInteger(
      searchParams.get("limit"),
      REPLAY_OPERATIONS_DEFAULT_RECEIPT_LIMIT,
      REPLAY_OPERATIONS_MAX_RECEIPT_LIMIT,
      "limit"
    ),
  };
}

export type ReplayOperationsInventory = {
  generatedAt: string;
  safety: ReplayOperationsSafety;
  scope: {
    source: "database_catalog";
    archiveScanIncluded: false;
    note: string;
  };
  gameVault: {
    rows: number;
    finalRows: number;
    savedCheckpointRows: number;
    parserFlaggedFinals: number;
    finalRowsWithoutCandidateRun: number;
  };
  artifactCatalog: {
    artifacts: number;
    submissions: number;
    legacyParseAttempts: number;
    catalogedLegacyAttempts: number;
    catalogCoverageBps: number;
    artifactsWithoutAnyRun: number;
    artifactsWithoutCurrentPass: number;
  };
  currentPass: {
    parserName: string;
    parserVersion: string;
    passName: string;
    passVersion: string;
    schemaVersion: string;
    runs: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  normalizedStats: {
    acceptedProjections: number;
    candidateProjections: number;
    acceptedGames: number;
    exactPlayerMetrics: number;
    exactGameMetrics: number;
    finalCoverageBps: number;
  };
  financialReview: {
    underReviewMarkets: number;
    activeWagers: number;
    activeStakeWolo: number;
  };
  nextStep: {
    label: string;
    command: string;
    note: string;
  };
};

export type ReplayCandidatePlan = {
  generatedAt: string;
  safety: ReplayOperationsSafety;
  planFingerprint: string;
  contract: {
    parserName: string;
    parserVersion: string;
    passName: string;
    passVersion: string;
    schemaVersion: string;
  };
  cohort: ReplayCandidatePlanCohort;
  limit: number;
  matchedArtifacts: number;
  returnedArtifacts: number;
  truncated: boolean;
  artifacts: Array<{
    artifactId: number;
    hashPrefix: string;
    byteSize: string;
    extension: string | null;
    latestSubmissionSource: string | null;
    linkedGameStatsId: number | null;
    linkedGameIsFinal: boolean | null;
    linkedGameWinner: string | null;
    currentPassStatus: string | null;
    currentPassFailureSignature: string | null;
  }>;
  executionBoundary: {
    label: string;
    commandTemplate: string;
    requirements: string[];
  };
};

export type ReplayCandidateExecutionReport = {
  generatedAt: string;
  parserContract: ReplayCandidatePlan["contract"];
  requestedCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  results: Array<{
    gameStatsId: number;
    ok: boolean;
    outcome: string | null;
    runId: number | null;
    runStatus: string | null;
    detail: string | null;
  }>;
  authorityBoundary: {
    candidateOnly: true;
    affectsPublicAggregates: false;
    affectsResults: false;
    affectsBets: false;
    affectsChain: false;
  };
};

export type ReplayReviewOperationsQueue = {
  generatedAt: string;
  safety: ReplayOperationsSafety;
  filters: {
    limit: number;
    financialOnly: boolean;
  };
  summary: {
    unresolvedWithoutVerdict: number;
    adjudicatedInQueue: number;
    pendingProposals: number;
    financialCases: number;
    financialExposureWolo: number;
    failedSettlementCases: number;
    queueRowsScanned: number;
    scanTruncated: boolean;
  };
  entries: Array<{
    gameStatsId: number;
    title: string;
    mapName: string;
    format: string;
    playedOn: string | null;
    unresolvedCode: string;
    unresolvedLabel: string;
    acceptedVerdict: boolean;
    pendingProposalCount: number;
    market: null | {
      id: number;
      status: string;
      settlementStatus: string | null;
      moneyState: string;
      moneyLabel: string;
      slipCount: number;
      totalStakedWolo: number;
    };
    reviewHref: string;
  }>;
};

export type ReplayJobReceipts = {
  generatedAt: string;
  safety: ReplayOperationsSafety;
  limit: number;
  receipts: Array<{
    jobId: number;
    identityPrefix: string;
    scopeKind: string;
    parserLabel: string;
    passLabel: string;
    dryRun: boolean;
    candidateOnly: boolean;
    affectsPublicAggregates: boolean;
    requestedBy: string;
    createdAt: string;
    latestEventAt: string | null;
    status: string;
    processedCount: number;
    succeededCount: number;
    failedCount: number;
    skippedCount: number;
    remainingArtifacts: number;
    progressBps: number;
    terminal: boolean;
    invariantValid: boolean;
  }>;
};
