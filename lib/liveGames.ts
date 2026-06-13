import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { type ScheduledMatchTile, loadScheduledMatchTilesForLiveBoard } from "@/lib/challenges";
import { getFeaturedTournament } from "@/lib/communityStore";
import { type PrismaClient } from "@/lib/generated/prisma";
import { type LobbyMatchRow, type LobbyTournamentMatch } from "@/lib/lobby";
import {
  type LiveGameSession,
  loadLiveSessionSnapshot,
  normalizeSessionKey,
} from "@/lib/liveSessionSnapshot";
import { toWatchStreamPayload, type WatchStreamPayload } from "@/lib/watchStreams";

type StreamedLiveGameSession = LiveGameSession & {
  streams: WatchStreamPayload[];
  primaryStream: WatchStreamPayload | null;
};

const BROWSER_STREAM_STALE_MS = 120_000;
const BROWSER_STREAM_ARCHIVE_MS = 6 * 60 * 60 * 1000;
const EXTERNAL_STREAM_STALE_MS = 20 * 60 * 1000;

export type LiveGamesSummary = {
  liveCount: number;
  readyCount: number;
  onDeckCount: number;
  updatedAt: string;
};

export type LiveGamesSnapshot = LiveGamesSummary & {
  tournament: {
    title: string;
    slug: string;
    format: string;
    status: string;
  } | null;
  activeSessions: StreamedLiveGameSession[];
  recentlyCompletedSessions: StreamedLiveGameSession[];
  liveMatches: LobbyTournamentMatch[];
  readyMatches: LobbyTournamentMatch[];
  scheduledMatches: ScheduledMatchTile[];
  recentMatches: LobbyMatchRow[];
};

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 24) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for live games:", error);
    return [];
  }
}

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const [tournament, recentMatches, sessionSnapshot] = await Promise.all([
    getFeaturedTournament(prisma),
    loadRecentMatches(),
    loadLiveSessionSnapshot(prisma),
  ]);

  const { activeSessions, recentlyCompletedSessions } = sessionSnapshot;
  let scheduledMatches: ScheduledMatchTile[] = [];
  let matchedActiveSessionKeys = new Set<string>();
  let matchedCompletedSessionKeys = new Set<string>();

  try {
    const scheduledSnapshot = await loadScheduledMatchTilesForLiveBoard(
      prisma,
      activeSessions,
      recentlyCompletedSessions
    );
    scheduledMatches = scheduledSnapshot.tiles;
    matchedActiveSessionKeys = scheduledSnapshot.matchedActiveSessionKeys;
    matchedCompletedSessionKeys = scheduledSnapshot.matchedCompletedSessionKeys;
  } catch (error) {
    console.warn("Failed to load scheduled matches for live games:", error);
  }

  const filteredActiveSessions = activeSessions.filter(
    (session) => !matchedActiveSessionKeys.has(session.sessionKey)
  );
  const filteredCompletedSessions = recentlyCompletedSessions.filter(
    (session) => !matchedCompletedSessionKeys.has(session.sessionKey)
  );

  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");
  const recentlyCompletedKeys = new Set([
    ...filteredCompletedSessions.map((session) => session.sessionKey),
    ...matchedCompletedSessionKeys,
  ]);
  const filteredRecentMatches = recentMatches
    .filter((match) => !recentlyCompletedKeys.has(normalizeSessionKey(match)))
    .slice(0, 12);

  const sessionKeys = [
    ...filteredActiveSessions.map((session) => session.sessionKey),
    ...filteredCompletedSessions.map((session) => session.sessionKey),
  ];
  const streamsBySession = await loadStreamsBySession(prisma, sessionKeys);
  const streamedActiveSessions = attachStreams(filteredActiveSessions, streamsBySession);
  const streamedCompletedSessions = attachStreams(filteredCompletedSessions, streamsBySession);

  const scheduledLiveCount = scheduledMatches.filter((match) => match.displayState === "live").length;
  const scheduledReadyCount = scheduledMatches.filter(
    (match) =>
      [
        "accepted",
        "terms_accepted",
        "creator_funded",
        "opponent_funded",
        "funded",
        "checkin_open",
        "left_checked_in",
        "right_checked_in",
        "ready",
      ].includes(match.displayState)
  ).length;
  const scheduledOnDeckCount = scheduledMatches.filter((match) =>
    [
      "proposed",
      "pending",
      "accepted",
      "terms_accepted",
      "creator_funded",
      "opponent_funded",
      "funded",
      "checkin_open",
      "left_checked_in",
      "right_checked_in",
      "ready",
    ].includes(match.displayState)
  ).length;

  return {
    liveCount: liveMatches.length + filteredActiveSessions.length + scheduledLiveCount,
    readyCount: readyMatches.length + scheduledReadyCount,
    onDeckCount: readyMatches.length + scheduledOnDeckCount,
    updatedAt: new Date().toISOString(),
    tournament: tournament.isFallback
      ? null
      : {
          title: tournament.title,
          slug: tournament.slug,
          format: tournament.format,
          status: tournament.status,
        },
    activeSessions: streamedActiveSessions,
    recentlyCompletedSessions: streamedCompletedSessions,
    liveMatches,
    readyMatches,
    scheduledMatches,
    recentMatches: filteredRecentMatches,
  };
}

