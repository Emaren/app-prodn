import "server-only";

import type {
  Prisma,
  PrismaClient,
} from "@/lib/generated/prisma";
import {
  deriveParserLabJobState,
  parserLabCoverageBps,
} from "@/lib/adminParserLab";
import {
  HD_REPLAY_PARSER_CONTRACT,
  replayEngineSha256,
} from "@/lib/replayEngineRoom";
import {
  loadReplayReviewQueue,
} from "@/lib/replayReviewQueue";
import {
  REPLAY_OPERATIONS_DRY_RUN_SAFETY,
  REPLAY_OPERATIONS_READ_ONLY_SAFETY,
  replayMissingCurrentCandidateRunFilter,
  type ReplayCandidatePlan,
  type ReplayCandidatePlanCohort,
  type ReplayJobReceipts,
  type ReplayOperationsInventory,
  type ReplayReviewOperationsQueue,
} from "@/lib/replayOperationsContracts";

const RAW_UNKNOWN_WINNERS = [
  "",
  "Unknown",
  "UNKNOWN",
  "unknown",
  "N/A",
  "na",
];

const CURRENT_PASS_WHERE = {
  parserName: HD_REPLAY_PARSER_CONTRACT.parserName,
  parserVersion: HD_REPLAY_PARSER_CONTRACT.parserVersion,
  passName: HD_REPLAY_PARSER_CONTRACT.passName,
  passVersion: HD_REPLAY_PARSER_CONTRACT.passVersion,
  schemaVersion: HD_REPLAY_PARSER_CONTRACT.schemaVersion,
} satisfies Prisma.ReplayParseRunWhereInput;

const PARSER_FLAGGED_FINAL_WHERE = {
  is_final: true,
  OR: [
    { winner: null },
    { winner: { in: RAW_UNKNOWN_WINNERS } },
    { parse_reason: { startsWith: "watcher_inferred_" } },
    {
      parse_reason: {
        in: [
          "watcher_final_unparsed",
          "hd_final_parse_match_fallback",
        ],
      },
    },
  ],
} satisfies Prisma.GameStatsWhereInput;

function safeCount(value: number | null | undefined) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0
    ? Number(value)
    : 0;
}

function currentPassStatusCounts(
  rows: Array<{
    status: string;
    _count: { _all: number };
  }>
) {
  const statuses = new Map(
    rows.map((row) => [row.status, safeCount(row._count._all)])
  );
  return {
    runs: [...statuses.values()].reduce((sum, count) => sum + count, 0),
    completed: statuses.get("completed") ?? 0,
    failed: statuses.get("failed") ?? 0,
    skipped: statuses.get("skipped") ?? 0,
  };
}

