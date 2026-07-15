import type { PrismaClient } from "@/lib/generated/prisma";

import {
  HD_REPLAY_PARSER_CONTRACT,
  REPLAY_REPROCESS_EVENT_TYPES,
  type ReplayReprocessDerivedStatus,
  type ReplayReprocessEventType,
} from "./replayEngineRoom.ts";

const COVERAGE_BUCKET_LIMIT = 120;
const COVERAGE_STATUS_ROW_LIMIT = COVERAGE_BUCKET_LIMIT * 3 + 1;
const FAILURE_SAMPLE_LIMIT = 1_000;
const FAILURE_BUCKET_LIMIT = 12;
const RECENT_JOB_LIMIT = 12;
const RECENT_GAME_LIMIT = 12;
const RECENT_RUNS_PER_GAME = 3;
const ARTIFACT_EXTENSION_LIMIT = 16;
const SUBMISSION_SOURCE_LIMIT = 16;
const UPLOADER_GAME_SAMPLE_LIMIT = 1_000;
const UPLOADER_COVERAGE_LIMIT = 12;

export type ParserLabCoverageBucket = {
  key: string;
  parserName: string;
  parserVersion: string;
  passName: string;
  passVersion: string;
  schemaVersion: string;
  total: number;
  completed: number;
  failed: number;
  skipped: number;
};

export type ParserLabFailureBucket = {
  signature: string;
  count: number;
  latestAt: string;
  latestDetail: string | null;
  parserName: string;
  parserVersion: string;
  passName: string;
  passVersion: string;
};

export type ParserLabJobState = {
  status: ReplayReprocessDerivedStatus;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  remainingArtifacts: number;
  progressBps: number;
  terminal: boolean;
  lastEventType: ReplayReprocessEventType | null;
  lastSequence: number | null;
  invariantValid: boolean;
};

export type ParserLabSnapshot = {
  generatedAt: string;
  storageReady: boolean;
  storageNotice: string;
  legacyReady: boolean;
  legacyNotice: string;
  limits: {
    coverageBuckets: number;
    failureSample: number;
    failureBuckets: number;
    recentJobs: number;
    recentGames: number;
    runsPerGame: number;
    artifactExtensions: number;
    submissionSources: number;
    uploaderGameSample: number;
    uploaderCoverage: number;
  };
  contract: typeof HD_REPLAY_PARSER_CONTRACT;
  legacy: {
    games: number;
    finalGames: number;
    parseAttempts: number;
    attemptsCataloged: number;
    catalogCoverageBps: number;
    attemptStatuses: Array<{ status: string; count: number }>;
  };
  overview: {
    artifacts: number;
    submissions: number;
    parseRuns: number;
    completedRuns: number;
    failedRuns: number;
    skippedRuns: number;
    gameLinkedRuns: number;
    observations: number;
    promotions: number;
  };
  review: {
    parserFlaggedFinals: number;
    pendingProposalRows: number;
    acceptedVerdictRows: number;
    statsAffectingRows: number;
    betsAffectingRows: number;
  };
  coverageSlices: {
    artifactExtensions: Array<{ extension: string | null; count: number }>;
    submissionSources: Array<{ source: string; count: number }>;
    uploaderPlayers: Array<{
      key: string;
      displayName: string;
      userUid: string | null;
      gameCount: number;
      parseRunCount: number;
    }>;
    uploaderGameSampleSize: number;
  };
  coverage: ParserLabCoverageBucket[];
  coverageTruncated: boolean;
  failures: ParserLabFailureBucket[];
  failureSampleSize: number;
  jobs: Array<{
    id: number;
    scopeKind: string;
    scopeSummary: string;
    parserName: string;
    parserVersion: string;
    passName: string;
    passVersion: string;
    batchSize: number;
    maxArtifacts: number;
    maxAttemptsPerArtifact: number;
    dryRun: boolean;
    candidateOnly: boolean;
    affectsPublicAggregates: boolean;
    requestedBy: string;
    createdAt: string;
    latestEventAt: string | null;
    state: ParserLabJobState;
  }>;
  recentGames: Array<{
    id: number;
    title: string;
    mapName: string | null;
    rawWinner: string | null;
    parseSource: string;
    parseReason: string;
    playedOn: string | null;
    uploader: string | null;
    latestAdjudicationStatus: string | null;
    runs: Array<{
      id: number;
      status: string;
      parserName: string;
      parserVersion: string;
      passName: string;
      passVersion: string;
      schemaVersion: string;
      observationCount: number;
      actionCount: number;
      failureSignature: string | null;
      candidateOnly: boolean;
      affectsPublicAggregates: boolean;
      completedAt: string;
    }>;
  }>;
};

