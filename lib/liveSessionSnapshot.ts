import path from "node:path";

import type { PrismaClient } from "@/lib/generated/prisma";
import type { ReplayReviewMarketSummary } from "@/lib/replayReviewQueue";
import {
  mergeReplayPlayerIterations,
  resolveReplayTeams,
  type CanonicalReplayPlayer,
  type ReplayTeamResolution,
} from "@/lib/teamResolution";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  resolveReliableReplayWinner,
  resolveReplayWinnerTruth,
  type UnresolvedWatcherResult,
} from "@/lib/unresolvedWatcherResult";
import {
  classifyReplaySessionDisposition,
  type ReplaySessionDisposition,
} from "@/lib/replaySessionDisposition";
import {
  shouldKeepFinalProofVisible,
} from "@/lib/liveFinalProofVisibility";

export type LiveGameSession = {
  id: number;
  sessionKey: string;
  replayFile: string | null;
  replayHash: string;
  parseIteration: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  playedOn: string | null;
  mapName: string | null;
  durationSeconds: number | null;
  originalFilename: string | null;
  disconnectDetected: boolean;
  winner: string | null;
  parseReason: string | null;
  parseSource: string | null;
  unresolvedResult: UnresolvedWatcherResult | null;
  state: "live" | "completed";
  finalProofPending: boolean;
  players: CanonicalReplayPlayer[];
  teamResolution: ReplayTeamResolution;
  uploaders: Array<{
    uid: string;
    displayName: string;
    parseRows: number;
    lastSeenAt: string;
  }>;
  watcherCount: number;
  watcherIds: string[];
  watcherSessionIds: string[];
  replayFingerprints: string[];
  watcherVersions: string[];
  parseRows: number;
  coverageLevel: "unknown" | "single" | "dual" | "stacked";
  disposition: ReplaySessionDisposition;
  uploader:
    | {
        uid: string;
        displayName: string;
      }
    | null;
  reviewMarket?: ReplayReviewMarketSummary | null;
};

const LIVE_SESSION_FRESHNESS_MS = 12 * 60 * 1000;
export const LIVE_SESSION_LINGER_MS = 15 * 60 * 1000;
const RECENT_COMPLETED_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const SUPERSEDED_PARSE_REASON = "superseded_by_later_upload";
const UNPARSED_FINAL_PARSE_REASON = "watcher_final_unparsed";

type SessionRow = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  createdAt: Date;
  timestamp: Date | null;
  played_on: Date | null;
  map: unknown;
  game_duration: number | null;
  winner: string | null;
  players: unknown;
  event_types?: unknown;
  key_events?: unknown;
  disconnect_detected: boolean;
  parse_reason?: string | null;
  parse_source?: string | null;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
};

export function normalizeSessionKey(row: {
  original_filename?: string | null;
  replay_file?: string | null;
  key_events?: unknown;
}) {
  const keyEvents = readKeyEvents(row.key_events);
  const platformMatchId =
    typeof keyEvents.platform_match_id === "string" ? keyEvents.platform_match_id.trim() : "";
  if (platformMatchId) {
    return `platform:${platformMatchId}`;
  }

  const rawName = row.original_filename?.trim() || path.basename(row.replay_file || "").trim();
  return rawName || row.replay_file || "";
}

function readKeyEvents(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function isCompletedLiveCompatRow(
  row: Pick<SessionRow, "parse_source" | "parse_reason" | "key_events" | "winner">
) {
  if (row.parse_source !== "watcher_live") {
    return false;
  }

  const keyEvents = readKeyEvents(row.key_events);
  const parseReason = String(row.parse_reason || "").toLowerCase();
  const completionSource =
    typeof keyEvents.completion_source === "string"
      ? keyEvents.completion_source.trim()
      : "";

  return (
    keyEvents.completed === true ||
    Boolean(completionSource) ||
    parseReason.includes("final") ||
    parseReason.includes("resignation") ||
    Boolean(
      resolveReliableReplayWinner({
        winner: row.winner,
        parseReason: row.parse_reason,
        keyEvents: row.key_events,
      })
    )
  );
}

function parseMapName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const name = "name" in value ? value.name : null;
  return normalizePublicReplayText(name);
}

