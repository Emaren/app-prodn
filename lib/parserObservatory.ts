import { unstable_cache } from "next/cache";

import { displayPlayerName, parsePlayers, readMapName } from "@/lib/gameStatsView";
import { getPrisma } from "@/lib/prisma";
import { resolveReplayOwnerDisplay } from "@/lib/replayOwnerDisplay";
import {
  applyReplayAdjudicationsToGameStatsRows,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import { resolveReplayWinnerTruth } from "@/lib/unresolvedWatcherResult";

type GameRow = Awaited<ReturnType<typeof loadCorpusRows>>[number];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, fallback = "Unknown") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function teamTruth(row: GameRow) {
  const keyEvents = record(row.key_events);
  const resolution = record(keyEvents.team_resolution);
  const teams = Array.isArray(resolution.teams) ? resolution.teams : [];
  const status = text(resolution.status, "incomplete").toLowerCase();
  const confidence = text(resolution.confidence, status === "resolved" ? "high" : "low").toLowerCase();
  return {
    resolved: status === "resolved" && teams.length === 2,
    status,
    confidence,
    provenance: text(resolution.provenance, "unresolved"),
    format: text(resolution.format, "unknown"),
  };
}

function resultTruth(row: GameRow) {
  return resolveReplayWinnerTruth({
    winner: row.winner,
    players: parsePlayers(row.players),
    parseReason: row.parse_reason,
    parseSource: row.parse_source,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
  });
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) || 0) + 1);
}

function ranked(map: Map<string, number>, limit = 20) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

async function loadCorpusRows() {
  return getPrisma().gameStats.findMany({
    where: { is_final: true },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { id: "desc" }],
    select: {
      id: true,
      userUid: true,
      replay_file: true,
      original_filename: true,
      replayHash: true,
      game_type: true,
      game_version: true,
      map: true,
      winner: true,
      players: true,
      event_types: true,
      key_events: true,
      parse_source: true,
      parse_reason: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      user: {
        select: { inGameName: true, steamPersonaName: true },
      },
    },
  });
}