type CoverageRow = {
  parserName: string;
  parserVersion: string;
  passName: string;
  passVersion: string;
  schemaVersion: string;
  status: string;
  _count: { _all: number };
};

type FailureRow = {
  failureSignature: string | null;
  failureDetail: string | null;
  parserName: string;
  parserVersion: string;
  passName: string;
  passVersion: string;
  createdAt: Date;
};

type JobEventCheckpoint = {
  sequence: number;
  eventType: string;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
};

type LinkedUploaderCoverageRow = {
  userUid: string | null;
  user: {
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
  _count: { replayParseRuns: number };
};

function safeCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

function cleanPrivateText(value: unknown, maxLength = 180) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return null;
  return cleanPrivateText((error as { code?: unknown }).code, 32);
}

function scopeSummary(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Bounded manifest";
  }

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "uploaderUid",
    "userUid",
    "gameStatsId",
    "throughArtifactId",
    "fromArtifactId",
    "order",
  ];
  const parts = preferredKeys.flatMap((key) => {
    const entry = record[key];
    if (!["string", "number", "boolean"].includes(typeof entry)) return [];
    return [`${key}: ${String(entry)}`];
  });

  return parts.length ? parts.slice(0, 3).join(" · ") : "Bounded manifest";
}

function mapLabel(value: unknown) {
  if (typeof value === "string") return cleanPrivateText(value, 100);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return cleanPrivateText(
    record.name ?? record.mapName ?? record.map_name ?? record.label,
    100
  );
}

function playerNames(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  return source.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const name = cleanPrivateText(record.name ?? record.player ?? record.playerName, 100);
    return name ? [name] : [];
  });
}

function gameTitle(players: unknown, originalFilename: string | null, replayFile: string) {
  const names = playerNames(players);
  if (names.length === 2) return `${names[0]} vs ${names[1]}`;
  if (names.length > 2) return `${names.length}-player team game`;
  return cleanPrivateText(originalFilename ?? replayFile, 120) ?? "Replay game";
}

export function parserLabCoverageBps(cataloged: number, total: number) {
  const safeCataloged = safeCount(cataloged);
  const safeTotal = safeCount(total);
  if (safeTotal === 0) return 0;
  return Math.min(10_000, Math.round((safeCataloged / safeTotal) * 10_000));
}

export function aggregateParserCoverage(rows: CoverageRow[]) {
  const buckets = new Map<string, ParserLabCoverageBucket>();

  for (const row of rows) {
    const key = [
      row.parserName,
      row.parserVersion,
      row.passName,
      row.passVersion,
      row.schemaVersion,
    ].join("::");
    const current = buckets.get(key) ?? {
      key,
      parserName: row.parserName,
      parserVersion: row.parserVersion,
      passName: row.passName,
      passVersion: row.passVersion,
      schemaVersion: row.schemaVersion,
      total: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };
    const count = safeCount(row._count._all);
    current.total += count;
    if (row.status === "completed") current.completed += count;
    if (row.status === "failed") current.failed += count;
    if (row.status === "skipped") current.skipped += count;
    buckets.set(key, current);
  }

  return [...buckets.values()].sort(
    (left, right) => right.total - left.total || left.key.localeCompare(right.key)
  );
}

export function bucketParserFailures(
  rows: FailureRow[],
  limit = FAILURE_BUCKET_LIMIT
) {
  const buckets = new Map<string, ParserLabFailureBucket>();

  for (const row of rows) {
    const signature = cleanPrivateText(row.failureSignature, 128) ?? "missing_signature";
    const current = buckets.get(signature);
    if (current) {
      current.count += 1;
      continue;
    }
    buckets.set(signature, {
      signature,
      count: 1,
      latestAt: row.createdAt.toISOString(),
      latestDetail: cleanPrivateText(row.failureDetail, 240),
      parserName: row.parserName,
      parserVersion: row.parserVersion,
      passName: row.passName,
      passVersion: row.passVersion,
    });
  }

  return [...buckets.values()]
    .sort(
      (left, right) =>
        right.count - left.count || right.latestAt.localeCompare(left.latestAt)
    )
    .slice(0, Math.max(0, limit));
}

