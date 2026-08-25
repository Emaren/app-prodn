import { createHash } from "node:crypto";

import {
  extractWarGraphWatcherAttestation,
  type WarGraphWatcherAttestation,
} from "./wargraph/attestations.ts";
import type {
  WarGraphGeneratedPrismaStore,
  WarGraphReplayEvidencePersistenceResult,
} from "./wargraph/replayEvidencePersistence.ts";

type JsonRecord = Record<string, unknown>;

export type ReplayIngestReceipt = {
  accepted: boolean;
  finalityStatus: string;
  replayHash: string | null;
  gameId: string | number | null;
  duplicate: boolean;
  requestedFinal: boolean | null;
  effectiveFinal: boolean | null;
  storage: {
    archived: boolean;
    accepted: boolean;
  };
  parser: {
    completed: boolean;
    pending: boolean;
    unparsedFinal: boolean;
  };
  teams: {
    reliable: boolean | null;
    status: string | null;
  };
  result: {
    resolved: boolean;
    trusted: boolean;
    ready: boolean;
    status: string | null;
  };
  statistics: {
    complete: boolean;
    eligible: boolean;
  };
  financial: {
    eligible: boolean;
  };
  warGraph: {
    attestation: WarGraphWatcherAttestation | null;
    rejectedReason: string | null;
  };
  reviewRouted: boolean;
};

export type ReplayPostIngestStageExecution = {
  requested: boolean;
  attempted: boolean;
  succeeded: boolean | null;
  error: string | null;
};

export type ReplayPostIngestAutomationExecution =
  ReplayPostIngestStageExecution & {
    createdCount: number;
    existingCount: number;
    skippedCount: number;
  };

export type ReplayPostIngestWarGraphExecution =
  ReplayPostIngestStageExecution &
    Omit<WarGraphReplayEvidencePersistenceResult, "retryableFailure"> & {
      rejectedCount: number;
      rejectedReasons: string[];
      retryableCode: string | null;
    };

export type ReplayPostIngestReport = {
  idempotencyKey: string;
  source: string;
  receiptCount: number;
  acceptedCount: number;
  storage: {
    receivedCount: number;
    archivedCount: number;
  };
  parser: {
    completedCount: number;
    pendingCount: number;
    unparsedFinalCount: number;
  };
  teams: {
    reliableCount: number;
    reviewCount: number;
  };
  result: {
    resolvedCount: number;
    trustedCount: number;
    readyCount: number;
    reviewCount: number;
  };
  statistics: {
    completeCount: number;
    eligibleCount: number;
  };
  automatic: {
    results: ReplayPostIngestAutomationExecution;
    identities: ReplayPostIngestAutomationExecution;
  };
  warGraph: ReplayPostIngestWarGraphExecution;
  financial: {
    eligibleCount: number;
    tournament: ReplayPostIngestStageExecution;
    markets: ReplayPostIngestStageExecution;
  };
};

export function replayPostIngestReportSucceeded(
  report: Pick<
    ReplayPostIngestReport,
    "automatic" | "warGraph" | "financial"
  >
) {
  const stages = [
    report.automatic.results,
    report.automatic.identities,
    report.warGraph,
    report.financial.tournament,
    report.financial.markets,
  ];

  return stages.every(
    (stage) =>
      !stage.requested ||
      stage.succeeded === true
  );
}

export type ReplayPostIngestDependencies<TPrisma> = {
  reconcileTournamentMatchProofs: (prisma: TPrisma) => Promise<unknown>;
  ensureBetMarkets: (prisma: TPrisma) => Promise<unknown>;
  reconcileAutomaticWatcherTerminalResults?: (
    prisma: TPrisma,
    gameStatsIds: readonly (string | number | null | undefined)[]
  ) => Promise<{
    createdCount: number;
    existingCount: number;
    skippedCount: number;
  }>;
  ensureReplayIdentityProjections?: (
    prisma: TPrisma,
    gameStatsIds: readonly (string | number | null | undefined)[]
  ) => Promise<{
    createdCount: number;
    existingCount: number;
    skippedCount: number;
  }>;
  persistWarGraphReplayEvidence?: (
    prisma: TPrisma,
    attestations: readonly WarGraphWatcherAttestation[]
  ) => Promise<WarGraphReplayEvidencePersistenceResult>;
};