async function loadStreamsBySession(prisma: PrismaClient, sessionKeys: string[]) {
  const uniqueSessionKeys = Array.from(new Set(sessionKeys.filter(Boolean)));
  if (uniqueSessionKeys.length === 0) {
    return new Map<string, WatchStreamPayload[]>();
  }

  const rows = await prisma.gameWatchStream
    .findMany({
      where: {
        sessionKey: {
          in: uniqueSessionKeys,
        },
        status: {
          not: "removed",
        },
      },
      orderBy: [
        { isPrimary: "desc" },
        { lastHeartbeatAt: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
    })
    .catch((error) => {
      console.warn("Failed to load streams for live games:", error);
      return [];
    });

  const streamsBySession = new Map<string, WatchStreamPayload[]>();
  for (const row of rows) {
    const stream = toWatchStreamPayload(row);
    if (!isVisibleStream(stream)) {
      continue;
    }
    const bucket = streamsBySession.get(stream.sessionKey) ?? [];
    bucket.push(stream);
    streamsBySession.set(stream.sessionKey, bucket);
  }

  return streamsBySession;
}

function isVisibleStream(stream: WatchStreamPayload) {
  if (stream.sourceType !== "browser" && stream.provider !== "aoe2war") {
    if (stream.status === "removed") return false;
    if (!["starting", "live"].includes(stream.status)) return true;
    const lastSeenMs = new Date(stream.updatedAt).getTime();
    return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= EXTERNAL_STREAM_STALE_MS;
  }

  if (!["starting", "live", "ended"].includes(stream.status)) {
    return false;
  }

  const lastSeen = stream.status === "ended"
    ? stream.endedAt || stream.updatedAt
    : stream.lastHeartbeatAt || stream.updatedAt;
  const lastSeenMs = new Date(lastSeen).getTime();
  const maxAge = stream.status === "ended" ? BROWSER_STREAM_ARCHIVE_MS : BROWSER_STREAM_STALE_MS;
  return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= maxAge;
}

function attachStreams(
  sessions: LiveGameSession[],
  streamsBySession: Map<string, WatchStreamPayload[]>
): StreamedLiveGameSession[] {
  return sessions.map((session) => {
    const streams = streamsBySession.get(session.sessionKey) ?? [];
    const primaryStream =
      streams.find((stream) => stream.provider === "aoe2war" && stream.status !== "ended") ||
      streams.find((stream) => stream.provider === "aoe2war" && stream.status === "ended") ||
      streams.find((stream) => stream.isPrimary) ||
      streams[0] ||
      null;

    return {
      ...session,
      streams,
      primaryStream,
    };
  });
}
