import { createHash } from "node:crypto";

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
  reviewRouted: boolean;
};

export type ReplayPostIngestStageExecution = {
  requested: boolean;
  attempted: boolean;
  succeeded: boolean | null;
  error: string | null;
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
  financial: {
    eligibleCount: number;
    tournament: ReplayPostIngestStageExecution;
    markets: ReplayPostIngestStageExecution;
  };
};

export type ReplayPostIngestDependencies<TPrisma> = {
  reconcileTournamentMatchProofs: (prisma: TPrisma) => Promise<unknown>;
  ensureBetMarkets: (prisma: TPrisma) => Promise<unknown>;
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

  return {
    accepted: responseOk,
    finalityStatus,
    replayHash:
      payloadString(payload?.replay_hash ?? payload?.replayHash ?? payload?.hash) ||
      null,
    gameId: payloadIdentifier(payload?.game_id ?? payload?.gameId ?? payload?.id),
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

function stableReceiptIdentity(receipt: ReplayIngestReceipt, index: number) {
  if (receipt.replayHash) return `hash:${receipt.replayHash}`;
  if (receipt.gameId !== null) return `game:${receipt.gameId}`;
  return `receipt:${index}:${receipt.finalityStatus || "unknown"}`;
}

export function summarizeReplayIngestStages(
  receipts: ReplayIngestReceipt[],
  source: string
): Omit<ReplayPostIngestReport, "financial"> & {
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
  const [{ reconcileTournamentMatchProofs }, { ensureBetMarkets }] =
    await Promise.all([
      import("@/lib/tournamentProofReconciler"),
      import("@/lib/bets"),
    ]);

  return {
    reconcileTournamentMatchProofs: (prisma) =>
      reconcileTournamentMatchProofs(
        prisma as Parameters<typeof reconcileTournamentMatchProofs>[0],
        { force: true }
      ),
    ensureBetMarkets: (prisma) =>
      ensureBetMarkets(prisma as Parameters<typeof ensureBetMarkets>[0]),
  };
}

/**
 * Run the application-owned post-ingest reconciliation pass.
 *
 * The underlying tournament and market reconcilers are retry-safe/idempotent.
 * This coordinator calls each at most once per upload batch and exposes a
 * stable idempotency key so callers and operator logs can correlate retries.
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
  const resultReady = summary.result.readyCount > 0;
  const tournamentRequested = Boolean(
    resultReady ||
      (acceptedUpload && options.reconcileTournamentForAcceptedUpload)
  );
  const marketsRequested = Boolean(
    resultReady && options.reconcileMarketsForReadyResult !== false
  );
  const tournament = pendingExecution(tournamentRequested);
  const markets = pendingExecution(marketsRequested);

  if (!tournamentRequested && !marketsRequested) {
    return {
      ...summary,
      financial: {
        ...summary.financial,
        tournament,
        markets,
      },
    };
  }

  const dependencies =
    options.dependencies ||
    (await defaultReplayPostIngestDependencies<TPrisma>());

  if (tournamentRequested) {
    tournament.attempted = true;
    try {
      await dependencies.reconcileTournamentMatchProofs(options.prisma);
      tournament.succeeded = true;
    } catch (error) {
      tournament.succeeded = false;
      tournament.error = errorMessage(error);
    }
  }

  if (marketsRequested) {
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
    financial: {
      ...summary.financial,
      tournament,
      markets,
    },
  };
}