function bestKnownPlayers(rows: SessionRow[], fallback: SessionRow) {
  return mergeLiveSessionPlayerIterations([
    fallback,
    ...rows
      .filter((row) => row.id !== fallback.id)
      .sort((left, right) => left.parse_iteration - right.parse_iteration),
  ]);
}

const METADATA_ONLY_RECOVERY_REASONS = new Set([
  "hd_metadata_fragment_only_recovery",
]);

export function mergeLiveSessionPlayerIterations(
  rows: Array<
    Pick<
      SessionRow,
      "parse_reason" | "players"
    >
  >
) {
  const substantiveRows = rows.filter(
    (row) =>
      !METADATA_ONLY_RECOVERY_REASONS.has(
        String(row.parse_reason ?? "")
          .trim()
          .toLowerCase()
      )
  );

  /*
   * The first HD watcher pass can recover only a metadata fragment. It is
   * useful until a real replay iteration arrives, but its partial roster/team
   * assignment must not poison every later coherent iteration for the full
   * live-session freshness window.
   */
  const mergeRows =
    substantiveRows.length > 0
      ? substantiveRows
      : rows;

  return mergeReplayPlayerIterations(
    mergeRows.map((row) => row.players)
  );
}

function bestKnownMapName(rows: SessionRow[], fallback: SessionRow) {
  for (const row of [fallback, ...rows]) {
    const mapName = parseMapName(row.map);
    if (mapName) return mapName;
  }
  return null;
}

function bestKnownDuration(rows: SessionRow[], fallback: SessionRow) {
  let duration: number | null = null;

  for (const row of [fallback, ...rows]) {
    if (
      typeof row.game_duration === "number" &&
      Number.isFinite(row.game_duration) &&
      row.game_duration > 0
    ) {
      duration = Math.max(duration ?? 0, row.game_duration);
    }
  }

  return duration;
}

function getRowActivityTime(row: Pick<SessionRow, "timestamp" | "createdAt">) {
  return row.timestamp ?? row.createdAt;
}

function collectUploaders(rows: SessionRow[]) {
  const uploaders = new Map<
    string,
    {
      uid: string;
      displayName: string;
      parseRows: number;
      lastSeenAt: Date;
    }
  >();

  for (const row of rows) {
    if (!row.user) continue;

    const activityTime = getRowActivityTime(row);
    const existing = uploaders.get(row.user.uid);
    if (!existing) {
      uploaders.set(row.user.uid, {
        uid: row.user.uid,
        displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
        parseRows: 1,
        lastSeenAt: activityTime,
      });
      continue;
    }

    existing.parseRows += 1;
    if (activityTime > existing.lastSeenAt) {
      existing.lastSeenAt = activityTime;
    }
  }

  return Array.from(uploaders.values())
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .map((uploader) => ({
      uid: uploader.uid,
      displayName: uploader.displayName,
      parseRows: uploader.parseRows,
      lastSeenAt: uploader.lastSeenAt.toISOString(),
    }));
}

export function readWatcherUploadMetadata(keyEventsValue: unknown) {
  const keyEvents = readKeyEvents(keyEventsValue);
  const rawUpload = keyEvents.watcher_upload;
  if (!rawUpload || typeof rawUpload !== "object" || Array.isArray(rawUpload)) {
    return null;
  }

  const upload = rawUpload as Record<string, unknown>;
  const read = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  return {
    watcherId: read(upload.watcher_id),
    watcherSessionId: read(upload.watcher_session_id),
    replayFingerprint: read(upload.replay_fingerprint),
    watcherVersion: read(upload.watcher_version),
  };
}