export function aggregateUploaderCoverage(
  rows: LinkedUploaderCoverageRow[],
  limit = UPLOADER_COVERAGE_LIMIT
): ParserLabSnapshot["coverageSlices"]["uploaderPlayers"] {
  const buckets = new Map<
    string,
    ParserLabSnapshot["coverageSlices"]["uploaderPlayers"][number]
  >();

  for (const row of rows) {
    const displayName =
      cleanPrivateText(row.user?.inGameName, 100) ??
      cleanPrivateText(row.user?.steamPersonaName, 100) ??
      cleanPrivateText(row.userUid, 100) ??
      "Unlinked GameStats uploader";
    const userUid = cleanPrivateText(row.userUid, 100);
    const key = userUid ? `uid:${userUid}` : `display:${displayName.toLowerCase()}`;
    const current = buckets.get(key) ?? {
      key,
      displayName,
      userUid,
      gameCount: 0,
      parseRunCount: 0,
    };
    current.gameCount += 1;
    current.parseRunCount += safeCount(row._count.replayParseRuns);
    buckets.set(key, current);
  }

  return [...buckets.values()]
    .sort(
      (left, right) =>
        right.parseRunCount - left.parseRunCount ||
        right.gameCount - left.gameCount ||
        left.displayName.localeCompare(right.displayName)
    )
    .slice(0, Math.max(0, limit));
}

export function deriveParserLabJobState(
  maxArtifactsValue: unknown,
  latestEvent: JobEventCheckpoint | null | undefined
): ParserLabJobState {
  const maxArtifacts = Math.max(1, safeCount(maxArtifactsValue));
  if (!latestEvent) {
    return {
      status: "created",
      processedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: 0,
      remainingArtifacts: maxArtifacts,
      progressBps: 0,
      terminal: false,
      lastEventType: null,
      lastSequence: null,
      invariantValid: true,
    };
  }

  const processedCount = safeCount(latestEvent.processedCount);
  const succeededCount = safeCount(latestEvent.succeededCount);
  const failedCount = safeCount(latestEvent.failedCount);
  const skippedCount = safeCount(latestEvent.skippedCount);
  const eventType = REPLAY_REPROCESS_EVENT_TYPES.includes(
    latestEvent.eventType as ReplayReprocessEventType
  )
    ? (latestEvent.eventType as ReplayReprocessEventType)
    : null;
  const status: ReplayReprocessDerivedStatus =
    eventType === "queued"
      ? "queued"
      : eventType === "paused"
        ? "paused"
        : eventType === "completed"
          ? "completed"
          : eventType === "failed"
            ? "failed"
            : eventType === "cancelled"
              ? "cancelled"
              : "running";
  const terminal = ["completed", "failed", "cancelled"].includes(status);
  const invariantValid =
    eventType !== null &&
    processedCount === succeededCount + failedCount + skippedCount &&
    processedCount <= maxArtifacts;

  return {
    status,
    processedCount,
    succeededCount,
    failedCount,
    skippedCount,
    remainingArtifacts: Math.max(0, maxArtifacts - processedCount),
    progressBps: Math.min(10_000, Math.round((processedCount / maxArtifacts) * 10_000)),
    terminal,
    lastEventType: eventType,
    lastSequence: safeCount(latestEvent.sequence),
    invariantValid,
  };
}

function emptyOverview(): ParserLabSnapshot["overview"] {
  return {
    artifacts: 0,
    submissions: 0,
    parseRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    skippedRuns: 0,
    gameLinkedRuns: 0,
    observations: 0,
    promotions: 0,
  };
}

function emptyReview(): ParserLabSnapshot["review"] {
  return {
    parserFlaggedFinals: 0,
    pendingProposalRows: 0,
    acceptedVerdictRows: 0,
    statsAffectingRows: 0,
    betsAffectingRows: 0,
  };
}

async function loadLegacyBaseline(prisma: PrismaClient) {
  const [games, finalGames, parseAttempts, attemptStatuses] = await Promise.all([
    prisma.gameStats.count(),
    prisma.gameStats.count({ where: { is_final: true } }),
    prisma.replayParseAttempt.count(),
    prisma.replayParseAttempt.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
      take: 100,
    }),
  ]);

  return {
    games,
    finalGames,
    parseAttempts,
    attemptStatuses: attemptStatuses.map((entry) => ({
      status: entry.status,
      count: entry._count._all,
    })),
  };
}

