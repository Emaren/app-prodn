import { type ScheduledMatchTile, loadScheduledMatchTilesForLiveBoard } from "@/lib/challenges";
import { getFeaturedTournament } from "@/lib/communityStore";
import { type PrismaClient } from "@/lib/generated/prisma";
import { type LobbyMatchRow, type LobbyTournamentMatch } from "@/lib/lobby";
import { loadPublicBattleArchivePage } from "@/lib/publicBattleArchive";
import {
  type LiveGameSession,
  liveSessionRowGroupingKey,
  loadLiveSessionSnapshot,
  normalizeSessionKey,
  strongLiveReplayAlias,
} from "@/lib/liveSessionSnapshot";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";
import {
  normalizeReplayPlayers,
  resolveReplayTeams,
} from "@/lib/teamResolution";
import {
  loadLiveBetMarketSummaryMap,
  loadReplayReviewMarketSummaryMap,
} from "@/lib/replayReviewQueue";
import { toWatchStreamPayload, type WatchStreamPayload } from "@/lib/watchStreams";
import {
  RECENT_OUTCOME_BASE_WINDOW_MS,
  compareLiveSessionOrder,
  completedSessionRecencyMs,
  isInRecentOutcomePresentationWindow,
  recentOutcomePresentationWindowMs,
} from "@/lib/liveSessionOrdering";

type StreamedLiveGameSession = LiveGameSession & {
  streams: WatchStreamPayload[];
  primaryStream: WatchStreamPayload | null;
};

const BROWSER_STREAM_STALE_MS = 120_000;
const BROWSER_STREAM_ARCHIVE_MS = 6 * 60 * 60 * 1000;
const EXTERNAL_STREAM_STALE_MS = 20 * 60 * 1000;
const LIVE_GAMES_RECENT_MATCH_LIMIT = 24;
const LIVE_GAMES_COMPLETED_SESSION_DEPTH = 8;
const LIVE_GAMES_ARCHIVE_CANDIDATE_DEPTH = 96;

// AOE2WAR_LIVE_ACTIVE_ITERATION_DEDUPE
function normalizeLiveReplayIdentityText(value: unknown) {
  return String(value ?? "")
    .split(/[\\/]/)
    .pop()
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, " ") || "";
}