async function buildPublicParserObservatory() {
  const prisma = getPrisma();
  const [rawRows, allGameRows, artifacts, runStatus, parserVersions, fieldCoverage, observations, jobs, candidateFailures] = await Promise.all([
    loadCorpusRows(),
    prisma.gameStats.count(),
    prisma.replayArtifact.aggregate({ _count: { _all: true }, _sum: { byteSize: true } }),
    prisma.replayParseRun.groupBy({ by: ["status"], _count: { _all: true }, _sum: { actionCount: true } }),
    prisma.replayParseRun.groupBy({
      by: ["parserName", "parserVersion", "passName", "passVersion", "schemaVersion", "status"],
      _count: { _all: true },
      _max: { completedAt: true },
      orderBy: { _max: { completedAt: "desc" } },
      take: 16,
    }),
    prisma.replayObservation.groupBy({
      by: ["fieldPath"],
      _count: { _all: true },
      _min: { confidenceBps: true },
      _max: { confidenceBps: true },
      orderBy: { _count: { fieldPath: "desc" } },
      take: 80,
    }),
    prisma.replayObservation.count(),
    prisma.replayReprocessJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        scopeKind: true,
        maxArtifacts: true,
        parserName: true,
        parserVersion: true,
        passName: true,
        passVersion: true,
        candidateOnly: true,
        affectsPublicAggregates: true,
        createdAt: true,
        events: {
          orderBy: { sequence: "desc" },
          take: 1,
          select: {
            eventType: true,
            processedCount: true,
            succeededCount: true,
            failedCount: true,
            skippedCount: true,
            detail: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.replayParseRun.groupBy({
      by: ["failureSignature"],
      where: { status: "failed" },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _count: { failureSignature: "desc" } },
      take: 16,
    }),
  ]);

  const rows = applyReplayAdjudicationsToGameStatsRows(rawRows);
  const unknownOwner = new Map<string, number>();
  const unknownRoster = new Map<string, number>();
  const unknownFormat = new Map<string, number>();
  const unknownReason = new Map<string, number>();
  const confidence = new Map<string, number>();
  const playerNames = new Set<string>();
  const latestUnknown: Array<{
    id: number;
    players: string[];
    owner: string;
    mapName: string;
    gameType: string;
    parseReason: string;
    neededEvidence: string[];
  }> = [];
  const recentDecodes: Array<{
    id: number;
    players: string[];
    mapName: string;
    winner: string | null;
    resultConfidence: string;
    teamsResolved: boolean;
    teamConfidence: string;
    teamProvenance: string;
    parseReason: string;
    playedAt: string | null;
  }> = [];
  let resolvedResults = 0;
  let resolvedTeams = 0;
  let unresolvedResults = 0;
  let unresolvedTeams = 0;
  let reviewRequired = 0;

  for (const row of rows) {
    const players = parsePlayers(row.players);
    const names = players.map(displayPlayerName).filter(Boolean);
    names.forEach((name) => playerNames.add(name));
    const result = resultTruth(row);
    const teams = teamTruth(row);
    bump(confidence, result.confidence);
    if (result.statsEligible) resolvedResults += 1;
    else unresolvedResults += 1;
    if (teams.resolved) resolvedTeams += 1;
    else unresolvedTeams += 1;
    if (!result.statsEligible || !teams.resolved) reviewRequired += 1;

    if (recentDecodes.length < 16) {
      recentDecodes.push({
        id: row.id,
        players: names,
        mapName: readMapName(row.map),
        winner: result.winner,
        resultConfidence: result.confidence,
        teamsResolved: teams.resolved,
        teamConfidence: teams.confidence,
        teamProvenance: teams.provenance,
        parseReason: row.parse_reason,
        playedAt: (row.played_on || row.timestamp || row.createdAt)?.toISOString() ?? null,
      });
    }

    if (!result.statsEligible) {
      const owner = resolveReplayOwnerDisplay(row).ownerDisplayName || row.user?.inGameName || row.user?.steamPersonaName || "Owner not captured";
      bump(unknownOwner, owner);
      names.forEach((name) => bump(unknownRoster, name));
      bump(unknownFormat, text(row.game_type));
      bump(unknownReason, text(row.parse_reason, "unspecified"));
      if (latestUnknown.length < 24) {
        latestUnknown.push({
          id: row.id,
          players: names,
          owner,
          mapName: readMapName(row.map),
          gameType: text(row.game_type),
          parseReason: row.parse_reason,
          neededEvidence: result.neededEvidence,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    corpus: {
      logicalGames: rows.length,
      allDatabaseRows: allGameRows,
      archivedArtifacts: artifacts._count._all,
      archivedBytes: Number(artifacts._sum.byteSize || 0),
      playersRepresented: playerNames.size,
      resolvedResults,
      unresolvedResults,
      resolvedTeams,
      unresolvedTeams,
      reviewRequired,
      resultCoverageBps: rows.length ? Math.round((resolvedResults / rows.length) * 10_000) : 0,
      teamCoverageBps: rows.length ? Math.round((resolvedTeams / rows.length) * 10_000) : 0,
    },
    unknowns: {
      byOwner: ranked(unknownOwner),
      byRosterPlayer: ranked(unknownRoster),
      byGameType: ranked(unknownFormat),
      byReason: ranked(unknownReason),
      latest: latestUnknown,
    },
    confidence: ranked(confidence, 12),
    parser: {
      totalRuns: runStatus.reduce((sum, row) => sum + row._count._all, 0),
      totalActions: runStatus.reduce((sum, row) => sum + Number(row._sum.actionCount || 0), 0),
      observations,
      distinctFields: fieldCoverage.length,
      runStatus: runStatus.map((row) => ({ status: row.status, count: row._count._all })),
      versions: parserVersions.map((row) => ({
        parserName: row.parserName,
        parserVersion: row.parserVersion,
        passName: row.passName,
        passVersion: row.passVersion,
        schemaVersion: row.schemaVersion,
        status: row.status,
        count: row._count._all,
        latestAt: row._max.completedAt?.toISOString() ?? null,
      })),
      fields: fieldCoverage.map((row) => ({
        fieldPath: row.fieldPath,
        observations: row._count._all,
        minConfidenceBps: row._min.confidenceBps,
        maxConfidenceBps: row._max.confidenceBps,
      })),
      failures: candidateFailures.map((row) => ({
        signature: row.failureSignature || "missing_signature",
        count: row._count._all,
        latestAt: row._max.createdAt?.toISOString() ?? null,
      })),
      jobs: jobs.map((job) => ({
        ...job,
        createdAt: job.createdAt.toISOString(),
        latestEvent: job.events[0]
          ? { ...job.events[0], createdAt: job.events[0].createdAt.toISOString() }
          : null,
        events: undefined,
      })),
    },
    recentDecodes,
  };
}

export const loadPublicParserObservatory = unstable_cache(
  buildPublicParserObservatory,
  ["public-parser-observatory-v1"],
  { revalidate: 300, tags: ["parser-observatory"] }
);

export async function loadViewerParserVault(uid: string | null) {
  if (!uid) return null;
  const rawRows = await getPrisma().gameStats.findMany({
    where: {
      is_final: true,
      OR: [
        { userUid: uid },
        { replayParseAttempts: { some: { userUid: uid } } },
      ],
    },
    select: {
      id: true,
      userUid: true,
      replay_file: true,
      original_filename: true,
      replayHash: true,
      game_type: true,
      game_version: true,
      map: true,
      winner: true,
      players: true,
      event_types: true,
      key_events: true,
      parse_source: true,
      parse_reason: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      user: { select: { inGameName: true, steamPersonaName: true } },
    },
  });
  const rows = applyReplayAdjudicationsToGameStatsRows(rawRows);
  const resolved = rows.filter((row) => resultTruth(row).statsEligible).length;
  const teamsResolved = rows.filter((row) => teamTruth(row).resolved).length;
  return {
    total: rows.length,
    resolved,
    unknown: rows.length - resolved,
    teamsResolved,
    resultCoverageBps: rows.length ? Math.round((resolved / rows.length) * 10_000) : 0,
  };
}

export type PublicParserObservatory = Awaited<ReturnType<typeof buildPublicParserObservatory>>;