async function loadEngineRoom(prisma: PrismaClient) {
  const [
    artifacts,
    submissions,
    parseRunStatuses,
    gameLinkedRuns,
    observations,
    promotions,
    catalogedAttempts,
    coverageRows,
    failedRuns,
    jobs,
    recentGames,
    parserFlaggedFinals,
    reviewRows,
    artifactExtensionRows,
    submissionSourceRows,
    uploaderCoverageRows,
  ] = await Promise.all([
    prisma.replayArtifact.count(),
    prisma.replaySubmission.count(),
    prisma.replayParseRun.groupBy({
      by: ["status"],
      _count: { _all: true },
      orderBy: { status: "asc" },
    }),
    prisma.replayParseRun.count({ where: { gameStatsId: { not: null } } }),
    prisma.replayObservation.count(),
    prisma.replayObservationPromotion.count(),
    prisma.replaySubmission.count({ where: { legacyParseAttemptId: { not: null } } }),
    prisma.replayParseRun.groupBy({
      by: [
        "parserName",
        "parserVersion",
        "passName",
        "passVersion",
        "schemaVersion",
        "status",
      ],
      _count: { _all: true },
      orderBy: [
        { parserName: "asc" },
        { parserVersion: "asc" },
        { passName: "asc" },
        { passVersion: "asc" },
        { schemaVersion: "asc" },
        { status: "asc" },
      ],
      take: COVERAGE_STATUS_ROW_LIMIT,
    }),
    prisma.replayParseRun.findMany({
      where: { status: "failed" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: FAILURE_SAMPLE_LIMIT,
      select: {
        failureSignature: true,
        failureDetail: true,
        parserName: true,
        parserVersion: true,
        passName: true,
        passVersion: true,
        createdAt: true,
      },
    }),
    prisma.replayReprocessJob.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_JOB_LIMIT,
      select: {
        id: true,
        scopeKind: true,
        scope: true,
        parserName: true,
        parserVersion: true,
        passName: true,
        passVersion: true,
        batchSize: true,
        maxArtifacts: true,
        maxAttemptsPerArtifact: true,
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
    }),
    prisma.gameStats.findMany({
      where: { replayParseRuns: { some: {} } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: RECENT_GAME_LIMIT,
      select: {
        id: true,
        replay_file: true,
        original_filename: true,
        map: true,
        winner: true,
        players: true,
        parse_source: true,
        parse_reason: true,
        played_on: true,
        timestamp: true,
        userUid: true,
        user: {
          select: {
            inGameName: true,
            steamPersonaName: true,
          },
        },
        replayResultAdjudications: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { decisionStatus: true },
        },
        replayParseRuns: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: RECENT_RUNS_PER_GAME,
          select: {
            id: true,
            status: true,
            parserName: true,
            parserVersion: true,
            passName: true,
            passVersion: true,
            schemaVersion: true,
            observationCount: true,
            actionCount: true,
            failureSignature: true,
            candidateOnly: true,
            affectsPublicAggregates: true,
            completedAt: true,
          },
        },
      },
    }),
    prisma.gameStats.count({
      where: {
        is_final: true,
        OR: [
          { winner: null },
          { winner: { in: ["", "Unknown", "UNKNOWN", "unknown", "N/A", "na"] } },
          { parse_reason: { startsWith: "watcher_inferred_" } },
          {
            parse_reason: {
              in: ["watcher_final_unparsed", "hd_final_parse_match_fallback"],
            },
          },
        ],
      },
    }),
    prisma.replayResultAdjudication.groupBy({
      by: ["decisionStatus", "affectsStats", "affectsBets"],
      _count: { _all: true },
      orderBy: [
        { decisionStatus: "asc" },
        { affectsStats: "asc" },
        { affectsBets: "asc" },
      ],
      take: 100,
    }),
    prisma.replayArtifact.groupBy({
      by: ["originalExtension"],
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: ARTIFACT_EXTENSION_LIMIT,
    }),
    prisma.replaySubmission.groupBy({
      by: ["source"],
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: SUBMISSION_SOURCE_LIMIT,
    }),
    prisma.gameStats.findMany({
      where: { replayParseRuns: { some: {} } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: UPLOADER_GAME_SAMPLE_LIMIT,
      select: {
        userUid: true,
        user: {
          select: {
            inGameName: true,
            steamPersonaName: true,
          },
        },
        _count: { select: { replayParseRuns: true } },
      },
    }),
  ]);

  const statusCounts = new Map(
    parseRunStatuses.map((entry) => [entry.status, entry._count._all])
  );
  const parseRuns = [...statusCounts.values()].reduce((sum, count) => sum + count, 0);
  const review = reviewRows.reduce(
    (summary, entry) => {
      const count = entry._count._all;
      if (entry.decisionStatus === "pending_admin_approval") {
        summary.pendingProposalRows += count;
      }
      if (entry.decisionStatus === "accepted") summary.acceptedVerdictRows += count;
      if (entry.affectsStats) summary.statsAffectingRows += count;
      if (entry.affectsBets) summary.betsAffectingRows += count;
      return summary;
    },
    { ...emptyReview(), parserFlaggedFinals }
  );
  const aggregatedCoverage = aggregateParserCoverage(coverageRows as CoverageRow[]);
  const coverageTruncated =
    coverageRows.length === COVERAGE_STATUS_ROW_LIMIT ||
    aggregatedCoverage.length > COVERAGE_BUCKET_LIMIT;

  return {
    catalogedAttempts,
    overview: {
      artifacts,
      submissions,
      parseRuns,
      completedRuns: statusCounts.get("completed") ?? 0,
      failedRuns: statusCounts.get("failed") ?? 0,
      skippedRuns: statusCounts.get("skipped") ?? 0,
      gameLinkedRuns,
      observations,
      promotions,
    },
    review,
    coverage: aggregatedCoverage.slice(0, COVERAGE_BUCKET_LIMIT),
    coverageTruncated,
    coverageSlices: {
      artifactExtensions: artifactExtensionRows.map((entry) => ({
        extension: cleanPrivateText(entry.originalExtension, 32),
        count: entry._count._all,
      })),
      submissionSources: submissionSourceRows.map((entry) => ({
        source: entry.source,
        count: entry._count._all,
      })),
      uploaderPlayers: aggregateUploaderCoverage(
        uploaderCoverageRows as LinkedUploaderCoverageRow[]
      ),
      uploaderGameSampleSize: uploaderCoverageRows.length,
    },
    failures: bucketParserFailures(failedRuns as FailureRow[]),
    failureSampleSize: failedRuns.length,
    jobs: jobs.map((job) => {
      const latestEvent = job.events[0] ?? null;
      const requester =
        cleanPrivateText(job.requestedBy?.inGameName, 100) ??
        cleanPrivateText(job.requestedBy?.steamPersonaName, 100) ??
        cleanPrivateText(job.requestedBy?.uid, 100) ??
        "System";
      return {
        id: job.id,
        scopeKind: job.scopeKind,
        scopeSummary: scopeSummary(job.scope),
        parserName: job.parserName,
        parserVersion: job.parserVersion,
        passName: job.passName,
        passVersion: job.passVersion,
        batchSize: job.batchSize,
        maxArtifacts: job.maxArtifacts,
        maxAttemptsPerArtifact: job.maxAttemptsPerArtifact,
        dryRun: job.dryRun,
        candidateOnly: job.candidateOnly,
        affectsPublicAggregates: job.affectsPublicAggregates,
        requestedBy: requester,
        createdAt: job.createdAt.toISOString(),
        latestEventAt: latestEvent?.createdAt.toISOString() ?? null,
        state: deriveParserLabJobState(job.maxArtifacts, latestEvent),
      };
    }),
    recentGames: recentGames.map((game) => ({
      id: game.id,
      title: gameTitle(game.players, game.original_filename, game.replay_file),
      mapName: mapLabel(game.map),
      rawWinner: cleanPrivateText(game.winner, 100),
      parseSource: game.parse_source,
      parseReason: game.parse_reason,
      playedOn: (game.played_on ?? game.timestamp)?.toISOString() ?? null,
      uploader:
        cleanPrivateText(game.user?.inGameName, 100) ??
        cleanPrivateText(game.user?.steamPersonaName, 100) ??
        cleanPrivateText(game.userUid, 100),
      latestAdjudicationStatus:
        cleanPrivateText(game.replayResultAdjudications[0]?.decisionStatus, 32) ?? null,
      runs: game.replayParseRuns.map((run) => ({
        id: run.id,
        status: run.status,
        parserName: run.parserName,
        parserVersion: run.parserVersion,
        passName: run.passName,
        passVersion: run.passVersion,
        schemaVersion: run.schemaVersion,
        observationCount: run.observationCount,
        actionCount: run.actionCount,
        failureSignature: cleanPrivateText(run.failureSignature, 128),
        candidateOnly: run.candidateOnly,
        affectsPublicAggregates: run.affectsPublicAggregates,
        completedAt: run.completedAt.toISOString(),
      })),
    })),
  };
}