function collectWatcherCoverage(rows: SessionRow[]) {
  const watcherIds = new Set<string>();
  const watcherSessionIds = new Set<string>();
  const replayFingerprints = new Set<string>();
  const watcherVersions = new Set<string>();

  for (const row of rows) {
    const upload = readWatcherUploadMetadata(row.key_events);
    if (!upload) continue;
    const add = (target: Set<string>, value: unknown) => {
      const normalized = typeof value === "string" ? value.trim() : "";
      if (normalized) target.add(normalized);
    };

    add(watcherIds, upload.watcherId);
    add(watcherSessionIds, upload.watcherSessionId);
    add(replayFingerprints, upload.replayFingerprint);
    add(watcherVersions, upload.watcherVersion);
  }

  return {
    watcherIds: [...watcherIds].sort(),
    watcherSessionIds: [...watcherSessionIds].sort(),
    replayFingerprints: [...replayFingerprints].sort(),
    watcherVersions: [...watcherVersions].sort(),
  };
}

function coverageLevel(watcherCount: number): LiveGameSession["coverageLevel"] {
  if (watcherCount >= 3) return "stacked";
  if (watcherCount === 2) return "dual";
  if (watcherCount === 1) return "single";
  return "unknown";
}

function buildSessionFromRow(
  row: SessionRow,
  sessionKey: string,
  state: LiveGameSession["state"],
  sourceRows: SessionRow[] = [row],
  options: {
    finalProofPending?: boolean;
  } = {}
): LiveGameSession {
  const activityTime = getRowActivityTime(row);
  const finalEvidence = state === "completed" || options.finalProofPending === true;
  const uploaders = collectUploaders(sourceRows);
  const watcherCoverage = collectWatcherCoverage(sourceRows);
  const watcherCount = Math.max(watcherCoverage.watcherIds.length, uploaders.length);
  const primaryUploader = uploaders[0] ?? null;
  const mergedPlayers = bestKnownPlayers(sourceRows, row);
  const parsedPlayers = mergedPlayers.players;
  const teamResolution = resolveReplayTeams(parsedPlayers, {
    final: finalEvidence,
    conflictReasonCodes: mergedPlayers.conflictReasonCodes,
  });
  const mapName = bestKnownMapName(sourceRows, row);
  const winnerTruth = resolveReplayWinnerTruth({
    winner: row.winner,
    players: parsedPlayers,
    parseReason: row.parse_reason,
    parseSource: row.parse_source,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
    isFinal: finalEvidence,
    disconnectDetected:
      row.disconnect_detected,
  });
  const winner = winnerTruth.winner;
  const hasExplicitWinnerFlags = parsedPlayers.some((player) => player.winner !== null);
  const players = winnerTruth.statsEligible
    ? parsedPlayers.map((player) => ({
        ...player,
        winner:
          hasExplicitWinnerFlags || teamResolution.format !== "1v1"
            ? player.winner
            : winner
              ? player.normalizedName === winner.toLowerCase()
              : player.winner,
      }))
    : parsedPlayers.map((player) => ({ ...player, winner: null }));
  const unresolvedResult = classifyUnresolvedWatcherResult({
    winner: row.winner,
    players: parsedPlayers,
    mapName,
    state: finalEvidence ? "completed" : "live",
    parseReason: row.parse_reason,
    parseSource: row.parse_source,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
    isFinal: finalEvidence,
    disconnectDetected:
      row.disconnect_detected,
    watcherCount,
  });
  const disposition = classifyReplaySessionDisposition({
    state: finalEvidence ? "completed" : "live",
    winner,
    keyEvents: row.key_events,
    eventTypes: row.event_types,
  });
  return {
    id: row.id,
    sessionKey,
    replayFile: row.replay_file ?? null,
    replayHash: row.replayHash,
    parseIteration: row.parse_iteration,
    createdAt: row.createdAt.toISOString(),
    updatedAt: activityTime.toISOString(),
    completedAt: finalEvidence ? activityTime.toISOString() : null,
    playedOn: row.played_on?.toISOString() ?? null,
    mapName,
    durationSeconds: bestKnownDuration(sourceRows, row),
    originalFilename: row.original_filename ?? null,
    disconnectDetected: row.disconnect_detected,
    winner,
    parseReason: row.parse_reason ?? null,
    parseSource: row.parse_source ?? null,
    unresolvedResult,
    state,
    finalProofPending: options.finalProofPending === true,
    players,
    teamResolution,
    uploaders,
    watcherCount,
    watcherIds: watcherCoverage.watcherIds,
    watcherSessionIds: watcherCoverage.watcherSessionIds,
    replayFingerprints: watcherCoverage.replayFingerprints,
    watcherVersions: watcherCoverage.watcherVersions,
    parseRows: sourceRows.length,
    coverageLevel: coverageLevel(watcherCount),
    disposition,
    uploader: primaryUploader
      ? {
          uid: primaryUploader.uid,
          displayName: primaryUploader.displayName,
        }
      : row.user
      ? {
          uid: row.user.uid,
          displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
        }
      : null,
  };
}