function liveSessionPlayersIdentity(session: LiveGameSession) {
  return (Array.isArray(session.players) ? session.players : [])
    .map((player) => normalizeLiveReplayIdentityText((player as { name?: unknown })?.name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function liveSessionMapIdentity(session: LiveGameSession) {
  return normalizeLiveReplayIdentityText(
    (session as unknown as { mapName?: unknown }).mapName ??
      (session as unknown as { map?: { name?: unknown } }).map?.name
  );
}

function liveSessionUpdatedMs(session: LiveGameSession) {
  const candidates = [
    (session as unknown as { updatedAt?: unknown }).updatedAt,
    (session as unknown as { playedOn?: unknown }).playedOn,
    (session as unknown as { createdAt?: unknown }).createdAt,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      const ms = new Date(value).getTime();
      if (Number.isFinite(ms)) return ms;
    }

    if (value instanceof Date) {
      const ms = value.getTime();
      if (Number.isFinite(ms)) return ms;
    }
  }

  return 0;
}

function liveSessionDurationSeconds(session: LiveGameSession) {
  const value =
    (session as unknown as { durationSeconds?: unknown }).durationSeconds ??
    (session as unknown as { duration?: unknown }).duration;

  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function activeLiveIterationDedupeKey(session: LiveGameSession) {
  const canonicalSessionKey = normalizeLiveReplayIdentityText(session.sessionKey);
  if (canonicalSessionKey.startsWith("platform:")) {
    return canonicalSessionKey;
  }

  const replayFile = normalizeLiveReplayIdentityText(
    session.replayFile || session.originalFilename || session.sessionKey
  );
  const replayFingerprint = normalizeLiveReplayIdentityText(
    [...(session.replayFingerprints || [])].sort()[0]
  );
  const watcherSession =
    normalizeLiveReplayIdentityText(
      (session as unknown as { watcherSessionId?: unknown }).watcherSessionId ??
        (session as unknown as { watcher_session_id?: unknown }).watcher_session_id ??
        session.watcherSessionIds?.[0]
    );

  const players = liveSessionPlayersIdentity(session);
  const map = liveSessionMapIdentity(session);

  // A watcher session survives a growing replay's size/mtime fingerprint
  // churn. Keep it ahead of file/fingerprint fallbacks when platform truth is
  // unavailable so two simultaneous watcher processes cannot overtake or
  // collapse each other.
  if (watcherSession) {
    const stableReplay = canonicalSessionKey || replayFile;
    return stableReplay
      ? `watcher:${watcherSession}:replay:${stableReplay}:players:${players}:map:${map}`
      : `watcher:${watcherSession}`;
  }

  if (canonicalSessionKey) {
    return `session:${canonicalSessionKey}:players:${players}:map:${map}`;
  }

  if (replayFile) {
    return `file:${replayFile}:players:${players}:map:${map}`;
  }

  if (replayFingerprint) {
    return `fingerprint:${replayFingerprint}`;
  }

  return `session:${session.sessionKey || session.id}`;
}

function preferNewerLiveSession(current: LiveGameSession, candidate: LiveGameSession) {
  const currentTime = liveSessionUpdatedMs(current);
  const candidateTime = liveSessionUpdatedMs(candidate);

  if (candidateTime !== currentTime) return candidateTime > currentTime;

  const currentDuration = liveSessionDurationSeconds(current);
  const candidateDuration = liveSessionDurationSeconds(candidate);

  if (candidateDuration !== currentDuration) return candidateDuration > currentDuration;

  return Number(candidate.id || 0) > Number(current.id || 0);
}

function earlierLiveTimestamp(
  left: string | null | undefined,
  right: string | null | undefined
) {
  const candidates = [left, right]
    .filter((value): value is string => Boolean(value))
    .map((value) => ({ value, ms: new Date(value).getTime() }))
    .filter((candidate) => Number.isFinite(candidate.ms))
    .sort((a, b) => a.ms - b.ms);
  return candidates[0]?.value ?? left ?? right ?? null;
}

function mergeLiveStrings(left: string[] = [], right: string[] = []) {
  return Array.from(new Set([...left, ...right].filter(Boolean))).sort();
}

function mergeLiveUploaders(
  left: LiveGameSession["uploaders"],
  right: LiveGameSession["uploaders"]
) {
  const merged = new Map<string, LiveGameSession["uploaders"][number]>();

  for (const uploader of [...left, ...right]) {
    const existing = merged.get(uploader.uid);
    if (!existing) {
      merged.set(uploader.uid, uploader);
      continue;
    }

    merged.set(uploader.uid, {
      ...existing,
      ...uploader,
      parseRows: Math.max(existing.parseRows, uploader.parseRows),
      lastSeenAt:
        new Date(uploader.lastSeenAt).getTime() >= new Date(existing.lastSeenAt).getTime()
          ? uploader.lastSeenAt
          : existing.lastSeenAt,
    });
  }

  return [...merged.values()].sort(
    (leftUploader, rightUploader) =>
      new Date(rightUploader.lastSeenAt).getTime() -
      new Date(leftUploader.lastSeenAt).getTime()
  );
}

function mergedCoverageLevel(watcherCount: number): LiveGameSession["coverageLevel"] {
  if (watcherCount >= 3) return "stacked";
  if (watcherCount === 2) return "dual";
  if (watcherCount === 1) return "single";
  return "unknown";
}

function mergeActiveLiveIterations(
  current: LiveGameSession,
  candidate: LiveGameSession
) {
  const candidateIsNewer = preferNewerLiveSession(current, candidate);
  const newer = candidateIsNewer ? candidate : current;
  const older = candidateIsNewer ? current : candidate;
  const currentIsPlatform = current.sessionKey.trim().toLowerCase().startsWith("platform:");
  const candidateIsPlatform = candidate.sessionKey.trim().toLowerCase().startsWith("platform:");
  const identitySource =
    currentIsPlatform && !candidateIsPlatform
      ? current
      : candidateIsPlatform && !currentIsPlatform
        ? candidate
        : newer;
  const playerSource =
    candidate.players.length > current.players.length
      ? candidate
      : current.players.length > candidate.players.length
        ? current
        : identitySource;
  const uploaders = mergeLiveUploaders(current.uploaders, candidate.uploaders);
  const watcherIds = mergeLiveStrings(current.watcherIds, candidate.watcherIds);
  const watcherCount = Math.max(
    current.watcherCount,
    candidate.watcherCount,
    watcherIds.length,
    uploaders.length
  );

  return {
    ...older,
    ...newer,
    /*
     * Fresh stream telemetry may be newer than its attached replay row, but a
     * standalone pre-platform stream can never replace exact replay identity
     * or its betting/finality truth after the two are proven equivalent.
     */
    id: identitySource.id,
    sessionKey: identitySource.sessionKey,
    replayFile: identitySource.replayFile,
    replayHash: identitySource.replayHash,
    originalFilename: identitySource.originalFilename,
    disconnectDetected: identitySource.disconnectDetected,
    winner: identitySource.winner,
    bettingEligible: identitySource.bettingEligible,
    parseReason: identitySource.parseReason,
    parseSource: identitySource.parseSource,
    unresolvedResult: identitySource.unresolvedResult,
    state: identitySource.state,
    finalProofPending: identitySource.finalProofPending,
    createdAt:
      earlierLiveTimestamp(current.createdAt, candidate.createdAt) ?? newer.createdAt,
    playedOn: earlierLiveTimestamp(current.playedOn, candidate.playedOn),
    mapName:
      normalizePublicReplayText(newer.mapName) ??
      normalizePublicReplayText(older.mapName),
    durationSeconds: Math.max(
      current.durationSeconds ?? 0,
      candidate.durationSeconds ?? 0
    ) || null,
    players: playerSource.players,
    teamResolution: playerSource.teamResolution,
    uploaders,
    watcherCount,
    watcherIds,
    identityAliases: mergeLiveStrings(
      current.identityAliases,
      candidate.identityAliases
    ),
    watcherSessionIds: mergeLiveStrings(
      current.watcherSessionIds,
      candidate.watcherSessionIds
    ),
    replayFingerprints: mergeLiveStrings(
      current.replayFingerprints,
      candidate.replayFingerprints
    ),
    watcherVersions: mergeLiveStrings(
      current.watcherVersions,
      candidate.watcherVersions
    ),
    parseRows: Math.max(current.parseRows, candidate.parseRows),
    coverageLevel: mergedCoverageLevel(watcherCount),
    uploader: newer.uploader ?? older.uploader,
  } satisfies LiveGameSession;
}

export function dedupeActiveLiveIterations(sessions: LiveGameSession[]) {
  const bestByIdentity = new Map<string, LiveGameSession>();

  for (const session of sessions) {
    const key = activeLiveIterationDedupeKey(session);
    const current = bestByIdentity.get(key);

    if (!current) {
      bestByIdentity.set(key, session);
    } else {
      bestByIdentity.set(key, mergeActiveLiveIterations(current, session));
    }
  }

  return [...bestByIdentity.values()].sort(compareLiveSessionOrder);
}


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
  archiveTotal: number;
  archiveCursor?: number;
};

async function loadRecentMatches(
  prisma: PrismaClient,
  options: { offset?: number; limit?: number } = {}
): Promise<{
  matches: LobbyMatchRow[];
  total: number;
  offset: number;
  nextOffset: number;
}> {
  const archive = await loadPublicBattleArchivePage(prisma, {
    offset: options.offset,
    limit: options.limit ?? LIVE_GAMES_ARCHIVE_CANDIDATE_DEPTH,
  });

  const matches = archive.rows.map((row) => {
    const groupingKey = liveSessionRowGroupingKey(row);
    const sessionKey = groupingKey.startsWith("replay:")
      ? normalizeSessionKey(row)
      : groupingKey.startsWith("legacy:")
        ? `${groupingKey}:battle-final:${row.id}`
      : groupingKey;

    return {
      id: row.id,
      sessionKey,
      replayHash: row.replayHash,
      winner: row.winner,
      map:
        row.map as LobbyMatchRow["map"],
      players:
        row.players as LobbyMatchRow["players"],
      createdAt:
        row.createdAt.toISOString(),
      created_at:
        row.createdAt.toISOString(),
      played_on:
        row.played_on?.toISOString() ??
        null,
      timestamp:
        row.timestamp?.toISOString() ??
        null,
      parse_reason:
        row.parse_reason,
      original_filename:
        row.original_filename,
      replay_file:
        row.replay_file,
    };
  });

  return {
    matches,
    total: archive.total,
    offset: archive.offset,
    nextOffset: archive.nextOffset,
  };
}


// AOE2WAR_COMPLETED_UPLOADER_HYDRATION
type CompletedUploaderHydrationUploader = {
  displayName: string;
  parseRows: number;
};

type CompletedUploaderHydrationSession = {
  id?: number | string | null;
  sessionKey?: string | null;
  completedAt?: string | Date | null;
  playedOn?: string | Date | null;
  createdAt?: string | Date | null;
  players?: Array<{ name?: string | null } | null> | null;
  uploaders?: CompletedUploaderHydrationUploader[] | null;
};

type CompletedUploaderHydrationRow = {
  display_name: string | null;
  parse_rows: number | string | bigint | null;
};

type CompletedUploaderHydrationPrisma = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

function completedUploaderDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function completedUploaderPlayerNames(session: CompletedUploaderHydrationSession) {
  const names = new Set<string>();
  for (const player of session.players ?? []) {
    const name = player?.name?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

async function hydrateCompletedSessionUploaders<T extends CompletedUploaderHydrationSession>(
  prisma: CompletedUploaderHydrationPrisma,
  sessions: T[]
): Promise<T[]> {
  if (!sessions.length) return sessions;

  const hydrated: T[] = [];

  for (const session of sessions) {
    const existingUploaders = session.uploaders ?? [];
    if (existingUploaders.length >= 2) {
      hydrated.push(session);
      continue;
    }

    const playerNames = completedUploaderPlayerNames(session);
    const anchorDate =
      completedUploaderDate(session.completedAt) ??
      completedUploaderDate(session.playedOn) ??
      completedUploaderDate(session.createdAt);

    if (!anchorDate || playerNames.length < 2) {
      hydrated.push(session);
      continue;
    }

    try {
      const rows = await prisma.$queryRawUnsafe<CompletedUploaderHydrationRow[]>(
        `
          with replay_rows as (
            select
              coalesce(u.in_game_name, u.uid) as display_name,
              count(*)::int as parse_rows
            from replay_parse_attempts r
            left join users u on u.uid = r.user_uid
            where r.created_at >= $1::timestamptz - interval '120 minutes'
              and r.created_at <= $1::timestamptz + interval '20 minutes'
              and coalesce(u.in_game_name, u.uid) = any($2::text[])
              and coalesce(r.parse_source, '') in ('watcher_live', 'watcher_final')
              and coalesce(r.status, '') not ilike '%fail%'
            group by coalesce(u.in_game_name, u.uid)
          ),
          event_rows as (
            select
              coalesce(u.in_game_name, u.uid) as display_name,
              count(*)::int as parse_rows
            from watcher_client_events e
            left join users u on u.id = e.user_id
            where e.created_at >= $1::timestamptz - interval '120 minutes'
              and e.created_at <= $1::timestamptz + interval '20 minutes'
              and coalesce(u.in_game_name, u.uid) = any($2::text[])
              and (
                coalesce(e.parse_source, '') in ('watcher_live', 'watcher_final')
                or e.event_type in ('upload_succeeded', 'upload_success', 'parse_succeeded')
              )
            group by coalesce(u.in_game_name, u.uid)
          ),
          combined as (
            select * from replay_rows
            union all
            select * from event_rows
          )
          select
            display_name,
            sum(parse_rows)::int as parse_rows
          from combined
          where display_name is not null
          group by display_name
          order by sum(parse_rows) desc, display_name asc
        `,
        anchorDate.toISOString(),
        playerNames
      );

      const proofUploaders = rows
        .map((row) => ({
          displayName: String(row.display_name ?? "").trim(),
          parseRows: Number(row.parse_rows ?? 0),
        }))
        .filter((row) => row.displayName && row.parseRows > 0);

      hydrated.push(
        proofUploaders.length >= 2
          ? {
              ...session,
              uploaders: proofUploaders,
            }
          : session
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("completed uploader hydration skipped", {
        sessionId: session.id,
        sessionKey: session.sessionKey,
        message,
      });
      hydrated.push(session);
    }
  }

  return hydrated;
}


export async function loadLiveGamesSnapshotFresh(
  prisma: PrismaClient
): Promise<LiveGamesSnapshot> {
  const [
    tournament,
    recentArchive,
    sessionSnapshot,
  ] = await Promise.all([
    getFeaturedTournament(
      prisma
    ),

    loadRecentMatches(
      prisma
    ),

    loadLiveSessionSnapshot(
      prisma
    ),
  ]);
  const recentMatches = recentArchive.matches;

  const activeSessions = dedupeActiveLiveIterations(sessionSnapshot.activeSessions);
  const { recentlyCompletedSessions } = sessionSnapshot;
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
  const scheduledActiveSessions = activeSessions.filter(
    (session) => matchedActiveSessionKeys.has(session.sessionKey)
  );
  const filteredCompletedSessions = recentlyCompletedSessions.filter(
    (session) => !matchedCompletedSessionKeys.has(session.sessionKey)
  );
  const scheduledCompletedSessions = recentlyCompletedSessions.filter(
    (session) => matchedCompletedSessionKeys.has(session.sessionKey)
  );

  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");
  const lifecycleNowMs = Date.now();
  const currentCompletedCandidateCount = filteredCompletedSessions.filter((session) =>
    isInRecentOutcomePresentationWindow(
      session,
      lifecycleNowMs,
      RECENT_OUTCOME_BASE_WINDOW_MS
    )
  ).length;
  const recentOutcomeWindowMs = recentOutcomePresentationWindowMs(
    filteredActiveSessions.length,
    currentCompletedCandidateCount
  );
  const fallbackRecentOutcomeMatches = recentMatches
    .filter((match) =>
      isInRecentOutcomePresentationWindow(
        recentMatchLifecycleTiming(match),
        lifecycleNowMs,
        recentOutcomeWindowMs
      )
    )
    .slice(0, LIVE_GAMES_COMPLETED_SESSION_DEPTH);

  const sessionKeys = [
    ...filteredActiveSessions.flatMap(sessionStreamKeys),
    ...filteredCompletedSessions.flatMap(sessionStreamKeys),
    ...fallbackRecentOutcomeMatches.flatMap(recentMatchStreamKeys),
  ];
  const streamsBySession = await loadStreamsBySession(prisma, sessionKeys);
  const streamedActiveSessionBase = attachStreams(filteredActiveSessions, streamsBySession);
  const streamedCompletedSessionBase = attachStreams(filteredCompletedSessions, streamsBySession);

  const promotedLiveStreamSessions = streamedCompletedSessionBase
    .filter(sessionHasLiveNativeStream)
    .map((session) => ({
      ...session,
      state: "live" as const,
      completedAt: null,
    }));

  const standaloneLiveStreamSessions = await loadStandaloneLiveStreamSessions(
    prisma,
    new Set([
      ...streamedActiveSessionBase.flatMap(sessionStreamKeys),
      ...promotedLiveStreamSessions.flatMap(sessionStreamKeys),
    ])
  );

  const streamedActiveSessions = dedupeStreamedSessions([
    ...promotedLiveStreamSessions,
    ...standaloneLiveStreamSessions,
    ...streamedActiveSessionBase,
  ]).sort(compareLiveSessionOrder);

  const activeSessionKeys = new Set(streamedActiveSessions.map((session) => session.sessionKey));
  const activeLaneIdentities = collectLiveLaneIdentities(streamedActiveSessions);
  const streamedCompletedSessions = excludeOccupiedLiveLaneItems(
    streamedCompletedSessionBase.filter(
      (session) =>
        isInRecentOutcomePresentationWindow(
          session,
          lifecycleNowMs,
          recentOutcomeWindowMs
        ) &&
        !sessionHasLiveNativeStream(session) &&
        !activeSessionKeys.has(session.sessionKey)
    ),
    activeLaneIdentities
  );

  const fallbackRecentOutcomeSessions = excludeOccupiedLiveLaneItems(
    compactNullable(
      fallbackRecentOutcomeMatches.map((match) =>
        buildRecentOutcomeSession(match, streamsBySession)
      )
    ),
    activeLaneIdentities
  );

  const displayedCompletedSessionsBase = dedupeStreamedSessions(
    [
      ...streamedCompletedSessions,
      ...fallbackRecentOutcomeSessions,
    ].sort(compareCompletedSessionRecency)
  ).slice(0, LIVE_GAMES_COMPLETED_SESSION_DEPTH);

  const occupiedLiveLaneIdentities = collectLiveLaneIdentities([
    ...streamedActiveSessions,
    ...displayedCompletedSessionsBase,
    ...scheduledActiveSessions,
    ...scheduledCompletedSessions,
  ]);

  const hydratedCompletedSessions = await hydrateCompletedSessionUploaders(
    prisma,
    displayedCompletedSessionsBase
  );
  // AOE2WAR_LIVE_WINNER_MARKET_PROJECTION
  const activeMarketSummaries = await loadLiveBetMarketSummaryMap(
    prisma,
    streamedActiveSessions
      .filter((session) => !session.finalProofPending)
      .map((session) => ({ id: session.id, sessionKey: session.sessionKey }))
  ).catch((error) => {
    console.warn("Failed to load active live market summaries:", error);
    return new Map();
  });

  const activeSessionsWithMarkets = streamedActiveSessions.map((session) => ({
    ...session,
    reviewMarket: session.finalProofPending
      ? null
      : activeMarketSummaries.get(session.id) ?? null,
  }));

  const reviewMarketSummaries = await loadReplayReviewMarketSummaryMap(
    prisma,
    hydratedCompletedSessions
      .filter((session) => Boolean(session.unresolvedResult))
      .map((session) => ({ id: session.id, sessionKey: session.sessionKey }))
  ).catch((error) => {
    console.warn("Failed to load replay review market summaries:", error);
    return new Map();
  });
  const displayedCompletedSessions = hydratedCompletedSessions.map((session) => ({
    ...session,
    reviewMarket: reviewMarketSummaries.get(session.id) ?? null,
  }));

  // A battle occupies exactly one public lifecycle lane. It enters the archive
  // only after leaving the active/recent-outcome presentation windows; the
  // 14-day final-proof corpus in loadLiveSessionSnapshot remains untouched.
  const archiveProjection = await projectArchiveLaneAcrossPages(
    recentArchive,
    occupiedLiveLaneIdentities,
    LIVE_GAMES_RECENT_MATCH_LIMIT,
    (offset) =>
      loadRecentMatches(prisma, {
        offset,
        limit: LIVE_GAMES_ARCHIVE_CANDIDATE_DEPTH,
      })
  );
  const displayedRecentMatches = archiveProjection.matches;
  const archiveTotal = archiveProjection.total;
  const archiveCursor = archiveProjection.rawConsumed;

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
    liveCount: liveMatches.length + streamedActiveSessions.length + scheduledLiveCount,
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
    activeSessions: activeSessionsWithMarkets,
    recentlyCompletedSessions: displayedCompletedSessions,
    liveMatches,
    readyMatches,
    scheduledMatches,
    recentMatches: displayedRecentMatches,
    archiveTotal,
    archiveCursor,
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

function sessionHasLiveNativeStream(session: StreamedLiveGameSession) {
  return session.streams.some(
    (stream) =>
      stream.provider === "aoe2war" &&
      ["starting", "live"].includes(stream.status) &&
      stream.chunkCount > 0
  );
}

function compactNullable<T>(items: Array<T | null | undefined>) {
  return items.filter(Boolean) as T[];
}

function readMatchText(match: LobbyMatchRow, ...keys: string[]) {
  const row = match as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readMatchMapName(match: LobbyMatchRow) {
  const row = match as unknown as Record<string, unknown>;
  const map = row.map;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    const name = normalizePublicReplayText(
      (map as Record<string, unknown>).name
    );
    if (name) return name;
  }
  return normalizePublicReplayText(
    readMatchText(match, "map_name", "mapName")
  );
}

function readMatchNumber(match: LobbyMatchRow, ...keys: string[]) {
  const row = match as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

export function recentMatchStreamKeys(match: LobbyMatchRow) {
  const row = match as unknown as Record<string, unknown>;
  const keys = new Set<string>();
  const add = (value: unknown) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) keys.add(text);
  };
  const addStrongReplay = (value: unknown) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || !strongLiveReplayAlias({ original_filename: text })) return;
    keys.add(text);
    keys.add(streamKeyBasename(text));
  };

  add(row.sessionKey);
  add(row.session_key);
  const normalized = normalizeSessionKey(match);
  if (normalized.toLowerCase().startsWith("platform:")) {
    add(normalized);
  } else {
    addStrongReplay(normalized);
  }
  addStrongReplay(row.originalFilename);
  addStrongReplay(row.original_filename);
  addStrongReplay(row.replayFile);
  addStrongReplay(row.replay_file);

  return [...keys];
}

function extractRecentMatchPlayers(match: LobbyMatchRow): LiveGameSession["players"] {
  const row = match as unknown as Record<string, unknown>;
  const rawPlayers = Array.isArray(row.players) ? row.players : [];
  const truthPlayers = rawPlayers.filter(
    (player): player is { name?: unknown; winner?: unknown } =>
      Boolean(player) && typeof player === "object"
  );
  const winner =
    resolveReliableReplayWinner({
      winner: readMatchText(match, "winner", "winner_name", "winnerName"),
      players: truthPlayers,
      parseReason: readMatchText(match, "parse_reason", "parseReason") || null,
      keyEvents: row.key_events ?? row.keyEvents,
    })?.toLowerCase() ?? "";

  if (rawPlayers.length > 0) {
    return normalizeReplayPlayers(rawPlayers).map((player) => ({
      ...player,
      winner: winner ? player.normalizedName === winner : player.winner,
    }));
  }

  const title = readMatchText(match, "title", "matchTitle", "name");
  const parts = title
    .split(/\s+vs\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return normalizeReplayPlayers(parts.slice(0, 2).flatMap((name) => {
    const resolvedName = normalizePublicReplayText(name);
    if (!resolvedName) return [];
    return [{
      name: resolvedName,
      winner: winner ? name.toLowerCase() === winner : false,
    }];
  }));
}

function buildRecentOutcomeSession(
  match: LobbyMatchRow,
  streamsBySession: Map<string, WatchStreamPayload[]>
): StreamedLiveGameSession | null {
  const sessionKey = match.sessionKey?.trim() || normalizeSessionKey(match);
  if (!sessionKey) return null;
  const players = extractRecentMatchPlayers(match);

  const streamsById = new Map<number, WatchStreamPayload>();
  for (const key of recentMatchStreamKeys(match)) {
    for (const stream of streamsBySession.get(key) ?? []) {
      streamsById.set(stream.id, stream);
    }
  }

  const streams = Array.from(streamsById.values()).sort(compareStreamsForPrimary);
  const primaryStream = selectPrimarySessionStream(streams, {
    players,
    state: "completed",
  });

  const id = readMatchNumber(match, "id", "game_stats_id", "gameStatsId") ?? -1;
  const playedAt =
    readMatchText(match, "played_on", "playedOn", "timestamp", "created_at", "createdAt") ||
    new Date().toISOString();
  const originalFilename = readMatchText(match, "original_filename", "originalFilename", "filename");
  const replayFile = readMatchText(match, "replay_file", "replayFile") || originalFilename || null;
  const rawWinner = readMatchText(match, "winner", "winner_name", "winnerName");
  const parseReason = readMatchText(match, "parse_reason", "parseReason") || null;
  const parseSource = readMatchText(match, "parse_source", "parseSource") || null;
  const mapName = readMatchMapName(match);
  const teamResolution = resolveReplayTeams(players, { final: true });

  return {
    id,
    sessionKey,
    identityAliases: [],
    replayFile,
    replayHash: readMatchText(match, "replay_hash", "replayHash") || `recent:${id}`,
    parseIteration: readMatchNumber(match, "parse_iteration", "parseIteration") ?? 1,
    createdAt: playedAt,
    updatedAt: readMatchText(match, "updated_at", "updatedAt") || playedAt,
    completedAt: playedAt,
    playedOn: playedAt,
    mapName,
    durationSeconds: readMatchNumber(match, "duration_seconds", "durationSeconds"),
    originalFilename: originalFilename || replayFile || sessionKey,
    disconnectDetected: false,
    winner: resolveReliableReplayWinner({
      winner: rawWinner,
      players,
      parseReason,
      keyEvents: (match as unknown as Record<string, unknown>).key_events,
    }),
    // This row is synthesized from the public/archive presentation surface.
    // It may carry statistics-authorized winner truth, but it is never
    // standalone financial authority for a betting market.
    bettingEligible: false,
    parseReason,
    parseSource,
    unresolvedResult: classifyUnresolvedWatcherResult({
      winner: rawWinner,
      players,
      mapName,
      state: "completed",
      parseReason,
      parseSource,
      keyEvents: (match as unknown as Record<string, unknown>).key_events,
      watcherCount: 1,
    }),
    state: "completed",
    finalProofPending: false,
    players,
    teamResolution,
    uploaders: [],
    watcherCount: 1,
    watcherIds: [],
    watcherSessionIds: [],
    replayFingerprints: [],
    watcherVersions: [],
    parseRows: 1,
    coverageLevel: "single",
    disposition: resolveReliableReplayWinner({
      winner: rawWinner,
      players,
      parseReason,
      keyEvents: (match as unknown as Record<string, unknown>).key_events,
    }) ? "result_ready" : "result_review",
    uploader: null,
    streams,
    primaryStream,
  };
}


function normalizeSessionDedupeKey(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const basename = streamKeyBasename(trimmed).toLowerCase();
  const simplified = basename
    .replace(/\.(aoe2record|aoe2mpgame|zip|webm|mp4)$/i, "")
    .replace(/[^a-z0-9]+/g, "");

  if (!simplified || simplified.length < 6) return "";

  if (
    [
      "index",
      "live",
      "manifest",
      "playlist",
      "playback",
      "stream",
      "watcherstream",
      "watcherlive",
      "playersparsing",
      "battlecam",
      "maincast",
      "observer",
    ].includes(simplified)
  ) {
    return "";
  }

  return simplified;
}

function recentMatchLifecycleTiming(match: LobbyMatchRow) {
  return {
    completedAt:
      match.timestamp ??
      match.createdAt ??
      match.created_at ??
      match.played_on ??
      null,
  };
}

export function liveLaneIdentityKeys(item: unknown) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return [];
  const row = item as Record<string, unknown>;
  const keys: string[] = [];
  const id = Number(row.id ?? row.game_stats_id ?? row.gameStatsId);
  if (Number.isSafeInteger(id) && id > 0) {
    keys.push(`game:${id}`);
  }

  const sessionKey = String(
    row.sessionKey ??
      row.session_key ??
      row.linkedSessionKey ??
      row.linked_session_key ??
      ""
  )
    .trim()
    .toLowerCase();

  /*
   * A watcher session can begin before the Watcher learns the durable
   * platform battle id. The live grouper records that exact pre-promotion
   * session key as an identity alias on the canonical platform session. Make
   * those server-proven aliases occupy the lifecycle lane too, otherwise the
   * legacy representation can leak into recently-completed or archive while
   * the promoted battle is still active.
   *
   * Do not derive aliases from player names or other fuzzy metadata here. An
   * alias is trusted only because the server grouper emitted it explicitly.
   */
  if (Array.isArray(row.identityAliases)) {
    for (const value of row.identityAliases) {
      if (typeof value !== "string") continue;
      const alias = value.trim().toLowerCase();
      if (!alias) continue;
      if (alias.startsWith("platform:")) {
        keys.push(`platform:${alias.slice("platform:".length)}`);
        continue;
      }
      const normalizedAlias = normalizeSessionDedupeKey(alias);
      if (normalizedAlias) keys.push(`session:${normalizedAlias}`);
    }
  }

  if (sessionKey.startsWith("platform:")) {
    keys.push(`platform:${sessionKey.slice("platform:".length)}`);
    return Array.from(new Set(keys));
  }

  const replayHash = String(row.replayHash ?? row.replay_hash ?? "")
    .trim()
    .toLowerCase();
  if (replayHash) {
    keys.push(`hash:${replayHash}`);
  }

  const normalizedSessionKey = normalizeSessionDedupeKey(sessionKey);
  if (normalizedSessionKey) {
    keys.push(`session:${normalizedSessionKey}`);
  }

  for (const value of [
    row.originalFilename,
    row.original_filename,
    row.replayFile,
    row.replay_file,
  ]) {
    const normalized = normalizeSessionDedupeKey(
      strongLiveReplayAlias({
        original_filename: typeof value === "string" ? value : null,
        replay_file: typeof value === "string" ? value : null,
      })
    );
    if (normalized) keys.push(`replay:${normalized}`);
  }

  return Array.from(new Set(keys));
}

export function collectLiveLaneIdentities(items: unknown[]) {
  return new Set(items.flatMap(liveLaneIdentityKeys));
}

function overlapsLiveLane(item: unknown, occupied: ReadonlySet<string>) {
  return liveLaneIdentityKeys(item).some((key) => occupied.has(key));
}

/**
 * Remove rows already owned by a stronger lifecycle lane. Keeping this as the
 * shared server projector makes the active -> just-finished -> archive
 * exclusivity rule executable instead of relying on each caller to reproduce
 * the identity comparison correctly.
 */
export function excludeOccupiedLiveLaneItems<T>(
  items: readonly T[],
  occupied: ReadonlySet<string>
) {
  return items.filter((item) => !overlapsLiveLane(item, occupied));
}

export function projectArchiveLane(
  matches: LobbyMatchRow[],
  occupied: Set<string>,
  limit: number
) {
  const projected: LobbyMatchRow[] = [];
  let rawConsumed = 0;

  for (const match of matches) {
    rawConsumed += 1;
    if (overlapsLiveLane(match, occupied)) continue;
    projected.push(match);
    if (projected.length >= limit) break;
  }

  return {
    matches: projected,
    rawConsumed,
  };
}

type ArchiveCandidatePage = {
  matches: LobbyMatchRow[];
  total: number;
  offset: number;
  nextOffset: number;
};

/**
 * Fill the visible archive rail without imposing a raw candidate ceiling.
 *
 * A surge can legitimately put hundreds of final-backed battles in active or
 * just-finished lanes. Page through the already-logical database corpus only
 * when the first bounded page cannot supply the requested number of exclusive
 * archive cards.
 */
export async function projectArchiveLaneAcrossPages(
  initialPage: ArchiveCandidatePage,
  occupied: Set<string>,
  limit: number,
  loadPage: (offset: number) => Promise<ArchiveCandidatePage>
) {
  const target = Math.max(0, Math.trunc(limit));
  const projected: LobbyMatchRow[] = [];
  const seenMatchIds = new Set<string>();
  const requestedOffsets = new Set<number>();
  let page = initialPage;
  let rawConsumed = page.offset;
  let total = page.total;

  while (projected.length < target) {
    let consumedInPage = 0;

    for (const match of page.matches) {
      consumedInPage += 1;
      rawConsumed = page.offset + consumedInPage;

      const matchId = String(match.id);
      if (seenMatchIds.has(matchId)) continue;
      seenMatchIds.add(matchId);

      if (overlapsLiveLane(match, occupied)) continue;
      projected.push(match);
      if (projected.length >= target) break;
    }

    if (projected.length >= target) break;

    /*
     * nextOffset is the logical identity coordinate and may advance farther
     * than hydrated rows if one is concurrently removed between SQL paging and
     * relation hydration.
     */
    rawConsumed = Math.max(rawConsumed, page.nextOffset);
    total = page.total;
    if (rawConsumed >= total || page.nextOffset <= page.offset) break;
    if (requestedOffsets.has(rawConsumed)) break;

    requestedOffsets.add(rawConsumed);
    page = await loadPage(rawConsumed);
    total = page.total;
  }

  return {
    matches: projected,
    rawConsumed,
    total,
  };
}

export function streamedSessionDedupeKeys(session: StreamedLiveGameSession) {
  const strongSessionKey = session.sessionKey.trim().toLowerCase();
  const gameId = Number(session.id);
  const gameKey =
    Number.isSafeInteger(gameId) && gameId > 0 ? `game:${gameId}` : "";
  if (strongSessionKey.startsWith("platform:")) {
    const keys = [
      `platform:${strongSessionKey.slice("platform:".length)}`,
      gameKey,
    ].filter(Boolean);
    /*
     * These aliases are emitted only by the fail-closed server grouper. They
     * let a stream that started before platform truth attach to the promoted
     * replay card instead of surviving as a second standalone battle.
     */
    for (const alias of session.identityAliases ?? []) {
      const normalized = normalizeSessionDedupeKey(alias);
      if (normalized) keys.push(`session:${normalized}`);
    }
    return [...new Set(keys)];
  }

  const keys = new Set<string>();
  if (gameKey) keys.add(gameKey);

  const addSessionAlias = (value: string | null | undefined) => {
    const trimmed = value?.trim() || "";
    const looksLikeReplayName =
      /\.(aoe2record|aoe2mpgame|mgx2|mgz|zip)$/i.test(trimmed);
    if (
      looksLikeReplayName &&
      !strongLiveReplayAlias({
        original_filename: trimmed,
        replay_file: trimmed,
      })
    ) {
      return;
    }
    const normalized = normalizeSessionDedupeKey(value);
    if (normalized) keys.add(`session:${normalized}`);
  };
  const addReplayAlias = (value: string | null | undefined) => {
    const normalized = normalizeSessionDedupeKey(
      strongLiveReplayAlias({ original_filename: value, replay_file: value })
    );
    if (normalized) keys.add(`replay:${normalized}`);
  };
  const addAttachedStreamAlias = (value: string | null | undefined) => {
    const trimmed = value?.trim().toLowerCase() || "";
    if (!trimmed) return;

    if (trimmed.startsWith("platform:")) {
      keys.add(`platform:${trimmed.slice("platform:".length)}`);
      return;
    }

    if (
      trimmed.startsWith("legacy:") ||
      trimmed.startsWith("observation:") ||
      trimmed.startsWith("replay:")
    ) {
      addSessionAlias(trimmed);
      return;
    }

    addReplayAlias(trimmed);
  };

  addSessionAlias(session.sessionKey);
  for (const stream of session.streams) {
    /*
     * `/api/streams/start` may persist a generic replay basename as the stream
     * session key. It must not undo loader separation by becoming a global
     * alias. Admit only canonical platform IDs, loader-generated grouping IDs,
     * or replay names that pass the same high-entropy identity contract.
     */
    addAttachedStreamAlias(stream.sessionKey);
  }

  /*
   * Standalone stream cards synthesize replayFile/originalFilename from the
   * human title. Those fields are presentation, not identity. Replay-backed
   * sessions may use their actual stored replay names as explicit aliases.
   * URLs and playback paths are never aliases: every native feed ends in a
   * generic route such as `/manifest` and would otherwise collapse the board.
   */
  if (session.parseSource !== "watcher_stream") {
    addReplayAlias(session.originalFilename);
    addReplayAlias(session.replayFile);
  }

  return [...keys];
}

export function dedupeStreamedSessions(sessions: StreamedLiveGameSession[]) {
  const parent = sessions.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };

  const ownerByKey = new Map<string, number>();
  const keysByIndex = sessions.map((session) => {
    const keys = streamedSessionDedupeKeys(session);
    const gameId = Number(session.id);
    const fallbackKey =
      Number.isFinite(gameId) && gameId > 0
        ? `game:${gameId}`
        : `observation:${session.id}`;
    return keys.length > 0 ? keys : [fallbackKey];
  });

  for (const [index, keys] of keysByIndex.entries()) {
    for (const key of keys) {
      const owner = ownerByKey.get(key);
      if (owner === undefined) {
        ownerByKey.set(key, index);
      } else {
        union(index, owner);
      }
    }
  }

  const groups = new Map<
    number,
    { firstIndex: number; session: StreamedLiveGameSession }
  >();

  for (const [index, session] of sessions.entries()) {
    const root = find(index);
    const existingGroup = groups.get(root);
    if (!existingGroup) {
      groups.set(root, { firstIndex: index, session });
      continue;
    }

    const existing = existingGroup.session;
    const base = mergeActiveLiveIterations(existing, session);
    const streamsById = new Map<number, WatchStreamPayload>();
    for (const stream of [...existing.streams, ...session.streams]) {
      streamsById.set(stream.id, stream);
    }
    const streams = [...streamsById.values()].sort(compareStreamsForPrimary);
    existingGroup.session = {
      ...base,
      streams,
      primaryStream: selectPrimarySessionStream(streams, base),
    } satisfies StreamedLiveGameSession;
  }

  return [...groups.values()]
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map((group) => group.session);
}

function compareCompletedSessionRecency(left: StreamedLiveGameSession, right: StreamedLiveGameSession) {
  const recencyDiff = completedSessionRecencyMs(right) - completedSessionRecencyMs(left);
  if (recencyDiff !== 0) {
    return recencyDiff;
  }

  return Math.abs(right.id) - Math.abs(left.id);
}

function parseStreamPlayers(title: string): LiveGameSession["players"] {
  const parts = title
    .split(/\s+vs\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return [];

  return normalizeReplayPlayers(parts.slice(0, 2).map((name) => ({
    name,
    winner: null,
  })));
}


function cleanStandaloneStreamTitle(value: string | null | undefined) {
  const title = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!title) return "Watcher Live";
  if (/^platform:/i.test(title)) return "Watcher Live";
  if (/^aoe2war:\/\/stream/i.test(title)) return "Watcher Live";
  if (/^mp replay/i.test(title)) return "Players parsing";

  return title;
}

export async function loadStandaloneLiveStreamSessions(
  prisma: PrismaClient,
  knownActiveSessionKeys: Set<string>
): Promise<StreamedLiveGameSession[]> {
  const staleCutoff = new Date(Date.now() - BROWSER_STREAM_STALE_MS);

  const rows = await prisma.gameWatchStream
    .findMany({
      where: {
        provider: "aoe2war",
        sourceType: {
          in: ["watcher_native", "browser"],
        },
        status: {
          in: ["starting", "live"],
        },
        chunkCount: {
          gt: 0,
        },
        OR: [
          {
            lastHeartbeatAt: {
              gte: staleCutoff,
            },
          },
          {
            updatedAt: {
              gte: staleCutoff,
            },
          },
        ],
      },
      orderBy: [
        { isPrimary: "desc" },
        { lastHeartbeatAt: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      /*
       * No raw-row ceiling: freshness/status bound this query to currently
       * viable streams, and the start route permits only one active native
       * stream per owner. A low take would silently erase valid concurrent
       * watchers before identity reconciliation can run.
       */
    })
    .catch((error) => {
      console.warn("Failed to load standalone live streams:", error);
      return [];
    });

  const sessions: StreamedLiveGameSession[] = [];

  for (const row of rows) {
    const stream = toWatchStreamPayload(row);
    if (!isVisibleStream(stream)) continue;
    if (!stream.sessionKey || knownActiveSessionKeys.has(stream.sessionKey)) continue;

    const title = cleanStandaloneStreamTitle(stream.title || stream.playerLabel || stream.label);
    const nowIso = new Date().toISOString();
    const activityIso = stream.lastHeartbeatAt || stream.updatedAt || nowIso;
    const players = parseStreamPlayers(title);

    sessions.push({
      id: -Math.abs(stream.id),
      sessionKey: stream.sessionKey,
      identityAliases: [],
      replayFile: title || stream.sessionKey,
      replayHash: `stream:${stream.id}`,
      parseIteration: 1,
      createdAt: stream.startedAt || stream.createdAt || activityIso,
      updatedAt: activityIso,
      completedAt: null,
      playedOn: stream.startedAt || stream.createdAt || null,
      mapName: null,
      durationSeconds: null,
      originalFilename: title || "Watcher Live",
      disconnectDetected: false,
      winner: null,
      bettingEligible: false,
      parseReason: null,
      parseSource: "watcher_stream",
      unresolvedResult: null,
      state: "live",
      finalProofPending: false,
      players,
      teamResolution: resolveReplayTeams(players),
      uploaders: [],
      watcherCount: 1,
      watcherIds: [],
      watcherSessionIds: [],
      replayFingerprints: [],
      watcherVersions: [],
      parseRows: 1,
      coverageLevel: "single",
      disposition: "live",
      uploader: null,
      streams: [stream],
      primaryStream: stream,
    });
  }

  return sessions;
}

function streamKeyBasename(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed;
}

export function sessionStreamKeys(
  session: Pick<
    LiveGameSession,
    "sessionKey" | "identityAliases" | "originalFilename" | "replayFile"
  >
) {
  const keys = new Set<string>();
  const sessionKey = session.sessionKey.trim();
  if (sessionKey) keys.add(sessionKey);
  for (const alias of session.identityAliases ?? []) {
    const exactAlias = alias.trim();
    if (exactAlias) keys.add(exactAlias);
  }

  for (const value of [session.originalFilename, session.replayFile]) {
    const replayAlias = strongLiveReplayAlias({
      original_filename: value,
      replay_file: value,
    });
    if (!replayAlias) continue;
    const text = value?.trim() || "";
    if (text) keys.add(text);
    const basename = streamKeyBasename(value);
    if (basename) keys.add(basename);
  }

  return [...keys];
}

function compareStreamsForPrimary(left: WatchStreamPayload, right: WatchStreamPayload) {
  const score = (stream: WatchStreamPayload) => {
    let value = 0;
    if (stream.isPrimary) value += 1000;
    if (stream.provider === "aoe2war") value += 500;
    if (["starting", "live"].includes(stream.status)) value += 250;
    if (stream.chunkCount > 0) value += 100;
    value += Math.min(stream.chunkCount || 0, 99);
    return value;
  };

  const scoreDiff = score(right) - score(left);
  if (scoreDiff !== 0) return scoreDiff;

  const rightSeen = new Date(right.lastHeartbeatAt || right.updatedAt).getTime();
  const leftSeen = new Date(left.lastHeartbeatAt || left.updatedAt).getTime();
  return rightSeen - leftSeen;
}

function normalizeStreamIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function streamMatchesSessionPlayer(
  stream: WatchStreamPayload,
  session: Pick<LiveGameSession, "players">
) {
  const playerLabel = normalizeStreamIdentity(stream.playerLabel);
  if (!playerLabel) return false;

  return session.players.some((player) => {
    const playerName = normalizeStreamIdentity(player.name);
    return Boolean(
      playerName &&
        (playerName === playerLabel ||
          playerName.includes(playerLabel) ||
          playerLabel.includes(playerName))
    );
  });
}

function selectPrimarySessionStream(
  streams: WatchStreamPayload[],
  session: Pick<LiveGameSession, "players" | "state">
) {
  return (
    streams.find(
      (stream) =>
        stream.provider === "aoe2war" &&
        stream.status !== "ended" &&
        stream.chunkCount > 0
    ) ||
    streams.find(
      (stream) => stream.provider === "aoe2war" && stream.status !== "ended"
    ) ||
    streams.find(
      (stream) =>
        stream.provider === "aoe2war" &&
        stream.status === "ended" &&
        stream.chunkCount > 0
    ) ||
    (session.state === "live"
      ? streams.find((stream) => stream.isPrimary)
      : undefined) ||
    streams.find((stream) => streamMatchesSessionPlayer(stream, session)) ||
    null
  );
}

function attachStreams(
  sessions: LiveGameSession[],
  streamsBySession: Map<string, WatchStreamPayload[]>
): StreamedLiveGameSession[] {
  return sessions.map((session) => {
    const streamsById = new Map<number, WatchStreamPayload>();

    for (const key of sessionStreamKeys(session)) {
      for (const stream of streamsBySession.get(key) ?? []) {
        streamsById.set(stream.id, stream);
      }
    }

    const streams = Array.from(streamsById.values()).sort(compareStreamsForPrimary);
    const primaryStream = selectPrimarySessionStream(streams, session);

    return {
      ...session,
      streams,
      primaryStream,
    };
  });
}
type LiveGamesSnapshotCacheEntry = {
  expiresAt: number;
  value: LiveGamesSnapshot;
};

const LIVE_GAMES_SNAPSHOT_CACHE_TTL_MS = 4000;
let liveGamesSnapshotCache: LiveGamesSnapshotCacheEntry | null = null;
let liveGamesSnapshotRefreshPromise: Promise<LiveGamesSnapshot> | null = null;

function refreshLiveGamesSnapshot(
  prisma: PrismaClient
) {
  if (liveGamesSnapshotRefreshPromise) {
    return liveGamesSnapshotRefreshPromise;
  }

  const lastGoodSnapshot = liveGamesSnapshotCache;
  const refresh = loadLiveGamesSnapshotFresh(prisma)
    .then((value) => {
      liveGamesSnapshotCache = {
        expiresAt:
          Date.now() +
          LIVE_GAMES_SNAPSHOT_CACHE_TTL_MS,
        value,
      };
      return value;
    })
    .catch((error) => {
      /*
       * Expired snapshots are never returned while a healthy refresh is in
       * flight. The last good value is a failure-only availability fallback;
       * it remains expired so the next request retries current DB truth.
       */
      if (lastGoodSnapshot) {
        console.error(
          "Failed to refresh live games snapshot; serving the last good snapshot once:",
          error
        );
        return lastGoodSnapshot.value;
      }
      throw error;
    })
    .finally(() => {
      if (liveGamesSnapshotRefreshPromise === refresh) {
        liveGamesSnapshotRefreshPromise = null;
      }
    });

  liveGamesSnapshotRefreshPromise = refresh;
  return refresh;
}

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const now = Date.now();

  if (liveGamesSnapshotCache && liveGamesSnapshotCache.expiresAt > now) {
    return liveGamesSnapshotCache.value;
  }

  return refreshLiveGamesSnapshot(prisma);
}