export async function loadReplayOperationsInventory(
  prisma: PrismaClient
): Promise<ReplayOperationsInventory> {
  const [
    gameRows,
    finalRows,
    legacyParseAttempts,
    catalogedLegacyAttempts,
    parserFlaggedFinals,
    finalRowsWithoutCandidateRun,
    artifacts,
    submissions,
    artifactsWithoutAnyRun,
    artifactsWithoutCurrentPass,
    currentPassStatuses,
    acceptedStatProjections,
    candidateStatProjections,
    acceptedStatGames,
    exactPlayerMetrics,
    exactGameMetrics,
    underReviewMarkets,
    activeWagerAggregate,
  ] = await Promise.all([
    prisma.gameStats.count(),
    prisma.gameStats.count({ where: { is_final: true } }),
    prisma.replayParseAttempt.count(),
    prisma.replaySubmission.count({
      where: { legacyParseAttemptId: { not: null } },
    }),
    prisma.gameStats.count({ where: PARSER_FLAGGED_FINAL_WHERE }),
    prisma.gameStats.count({
      where: {
        is_final: true,
        replayParseRuns:
          replayMissingCurrentCandidateRunFilter(
            CURRENT_PASS_WHERE
          ),
      },
    }),
    prisma.replayArtifact.count(),
    prisma.replaySubmission.count(),
    prisma.replayArtifact.count({
      where: { parseRuns: { none: {} } },
    }),
    prisma.replayArtifact.count({
      where: {
        parseRuns: {
          none: CURRENT_PASS_WHERE,
        },
      },
    }),
    prisma.replayParseRun.groupBy({
      by: ["status"],
      where: CURRENT_PASS_WHERE,
      _count: { _all: true },
      orderBy: { status: "asc" },
      take: 20,
    }),
    prisma.replayStatProjection.count({
      where: {
        projectionStatus: "accepted",
        affectsPublicAggregates: true,
        supersededBy: null,
      },
    }),
    prisma.replayStatProjection.count({
      where: {
        projectionStatus: "candidate",
      },
    }),
    prisma.gameStats.count({
      where: {
        replayStatProjections: {
          some: {
            projectionStatus: "accepted",
            affectsPublicAggregates: true,
            supersededBy: null,
          },
        },
      },
    }),
    prisma.replayPlayerMetric.count({
      where: {
        statEligible: true,
        exact: true,
        projection: {
          projectionStatus: "accepted",
          affectsPublicAggregates: true,
          supersededBy: null,
        },
      },
    }),
    prisma.replayGameMetric.count({
      where: {
        statEligible: true,
        exact: true,
        projection: {
          projectionStatus: "accepted",
          affectsPublicAggregates: true,
          supersededBy: null,
        },
      },
    }),
    prisma.betMarket.count({
      where: { status: "under_review" },
    }),
    prisma.betWager.aggregate({
      where: {
        status: "active",
        market: { status: "under_review" },
      },
      _count: { _all: true },
      _sum: { amountWolo: true },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    safety: REPLAY_OPERATIONS_READ_ONLY_SAFETY,
    scope: {
      source: "database_catalog",
      archiveScanIncluded: false,
      note:
        "This button reads indexed database receipts only. It does not walk or hash the mounted replay archive.",
    },
    gameVault: {
      rows: gameRows,
      finalRows,
      savedCheckpointRows: Math.max(0, gameRows - finalRows),
      parserFlaggedFinals,
      finalRowsWithoutCandidateRun,
    },
    artifactCatalog: {
      artifacts,
      submissions,
      legacyParseAttempts,
      catalogedLegacyAttempts,
      catalogCoverageBps: parserLabCoverageBps(
        catalogedLegacyAttempts,
        legacyParseAttempts
      ),
      artifactsWithoutAnyRun,
      artifactsWithoutCurrentPass,
    },
    currentPass: {
      ...HD_REPLAY_PARSER_CONTRACT,
      ...currentPassStatusCounts(currentPassStatuses),
    },
    normalizedStats: {
      acceptedProjections: acceptedStatProjections,
      candidateProjections: candidateStatProjections,
      acceptedGames: acceptedStatGames,
      exactPlayerMetrics,
      exactGameMetrics,
      finalCoverageBps: parserLabCoverageBps(
        acceptedStatGames,
        finalRows
      ),
    },
    financialReview: {
      underReviewMarkets,
      activeWagers: activeWagerAggregate._count._all,
      activeStakeWolo: activeWagerAggregate._sum.amountWolo ?? 0,
    },
    nextStep: {
      label: "Freeze a full archive manifest before a corpus job",
      command:
        "python scripts/reconcile_replay_corpus.py --snapshot-label <label>",
      note:
        "Run the reconciliation script from api-prodn on the API host. Review its archive errors and logical cohorts before passing the generated full-vault manifest to the candidate worker.",
    },
  };
}

function candidateArtifactWhere(
  cohort: ReplayCandidatePlanCohort
): Prisma.ReplayArtifactWhereInput {
  if (cohort === "failed_current_pass") {
    return {
      parseRuns: {
        some: {
          ...CURRENT_PASS_WHERE,
          status: "failed",
        },
        none: {
          ...CURRENT_PASS_WHERE,
          status: "completed",
        },
      },
    };
  }

  return {
    parseRuns: {
      none: CURRENT_PASS_WHERE,
    },
  };
}

function runMatchesCurrentContract(run: {
  parserName: string;
  parserVersion: string;
  passName: string;
  passVersion: string;
  schemaVersion: string;
}) {
  return (
    run.parserName === HD_REPLAY_PARSER_CONTRACT.parserName &&
    run.parserVersion === HD_REPLAY_PARSER_CONTRACT.parserVersion &&
    run.passName === HD_REPLAY_PARSER_CONTRACT.passName &&
    run.passVersion === HD_REPLAY_PARSER_CONTRACT.passVersion &&
    run.schemaVersion === HD_REPLAY_PARSER_CONTRACT.schemaVersion
  );
}

function cleanWinner(value: string | null) {
  const winner = value?.trim() ?? "";
  return winner && !RAW_UNKNOWN_WINNERS.includes(winner)
    ? winner
    : null;
}

export async function planReplayCandidateBatch(
  prisma: PrismaClient,
  options: {
    cohort: ReplayCandidatePlanCohort;
    limit: number;
  }
): Promise<ReplayCandidatePlan> {
  const where = candidateArtifactWhere(options.cohort);
  const [matchedArtifacts, artifacts] = await Promise.all([
    prisma.replayArtifact.count({ where }),
    prisma.replayArtifact.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: options.limit,
      select: {
        id: true,
        sha256: true,
        byteSize: true,
        originalExtension: true,
        submissions: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            source: true,
            legacyParseAttempt: {
              select: {
                gameStats: {
                  select: {
                    id: true,
                    is_final: true,
                    winner: true,
                  },
                },
              },
            },
          },
        },
        parseRuns: {
          where: {
            OR: [
              CURRENT_PASS_WHERE,
              { gameStatsId: { not: null } },
            ],
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 12,
          select: {
            parserName: true,
            parserVersion: true,
            passName: true,
            passVersion: true,
            schemaVersion: true,
            status: true,
            failureSignature: true,
            gameStats: {
              select: {
                id: true,
                is_final: true,
                winner: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const plannedArtifacts =
    artifacts.map((artifact) => {
      const currentRun =
        artifact.parseRuns.find(runMatchesCurrentContract) ?? null;
      const linkedGame =
        artifact.parseRuns.find((run) => run.gameStats)?.gameStats ??
        artifact.submissions[0]?.legacyParseAttempt?.gameStats ??
        null;
      return {
        artifactId: artifact.id,
        artifactSha256: artifact.sha256,
        hashPrefix: artifact.sha256.slice(0, 12),
        byteSize: artifact.byteSize.toString(),
        extension: artifact.originalExtension,
        latestSubmissionSource: artifact.submissions[0]?.source ?? null,
        linkedGameStatsId: linkedGame?.id ?? null,
        linkedGameIsFinal: linkedGame?.is_final ?? null,
        linkedGameWinner: cleanWinner(linkedGame?.winner ?? null),
        currentPassStatus: currentRun?.status ?? null,
        currentPassFailureSignature:
          currentRun?.failureSignature ?? null,
      };
    });

  const planFingerprint =
    replayEngineSha256({
      contract:
        HD_REPLAY_PARSER_CONTRACT,
      cohort:
        options.cohort,
      limit:
        options.limit,
      matched_artifacts:
        matchedArtifacts,
      artifacts:
        plannedArtifacts.map((artifact) => ({
          artifact_id:
            artifact.artifactId,
          artifact_sha256:
            artifact.artifactSha256,
          linked_game_stats_id:
            artifact.linkedGameStatsId,
          current_pass_status:
            artifact.currentPassStatus,
          current_pass_failure_signature:
            artifact.currentPassFailureSignature,
        })),
    });

  return {
    generatedAt: new Date().toISOString(),
    safety: REPLAY_OPERATIONS_DRY_RUN_SAFETY,
    contract: HD_REPLAY_PARSER_CONTRACT,
    planFingerprint,
    cohort: options.cohort,
    limit: options.limit,
    matchedArtifacts,
    returnedArtifacts: artifacts.length,
    truncated: matchedArtifacts > artifacts.length,
    artifacts: plannedArtifacts.map(
      ({
        artifactSha256,
        ...artifact
      }) => {
        void artifactSha256;
        return artifact;
      }
    ),
    executionBoundary: {
      label: "Plan only — no worker was scheduled",
      commandTemplate:
        "python scripts/run_replay_engine_room_job.py --manifest <frozen-manifest.csv> --archive-root <archive-root> --mode plan --dry-run --batch-size <limit>",
      requirements: [
        "Generate and inspect a frozen reconciliation manifest on the API host.",
        "Keep concurrency at exactly one and preserve the disk-reserve gates.",
        "Use candidate mode only in a separate, explicit operator step.",
        "Candidate runs cannot change public stats, results, wagers, claims, or chain balances.",
      ],
    },
  };
}

function unresolvedFinancialCase(moneyState: string) {
  return ![
    "no_market",
    "no_slips",
    "paid",
    "refund_recorded",
  ].includes(moneyState);
}

export async function loadReplayOperationsReviewQueue(
  prisma: PrismaClient,
  options: {
    limit: number;
    financialOnly: boolean;
  }
): Promise<ReplayReviewOperationsQueue> {
  const queue = await loadReplayReviewQueue(prisma);
  const financialEntries = queue.entries.filter(
    (entry) =>
      entry.market &&
      entry.market.slipCount > 0 &&
      unresolvedFinancialCase(entry.market.moneyState)
  );
  const sorted = [...queue.entries].sort((left, right) => {
    const leftExposure = left.market?.totalStakedWolo ?? 0;
    const rightExposure = right.market?.totalStakedWolo ?? 0;
    if (rightExposure !== leftExposure) return rightExposure - leftExposure;
    if (Boolean(left.adjudication) !== Boolean(right.adjudication)) {
      return left.adjudication ? 1 : -1;
    }
    const leftTime = left.playedOn ? Date.parse(left.playedOn) : 0;
    const rightTime = right.playedOn ? Date.parse(right.playedOn) : 0;
    return leftTime - rightTime || left.id - right.id;
  });
  const filtered = options.financialOnly
    ? sorted.filter((entry) =>
        financialEntries.some((financial) => financial.id === entry.id)
      )
    : sorted;

  return {
    generatedAt: new Date().toISOString(),
    safety: REPLAY_OPERATIONS_READ_ONLY_SAFETY,
    filters: options,
    summary: {
      unresolvedWithoutVerdict: queue.pendingCount,
      adjudicatedInQueue: queue.adjudicatedCount,
      pendingProposals: queue.proposalCount,
      financialCases: financialEntries.length,
      financialExposureWolo: financialEntries.reduce(
        (sum, entry) => sum + (entry.market?.totalStakedWolo ?? 0),
        0
      ),
      failedSettlementCases: financialEntries.filter((entry) =>
        ["settlement_failed", "funding_issue"].includes(
          entry.market?.moneyState ?? ""
        )
      ).length,
      queueRowsScanned: queue.sourceCoverage.rowsScanned,
      scanTruncated: queue.sourceCoverage.hasMore,
    },
    entries: filtered.slice(0, options.limit).map((entry) => ({
      gameStatsId: entry.id,
      title: entry.title,
      mapName: entry.mapName,
      format: entry.format,
      playedOn: entry.playedOn,
      unresolvedCode: entry.unresolvedResult.code,
      unresolvedLabel: entry.unresolvedResult.label,
      acceptedVerdict: Boolean(entry.adjudication),
      pendingProposalCount: entry.pendingProposalCount,
      market: entry.market
        ? {
            id: entry.market.id,
            status: entry.market.status,
            settlementStatus: entry.market.settlementStatus,
            moneyState: entry.market.moneyState,
            moneyLabel: entry.market.moneyLabel,
            slipCount: entry.market.slipCount,
            totalStakedWolo: entry.market.totalStakedWolo,
          }
        : null,
      reviewHref: `/admin/replay-review?gameId=${entry.id}#game-${entry.id}`,
    })),
  };
}

function cleanRequester(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || null;
}

export async function loadReplayJobReceipts(
  prisma: PrismaClient,
  options: {
    limit: number;
  }
): Promise<ReplayJobReceipts> {
  const jobs = await prisma.replayReprocessJob.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: options.limit,
    select: {
      id: true,
      jobIdentityHash: true,
      scopeKind: true,
      parserName: true,
      parserVersion: true,
      passName: true,
      passVersion: true,
      maxArtifacts: true,
      dryRun: true,
      candidateOnly: true,
      affectsPublicAggregates: true,
      createdAt: true,
      requestedBy: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      events: {
        orderBy: [{ sequence: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          sequence: true,
          eventType: true,
          processedCount: true,
          succeededCount: true,
          failedCount: true,
          skippedCount: true,
          createdAt: true,
        },
      },
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    safety: REPLAY_OPERATIONS_READ_ONLY_SAFETY,
    limit: options.limit,
    receipts: jobs.map((job) => {
      const latestEvent = job.events[0] ?? null;
      const state = deriveParserLabJobState(
        job.maxArtifacts,
        latestEvent
      );
      return {
        jobId: job.id,
        identityPrefix: job.jobIdentityHash.slice(0, 12),
        scopeKind: job.scopeKind,
        parserLabel: `${job.parserName} · ${job.parserVersion}`,
        passLabel: `${job.passName} · ${job.passVersion}`,
        dryRun: job.dryRun,
        candidateOnly: job.candidateOnly,
        affectsPublicAggregates: job.affectsPublicAggregates,
        requestedBy:
          cleanRequester(job.requestedBy?.inGameName) ??
          cleanRequester(job.requestedBy?.steamPersonaName) ??
          cleanRequester(job.requestedBy?.uid) ??
          "System",
        createdAt: job.createdAt.toISOString(),
        latestEventAt: latestEvent?.createdAt.toISOString() ?? null,
        status: state.status,
        processedCount: state.processedCount,
        succeededCount: state.succeededCount,
        failedCount: state.failedCount,
        skippedCount: state.skippedCount,
        remainingArtifacts: state.remainingArtifacts,
        progressBps: state.progressBps,
        terminal: state.terminal,
        invariantValid: state.invariantValid,
      };
    }),
  };
}