export async function loadAdminParserLab(
  prisma: PrismaClient
): Promise<ParserLabSnapshot> {
  const generatedAt = new Date().toISOString();
  let legacy = {
    games: 0,
    finalGames: 0,
    parseAttempts: 0,
    attemptStatuses: [] as Array<{ status: string; count: number }>,
  };
  let legacyReady = true;
  let legacyNotice = "Current game_stats and replay_parse_attempts baseline loaded.";

  try {
    legacy = await loadLegacyBaseline(prisma);
  } catch (error) {
    legacyReady = false;
    const code = errorCode(error);
    legacyNotice = `Legacy vault telemetry could not be loaded${code ? ` (${code})` : ""}.`;
    console.error("[admin-parser-lab] legacy telemetry failed", error);
  }

  try {
    const engine = await loadEngineRoom(prisma);
    return {
      generatedAt,
      storageReady: true,
      storageNotice:
        "Private candidate ledger online. Parse runs, observations, promotions, and job checkpoints shown here do not change public aggregates.",
      legacyReady,
      legacyNotice,
      limits: {
        coverageBuckets: COVERAGE_BUCKET_LIMIT,
        failureSample: FAILURE_SAMPLE_LIMIT,
        failureBuckets: FAILURE_BUCKET_LIMIT,
        recentJobs: RECENT_JOB_LIMIT,
        recentGames: RECENT_GAME_LIMIT,
        runsPerGame: RECENT_RUNS_PER_GAME,
        artifactExtensions: ARTIFACT_EXTENSION_LIMIT,
        submissionSources: SUBMISSION_SOURCE_LIMIT,
        uploaderGameSample: UPLOADER_GAME_SAMPLE_LIMIT,
        uploaderCoverage: UPLOADER_COVERAGE_LIMIT,
      },
      contract: HD_REPLAY_PARSER_CONTRACT,
      legacy: {
        ...legacy,
        attemptsCataloged: engine.catalogedAttempts,
        catalogCoverageBps: parserLabCoverageBps(
          engine.catalogedAttempts,
          legacy.parseAttempts
        ),
      },
      overview: engine.overview,
      review: engine.review,
      coverageSlices: engine.coverageSlices,
      coverage: engine.coverage,
      coverageTruncated: engine.coverageTruncated,
      failures: engine.failures,
      failureSampleSize: engine.failureSampleSize,
      jobs: engine.jobs,
      recentGames: engine.recentGames,
    };
  } catch (error) {
    const code = errorCode(error);
    console.error("[admin-parser-lab] Engine Room telemetry failed", error);
    return {
      generatedAt,
      storageReady: false,
      storageNotice: `Engine Room storage is not readable on this database${
        code ? ` (${code})` : ""
      }. Apply or verify the additive foundation migration before scheduling passes.`,
      legacyReady,
      legacyNotice,
      limits: {
        coverageBuckets: COVERAGE_BUCKET_LIMIT,
        failureSample: FAILURE_SAMPLE_LIMIT,
        failureBuckets: FAILURE_BUCKET_LIMIT,
        recentJobs: RECENT_JOB_LIMIT,
        recentGames: RECENT_GAME_LIMIT,
        runsPerGame: RECENT_RUNS_PER_GAME,
        artifactExtensions: ARTIFACT_EXTENSION_LIMIT,
        submissionSources: SUBMISSION_SOURCE_LIMIT,
        uploaderGameSample: UPLOADER_GAME_SAMPLE_LIMIT,
        uploaderCoverage: UPLOADER_COVERAGE_LIMIT,
      },
      contract: HD_REPLAY_PARSER_CONTRACT,
      legacy: {
        ...legacy,
        attemptsCataloged: 0,
        catalogCoverageBps: 0,
      },
      overview: emptyOverview(),
      review: emptyReview(),
      coverageSlices: {
        artifactExtensions: [],
        submissionSources: [],
        uploaderPlayers: [],
        uploaderGameSampleSize: 0,
      },
      coverage: [],
      coverageTruncated: false,
      failures: [],
      failureSampleSize: 0,
      jobs: [],
      recentGames: [],
    };
  }
}