const TRUSTED_FINAL_STATUSES = new Set([
  "trusted_final",
  "trusted_final_duplicate",
  "trusted_final_refreshed",
  "reviewed_match_duplicate",
  "reviewed_match_refreshed",
]);

function isTruthyPayloadFlag(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function optionalPayloadFlag(value: unknown) {
  if (value === undefined || value === null) return null;
  return isTruthyPayloadFlag(value);
}

function payloadString(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function payloadIdentifier(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return payloadString(value);
}

function payloadRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

/**
 * Convert the replay API response into independent stage receipts.
 *
 * In particular, archived/parsed never imply that a result is known, and a
 * resolved result never becomes financial truth unless the backend explicitly
 * marks the final as settlement-ready.
 */
export function classifyReplayIngestReceipt(
  payload: JsonRecord | null,
  responseOk: boolean
): ReplayIngestReceipt {
  const finalityStatus = String(
    payload?.finality_status || payload?.finalityStatus || ""
  ).trim();
  const pending = isTruthyPayloadFlag(
    payload?.pending_parse ?? payload?.pendingParse
  );
  const unparsedFinal = isTruthyPayloadFlag(
    payload?.unparsed_final ?? payload?.unparsedFinal
  );
  const explicitParseCompleted =
    payload?.parse_completed ?? payload?.parseCompleted;
  const parserCompleted =
    explicitParseCompleted === undefined || explicitParseCompleted === null
      ? Boolean(finalityStatus) &&
        !pending &&
        !unparsedFinal &&
        !["live_pending_parse", "final_unparsed_proof"].includes(finalityStatus)
      : isTruthyPayloadFlag(explicitParseCompleted);
  const resultReady = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(payload?.final_accepted ?? payload?.finalAccepted) ||
        isTruthyPayloadFlag(payload?.should_settle ?? payload?.shouldSettle) ||
        TRUSTED_FINAL_STATUSES.has(finalityStatus))
  );
  const resultResolved = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(payload?.result_resolved ?? payload?.resultResolved) ||
        resultReady)
  );
  const resultTrusted = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(payload?.result_trusted ?? payload?.resultTrusted) ||
        resultReady)
  );
  const teamResolution = payloadRecord(
    payload?.team_resolution ?? payload?.teamResolution
  );
  const explicitReliableTeams = optionalPayloadFlag(
    payload?.has_reliable_teams ?? payload?.hasReliableTeams
  );
  const playerCount = Number(payload?.players_count ?? payload?.playersCount);
  const inferredReliableTeams =
    Number.isFinite(playerCount) && playerCount >= 2 && playerCount <= 2
      ? true
      : teamResolution
        ? teamResolution.status === "resolved" &&
          teamResolution.confidence === "high" &&
          Number(teamResolution.team_count ?? teamResolution.teamCount) === 2
        : null;
  const reliableTeams = explicitReliableTeams ?? inferredReliableTeams;
  const archived = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(
        payload?.raw_replay_archived ?? payload?.rawReplayArchived
      ) ||
        isTruthyPayloadFlag(
          payload?.artifact_archived ?? payload?.artifactArchived
        ))
  );
  const artifactAccepted = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(
        payload?.artifact_accepted ?? payload?.artifactAccepted
      ) ||
        archived)
  );
  const statisticsComplete = Boolean(
    responseOk &&
      isTruthyPayloadFlag(
        payload?.statistics_complete ?? payload?.statisticsComplete
      )
  );
  const statsEligible = Boolean(
    responseOk &&
      isTruthyPayloadFlag(payload?.stats_eligible ?? payload?.statsEligible)
  );
  const bettingEligible = Boolean(
    responseOk &&
      (isTruthyPayloadFlag(
        payload?.betting_eligible ?? payload?.bettingEligible
      ) ||
        resultReady)
  );
  const replayHash =
    payloadString(payload?.replay_hash ?? payload?.replayHash ?? payload?.hash) ||
    null;
  const gameId = payloadIdentifier(
    payload?.game_id ?? payload?.gameId ?? payload?.id
  );
  const warGraphParse = extractWarGraphWatcherAttestation(payload);
  const warGraphIdentityMatches = Boolean(
    warGraphParse?.ok === true &&
      replayHash &&
      /^[a-f0-9]{64}$/i.test(replayHash) &&
      replayHash.toLowerCase() === warGraphParse.value.replayHash &&
      gameId !== null &&
      String(gameId) === String(warGraphParse.value.gameStatsId)
  );

  return {
    accepted: responseOk,
    finalityStatus,
    replayHash,
    gameId,
    duplicate: finalityStatus.endsWith("_duplicate"),
    requestedFinal: optionalPayloadFlag(
      payload?.requested_final ?? payload?.requestedFinal
    ),
    effectiveFinal: optionalPayloadFlag(
      payload?.effective_is_final ??
        payload?.effectiveIsFinal ??
        payload?.is_final ??
        payload?.isFinal
    ),
    storage: {
      archived,
      accepted: artifactAccepted,
    },
    parser: {
      completed: Boolean(responseOk && parserCompleted),
      pending: Boolean(responseOk && pending),
      unparsedFinal: Boolean(responseOk && unparsedFinal),
    },
    teams: {
      reliable: responseOk ? reliableTeams : null,
      status:
        payloadString(
          payload?.team_status ??
            payload?.teamStatus ??
            teamResolution?.status
        ) || null,
    },
    result: {
      resolved: resultResolved,
      trusted: resultTrusted,
      ready: resultReady,
      status:
        payloadString(
          payload?.result_status ??
            payload?.resultStatus ??
            teamResolution?.result_status ??
            teamResolution?.resultStatus
        ) || null,
    },
    statistics: {
      complete: statisticsComplete,
      eligible: statsEligible,
    },
    financial: {
      eligible: bettingEligible,
    },
    warGraph: {
      attestation:
        warGraphParse?.ok === true && warGraphIdentityMatches
          ? warGraphParse.value
          : null,
      rejectedReason:
        warGraphParse?.ok === false
          ? warGraphParse.reason
          : warGraphParse?.ok === true && !warGraphIdentityMatches
            ? "ATTESTATION_REPLAY_RECEIPT_MISMATCH"
          : null,
    },
    reviewRouted: Boolean(responseOk && !resultReady),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function pendingExecution(requested: boolean): ReplayPostIngestStageExecution {
  return {
    requested,
    attempted: false,
    succeeded: requested ? false : null,
    error: null,
  };
}

function pendingAutomation(
  requested: boolean
): ReplayPostIngestAutomationExecution {
  return {
    ...pendingExecution(requested),
    createdCount: 0,
    existingCount: 0,
    skippedCount: 0,
  };
}

function pendingWarGraphExecution(
  receipts: ReplayIngestReceipt[]
): ReplayPostIngestWarGraphExecution {
  const rejectedReasons = [
    ...new Set(
      receipts
        .map((receipt) => receipt.warGraph.rejectedReason)
        .filter((reason): reason is string => Boolean(reason))
    ),
  ].sort((left, right) => left.localeCompare(right));
  const rejectedCount = receipts.filter(
    (receipt) => receipt.warGraph.rejectedReason !== null
  ).length;
  const receivedCount = receipts.filter(
    (receipt) => receipt.accepted && receipt.warGraph.attestation !== null
  ).length;
  const requested = receivedCount > 0 || rejectedCount > 0;

  return {
    ...pendingExecution(requested),
    receivedCount,
    createdCount: 0,
    existingCount: 0,
    failedCount: 0,
    nonqualifyingCount: 0,
    enqueuedCount: 0,
    existingJobCount: 0,
    notEnqueuedCount: 0,
    rejectedCount,
    rejectedReasons,
    retryableCode: null,
  };
}

function stableReceiptIdentity(receipt: ReplayIngestReceipt, index: number) {
  if (receipt.replayHash) return `hash:${receipt.replayHash}`;
  if (receipt.gameId !== null) return `game:${receipt.gameId}`;
  return `receipt:${index}:${receipt.finalityStatus || "unknown"}`;
}

export function summarizeReplayIngestStages(
  receipts: ReplayIngestReceipt[],
  source: string
): Omit<ReplayPostIngestReport, "financial" | "automatic" | "warGraph"> & {
  financial: Pick<ReplayPostIngestReport["financial"], "eligibleCount">;
} {
  const accepted = receipts.filter((receipt) => receipt.accepted);
  const identities = receipts
    .map(stableReceiptIdentity)
    .sort((left, right) => left.localeCompare(right));
  const identityDigest = createHash("sha256")
    .update(JSON.stringify(identities))
    .digest("hex");

  return {
    idempotencyKey: `replay-post-ingest:${source}:${identityDigest}`,
    source,
    receiptCount: receipts.length,
    acceptedCount: accepted.length,
    storage: {
      receivedCount: accepted.length,
      archivedCount: accepted.filter((receipt) => receipt.storage.archived).length,
    },
    parser: {
      completedCount: accepted.filter((receipt) => receipt.parser.completed).length,
      pendingCount: accepted.filter((receipt) => receipt.parser.pending).length,
      unparsedFinalCount: accepted.filter(
        (receipt) => receipt.parser.unparsedFinal
      ).length,
    },
    teams: {
      reliableCount: accepted.filter(
        (receipt) => receipt.teams.reliable === true
      ).length,
      reviewCount: accepted.filter(
        (receipt) => receipt.teams.reliable === false
      ).length,
    },
    result: {
      resolvedCount: accepted.filter((receipt) => receipt.result.resolved).length,
      trustedCount: accepted.filter((receipt) => receipt.result.trusted).length,
      readyCount: accepted.filter((receipt) => receipt.result.ready).length,
      reviewCount: accepted.filter((receipt) => receipt.reviewRouted).length,
    },
    statistics: {
      completeCount: accepted.filter(
        (receipt) => receipt.statistics.complete
      ).length,
      eligibleCount: accepted.filter(
        (receipt) => receipt.statistics.eligible
      ).length,
    },
    financial: {
      eligibleCount: accepted.filter(
        (receipt) => receipt.financial.eligible
      ).length,
    },
  };
}

async function defaultReplayPostIngestDependencies<TPrisma>(): Promise<
  ReplayPostIngestDependencies<TPrisma>
> {
  const [
    { reconcileTournamentMatchProofs },
    { ensureBetMarketsAfterCommit },
    { reconcileAutomaticWatcherTerminalResults },
    { ensureReplayIdentityProjections },
  ] = await Promise.all([
    import("@/lib/tournamentProofReconciler"),
    import("@/lib/bets"),
    import("@/lib/replayResultAdjudications"),
    import("@/lib/replayIdentityProjection"),
  ]);

  return {
    reconcileTournamentMatchProofs: (prisma) =>
      reconcileTournamentMatchProofs(
        prisma as Parameters<typeof reconcileTournamentMatchProofs>[0],
        { force: true }
      ),
    ensureBetMarkets: (prisma) =>
      ensureBetMarketsAfterCommit(
        prisma as Parameters<typeof ensureBetMarketsAfterCommit>[0]
      ),
    reconcileAutomaticWatcherTerminalResults: (prisma, gameStatsIds) =>
      reconcileAutomaticWatcherTerminalResults(
        prisma as Parameters<typeof reconcileAutomaticWatcherTerminalResults>[0],
        gameStatsIds
      ),
    ensureReplayIdentityProjections: (prisma, gameStatsIds) =>
      ensureReplayIdentityProjections(
        prisma as Parameters<typeof ensureReplayIdentityProjections>[0],
        gameStatsIds
      ),
  };
}

async function defaultWarGraphReplayEvidencePersistence<TPrisma>(
  prisma: TPrisma,
  attestations: readonly WarGraphWatcherAttestation[]
) {
  const { persistWarGraphReplayEvidence } = await import(
    "./wargraph/replayEvidencePersistence.ts"
  );
  return persistWarGraphReplayEvidence({
    store: prisma as unknown as WarGraphGeneratedPrismaStore,
    attestations,
  });
}

function acceptedFinalGameIds(receipts: ReplayIngestReceipt[]) {
  return [
    ...new Set(
      receipts
        .filter(
          (receipt) =>
            receipt.accepted &&
            receipt.effectiveFinal !== false &&
            receipt.gameId !== null
        )
        .map((receipt) => receipt.gameId)
    ),
  ];
}

async function executeAutomation<TPrisma>(input: {
  stage: ReplayPostIngestAutomationExecution;
  runner:
    | ReplayPostIngestDependencies<TPrisma>["reconcileAutomaticWatcherTerminalResults"]
    | ReplayPostIngestDependencies<TPrisma>["ensureReplayIdentityProjections"];
  prisma: TPrisma;
  gameStatsIds: readonly (string | number | null | undefined)[];
}) {
  if (!input.stage.requested) return;
  input.stage.attempted = true;

  if (!input.runner) {
    input.stage.succeeded = true;
    return;
  }

  try {
    const result = await input.runner(input.prisma, input.gameStatsIds);
    input.stage.createdCount = result.createdCount;
    input.stage.existingCount = result.existingCount;
    input.stage.skippedCount = result.skippedCount;
    input.stage.succeeded = true;
  } catch (error) {
    input.stage.succeeded = false;
    input.stage.error = errorMessage(error);
  }
}

async function executeWarGraphPersistence<TPrisma>(input: {
  stage: ReplayPostIngestWarGraphExecution;
  runner:
    | ReplayPostIngestDependencies<TPrisma>["persistWarGraphReplayEvidence"]
    | undefined;
  prisma: TPrisma;
  attestations: readonly WarGraphWatcherAttestation[];
}) {
  if (!input.stage.requested) return;
  input.stage.attempted = true;

  // Structurally rejected input is intentionally retained only as a bounded
  // reason code in this report. It is never written into the trusted evidence
  // table and is not retryable by itself.
  if (input.attestations.length === 0) {
    input.stage.succeeded = true;
    return;
  }

  try {
    const result = input.runner
      ? await input.runner(input.prisma, input.attestations)
      : await defaultWarGraphReplayEvidencePersistence(
          input.prisma,
          input.attestations
        );
    input.stage.receivedCount = result.receivedCount;
    input.stage.createdCount = result.createdCount;
    input.stage.existingCount = result.existingCount;
    input.stage.failedCount = result.failedCount;
    input.stage.nonqualifyingCount = result.nonqualifyingCount;
    input.stage.enqueuedCount = result.enqueuedCount;
    input.stage.existingJobCount = result.existingJobCount;
    input.stage.notEnqueuedCount = result.notEnqueuedCount;
    input.stage.retryableCode = result.retryableFailure?.code ?? null;
    input.stage.error = result.retryableFailure
      ? `${result.retryableFailure.code}: ${result.retryableFailure.message}`
      : null;
    input.stage.succeeded = result.retryableFailure === null;
  } catch (error) {
    input.stage.succeeded = false;
    input.stage.retryableCode = "WARGRAPH_EVIDENCE_STAGE_FAILED";
    input.stage.error = errorMessage(error);
  }
}

/**
 * Run the application-owned post-ingest reconciliation pass.
 *
 * Automatic result evidence and identity projection are append-only and
 * retry-safe. Financial reconciliation runs only after either the parser or
 * the exact watcher-terminal evidence policy establishes a ready result.
 */
export async function coordinateReplayPostIngest<TPrisma>(options: {
  prisma: TPrisma;
  receipts: ReplayIngestReceipt[];
  source: string;
  reconcileTournamentForAcceptedUpload?: boolean;
  reconcileMarketsForReadyResult?: boolean;
  dependencies?: ReplayPostIngestDependencies<TPrisma>;
}): Promise<ReplayPostIngestReport> {
  const summary = summarizeReplayIngestStages(options.receipts, options.source);
  const acceptedUpload = summary.acceptedCount > 0;
  const gameStatsIds = acceptedFinalGameIds(options.receipts);
  const automaticResults = pendingAutomation(gameStatsIds.length > 0);
  const automaticIdentities = pendingAutomation(gameStatsIds.length > 0);
  const warGraph = pendingWarGraphExecution(options.receipts);
  const warGraphAttestations = options.receipts
    .filter((receipt) => receipt.accepted)
    .map((receipt) => receipt.warGraph.attestation)
    .filter(
      (attestation): attestation is WarGraphWatcherAttestation =>
        attestation !== null
    );

  let dependencies = options.dependencies;

  await executeWarGraphPersistence({
    stage: warGraph,
    runner: dependencies?.persistWarGraphReplayEvidence,
    prisma: options.prisma,
    attestations: warGraphAttestations,
  });

  if (gameStatsIds.length > 0) {
    dependencies =
      dependencies ||
      (await defaultReplayPostIngestDependencies<TPrisma>());

    await executeAutomation({
      stage: automaticResults,
      runner: dependencies.reconcileAutomaticWatcherTerminalResults,
      prisma: options.prisma,
      gameStatsIds,
    });
    await executeAutomation({
      stage: automaticIdentities,
      runner: dependencies.ensureReplayIdentityProjections,
      prisma: options.prisma,
      gameStatsIds,
    });
  }

  const automaticReadyCount =
    automaticResults.createdCount + automaticResults.existingCount;
  const resultReady =
    summary.result.readyCount > 0 || automaticReadyCount > 0;
  const tournamentRequested = Boolean(
    resultReady ||
      (acceptedUpload && options.reconcileTournamentForAcceptedUpload)
  );
  const marketsRequested = Boolean(
    resultReady && options.reconcileMarketsForReadyResult !== false
  );
  const tournament = pendingExecution(tournamentRequested);
  const markets = pendingExecution(marketsRequested);

  if (tournamentRequested || marketsRequested) {
    dependencies =
      dependencies ||
      (await defaultReplayPostIngestDependencies<TPrisma>());
  }

  if (tournamentRequested && dependencies) {
    tournament.attempted = true;
    try {
      await dependencies.reconcileTournamentMatchProofs(options.prisma);
      tournament.succeeded = true;
    } catch (error) {
      tournament.succeeded = false;
      tournament.error = errorMessage(error);
    }
  }

  if (marketsRequested && dependencies) {
    markets.attempted = true;
    try {
      await dependencies.ensureBetMarkets(options.prisma);
      markets.succeeded = true;
    } catch (error) {
      markets.succeeded = false;
      markets.error = errorMessage(error);
    }
  }

  return {
    ...summary,
    result: {
      ...summary.result,
      readyCount:
        summary.result.readyCount + automaticReadyCount,
      reviewCount: Math.max(
        0,
        summary.result.reviewCount - automaticReadyCount
      ),
    },
    automatic: {
      results: automaticResults,
      identities: automaticIdentities,
    },
    warGraph,
    financial: {
      ...summary.financial,
      eligibleCount:
        summary.financial.eligibleCount + automaticReadyCount,
      tournament,
      markets,
    },
  };
}