export async function loadLiveSessionSnapshot(prisma: PrismaClient): Promise<{
  activeSessions: LiveGameSession[];
  recentlyCompletedSessions: LiveGameSession[];
}> {
  const freshnessCutoff = new Date(Date.now() - LIVE_SESSION_FRESHNESS_MS);
  const lingerCutoff = Date.now() - RECENT_COMPLETED_SESSION_MS;
  const completedCompatCutoff = new Date(lingerCutoff);

  const [activeRows, finalRows, completedLiveRows] = await Promise.all([
    prisma.gameStats.findMany({
      where: {
        is_final: false,
        parse_iteration: {
          gt: 0,
        },
        OR: [
          {
            timestamp: {
              gte: freshnessCutoff,
            },
          },
          {
            createdAt: {
              gte: freshnessCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.gameStats.findMany({
      where: {
        is_final: true,
        OR: [
          {
            timestamp: {
              gte: completedCompatCutoff,
            },
          },
          {
            createdAt: {
              gte: completedCompatCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 96,
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),

    prisma.gameStats.findMany({
      where: {
        is_final: false,
        parse_source: "watcher_live",
        parse_iteration: {
          gt: 0,
        },
        OR: [
          {
            timestamp: {
              gte: completedCompatCutoff,
            },
          },
          {
            createdAt: {
              gte: completedCompatCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      take: 96,
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
  ]);

  const completedRows: SessionRow[] = [
    ...finalRows.map((row) => row as SessionRow),
    ...(completedLiveRows ?? [])
      .filter(isCompletedLiveCompatRow)
      .map((row) => row as SessionRow),
  ];

  const latestLiveBySession = new Map<string, (typeof activeRows)[number]>();
  const liveRowsBySession = new Map<string, (typeof activeRows)>();
  for (const row of activeRows) {
    const sessionKey = normalizeSessionKey(row);
    const rows = liveRowsBySession.get(sessionKey) ?? [];
    rows.push(row);
    liveRowsBySession.set(sessionKey, rows);

    const existing = latestLiveBySession.get(sessionKey);
    if (
      !existing ||
      getRowActivityTime(row).getTime() > getRowActivityTime(existing).getTime() ||
      (
        getRowActivityTime(row).getTime() === getRowActivityTime(existing).getTime() &&
        row.parse_iteration > existing.parse_iteration
      )
    ) {
      latestLiveBySession.set(sessionKey, row);
    }
  }

  const latestFinalBySession = new Map<string, SessionRow>();
  const finalRowsBySession = new Map<string, SessionRow[]>();
  for (const row of completedRows) {
    const sessionKey = normalizeSessionKey(row);
    const rows = finalRowsBySession.get(sessionKey) ?? [];
    rows.push(row);
    finalRowsBySession.set(sessionKey, rows);

    const existing = latestFinalBySession.get(sessionKey);
    if (
      !existing ||
      getRowActivityTime(row).getTime() > getRowActivityTime(existing).getTime() ||
      (
        getRowActivityTime(row).getTime() === getRowActivityTime(existing).getTime() &&
        row.parse_iteration > existing.parse_iteration
      )
    ) {
      latestFinalBySession.set(sessionKey, row);
    }
  }

  const activeSessions: LiveGameSession[] = [];
  const recentlyCompletedSessions: LiveGameSession[] = [];

  for (const [sessionKey, row] of latestLiveBySession.entries()) {
    const finalRow = latestFinalBySession.get(sessionKey);
    const liveActivityAt = getRowActivityTime(row).getTime();

    if (finalRow) {
      const finalActivityAt = getRowActivityTime(finalRow).getTime();
      if (finalActivityAt >= liveActivityAt) {
        const finalSourceRows = finalRowsBySession.get(sessionKey) ?? [finalRow];
        const combinedSourceRows = [
          ...(liveRowsBySession.get(sessionKey) ?? [row]),
          ...finalSourceRows,
        ];
        const completedSession = buildSessionFromRow(
          finalRow,
          sessionKey,
          "completed",
          combinedSourceRows
        );
        const watcherFinal = String(finalRow.parse_source ?? "")
          .trim()
          .toLowerCase()
          .startsWith("watcher_final");
        const keepFinalProofVisible =
          watcherFinal &&
          shouldKeepFinalProofVisible({
            liveActivityAtMs: liveActivityAt,
            finalActivityAtMs: finalActivityAt,
            finalDisposition: completedSession.disposition,
          });

        if (keepFinalProofVisible) {
          activeSessions.push(
            buildSessionFromRow(
              finalRow,
              sessionKey,
              "live",
              combinedSourceRows,
              {
                finalProofPending: true,
              }
            )
          );
        } else if (finalActivityAt >= lingerCutoff) {
          recentlyCompletedSessions.push(completedSession);
        }
        continue;
      }
    }

    activeSessions.push(
      buildSessionFromRow(row, sessionKey, "live", liveRowsBySession.get(sessionKey) ?? [row])
    );
  }

  for (const [sessionKey, row] of latestFinalBySession.entries()) {
    if (latestLiveBySession.has(sessionKey)) {
      continue;
    }
    if (getRowActivityTime(row).getTime() < lingerCutoff) {
      continue;
    }
    recentlyCompletedSessions.push(
      buildSessionFromRow(row, sessionKey, "completed", finalRowsBySession.get(sessionKey) ?? [row])
    );
  }

  activeSessions.sort((left, right) => {
    const leftStartedAt = new Date(left.playedOn || left.createdAt || left.updatedAt).getTime();
    const rightStartedAt = new Date(right.playedOn || right.createdAt || right.updatedAt).getTime();
    const startedDiff = rightStartedAt - leftStartedAt;
    if (startedDiff !== 0) return startedDiff;

    const leftActivityAt = new Date(left.updatedAt).getTime();
    const rightActivityAt = new Date(right.updatedAt).getTime();
    const activityDiff = rightActivityAt - leftActivityAt;
    if (activityDiff !== 0) return activityDiff;
    return left.sessionKey.localeCompare(right.sessionKey);
  });

  recentlyCompletedSessions.sort((left, right) => {
    const activityDiff =
      new Date(right.completedAt || right.createdAt).getTime() -
      new Date(left.completedAt || left.createdAt).getTime();
    if (activityDiff !== 0) return activityDiff;
    return left.sessionKey.localeCompare(right.sessionKey);
  });

  return {
    activeSessions,
    recentlyCompletedSessions,
  };
}
