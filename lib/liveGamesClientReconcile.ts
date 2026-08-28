import type { LiveGamesSnapshot } from "./liveGames.ts";
import {
  compareLiveSessionOrder,
  liveSessionActivityMs,
} from "./liveSessionOrdering.ts";
import { normalizePublicReplayText } from "./unresolvedWatcherResult.ts";

type LiveSession = LiveGamesSnapshot["activeSessions"][number];
type ArchiveMatch = LiveGamesSnapshot["recentMatches"][number];

export type LiveArchiveClientState = {
  matches: LiveGamesSnapshot["recentMatches"];
  offset: number;
  total: number;
  hasMore: boolean;
  seedSignature: string;
};

function normalizeArchiveCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

function archiveMatchIdentity(match: ArchiveMatch) {
  return String(match.id);
}

export function liveArchiveSeedSignature(
  matches: LiveGamesSnapshot["recentMatches"],
  cursor: number
) {
  return JSON.stringify([
    normalizeArchiveCoordinate(cursor),
    matches.map(archiveMatchIdentity),
  ]);
}

export function buildLiveArchiveClientState(
  matches: LiveGamesSnapshot["recentMatches"],
  cursor: number,
  total: number
): LiveArchiveClientState {
  const offset = normalizeArchiveCoordinate(cursor);
  const normalizedTotal = normalizeArchiveCoordinate(total);
  return {
    matches,
    offset,
    total: normalizedTotal,
    hasMore: offset < normalizedTotal,
    seedSignature: liveArchiveSeedSignature(matches, offset),
  };
}

/**
 * Refresh the authoritative first archive page without throwing away pages a
 * viewer already loaded. A changed first-page identity/cursor resets the
 * coordinate; an identical seed only refreshes card metadata in place.
 */
export function reconcileLiveArchiveClientState(
  current: LiveArchiveClientState,
  matches: LiveGamesSnapshot["recentMatches"],
  cursor: number,
  total: number
): LiveArchiveClientState {
  const next = buildLiveArchiveClientState(matches, cursor, total);
  if (next.seedSignature !== current.seedSignature) {
    return next;
  }

  const refreshedById = new Map(
    matches.map((match) => [archiveMatchIdentity(match), match] as const)
  );
  return {
    ...current,
    matches: current.matches.map(
      (match) => refreshedById.get(archiveMatchIdentity(match)) ?? match
    ),
    total: next.total,
    hasMore:
      next.total === current.total
        ? current.hasMore
        : current.offset < next.total,
  };
}

/**
 * Append one logical archive page only if it still belongs to the seed and
 * offset that requested it. This prevents a late response from an older live
 * snapshot from corrupting the viewer's current archive coordinate.
 */
export function appendLiveArchiveClientPage(
  current: LiveArchiveClientState,
  input: {
    requestedSeedSignature: string;
    requestedOffset: number;
    matches: LiveGamesSnapshot["recentMatches"];
    nextOffset: number;
    total: number;
  }
): LiveArchiveClientState {
  const requestedOffset = normalizeArchiveCoordinate(input.requestedOffset);
  if (
    current.seedSignature !== input.requestedSeedSignature ||
    current.offset !== requestedOffset
  ) {
    return current;
  }

  const nextOffset = normalizeArchiveCoordinate(input.nextOffset);
  const total = normalizeArchiveCoordinate(input.total);
  const seen = new Set(current.matches.map(archiveMatchIdentity));
  const unique = input.matches.filter(
    (match) => !seen.has(archiveMatchIdentity(match))
  );
  const progressed = nextOffset > requestedOffset;

  return {
    ...current,
    matches: [...current.matches, ...unique],
    offset: progressed ? nextOffset : current.offset,
    total,
    hasMore: progressed && nextOffset < total,
  };
}

// Four 5-second poll periods cover a short network wobble without leaving an
// ended watcher card pinned to the board for minutes.
export const LIVE_GAME_CLIENT_GRACE_MS = 20_000;

function basename(value: string) {
  return value.split(/[\\/]/).pop()?.trim() || value.trim();
}

export function liveSessionIdentity(
  session: Pick<
    LiveSession,
    "sessionKey" | "originalFilename" | "replayFile" | "replayHash" | "id"
  >
) {
  const sessionKey = normalizePublicReplayText(session.sessionKey);
  if (sessionKey) return `session:${sessionKey.toLowerCase()}`;

  const filename = normalizePublicReplayText(
    session.originalFilename ?? session.replayFile
  );
  if (filename) return `file:${basename(filename).toLowerCase()}`;

  const hash = normalizePublicReplayText(session.replayHash);
  if (hash) return `hash:${hash.toLowerCase()}`;
  return `row:${String(session.id)}`;
}

function activityMs(session: LiveSession) {
  return liveSessionActivityMs(session);
}

function earliestIso(
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

function mergeStrings(older: string[] = [], newer: string[] = []) {
  return Array.from(new Set([...older, ...newer].filter(Boolean))).sort();
}

function coverageLevelForWatcherCount(
  watcherCount: number
): LiveSession["coverageLevel"] {
  if (watcherCount >= 3) return "stacked";
  if (watcherCount === 2) return "dual";
  if (watcherCount === 1) return "single";
  return "unknown";
}

function liveSessionAliasIdentity(value: string | null | undefined) {
  const normalized = normalizePublicReplayText(value);
  return normalized ? `session:${normalized.toLowerCase()}` : "";
}

function knownPlayerCount(session: LiveSession) {
  return session.players.filter((player) =>
    normalizePublicReplayText(player.name)
  ).length;
}

function mergeByIdentity<T>(
  older: T[],
  newer: T[],
  identity: (item: T) => string
) {
  const merged = new Map<string, T>();
  for (const item of older) merged.set(identity(item), item);
  for (const item of newer) merged.set(identity(item), item);
  return [...merged.values()];
}

export function mergeLiveSessionMetadata(
  previous: LiveSession,
  incoming: LiveSession
): LiveSession {
  const incomingIsNewer = activityMs(incoming) >= activityMs(previous);
  const newer = incomingIsNewer ? incoming : previous;
  const older = incomingIsNewer ? previous : incoming;
  const incomingPlayerCount = knownPlayerCount(incoming);
  const previousPlayerCount = knownPlayerCount(previous);
  const players =
    incomingPlayerCount >= previousPlayerCount
      ? incoming.players
      : previous.players;
  const mapName =
    normalizePublicReplayText(incoming.mapName) ??
    normalizePublicReplayText(previous.mapName);
  const durationSeconds = Math.max(
    incoming.durationSeconds ?? 0,
    previous.durationSeconds ?? 0
  );
  const uploaders = mergeByIdentity(
    older.uploaders ?? [],
    newer.uploaders ?? [],
    (uploader) => uploader.uid
  );
  const streams = mergeByIdentity(
    older.streams ?? [],
    newer.streams ?? [],
    (stream) => String(stream.id)
  );
  const watcherIds = mergeStrings(previous.watcherIds, incoming.watcherIds);
  const watcherCount = Math.max(
    incoming.watcherCount ?? 0,
    previous.watcherCount ?? 0,
    uploaders.length,
    watcherIds.length
  );

  return {
    ...older,
    ...newer,
    mapName,
    createdAt: earliestIso(previous.createdAt, incoming.createdAt) ?? newer.createdAt,
    playedOn: earliestIso(previous.playedOn, incoming.playedOn),
    durationSeconds: durationSeconds > 0 ? durationSeconds : null,
    players,
    parseIteration: Math.max(
      incoming.parseIteration ?? 0,
      previous.parseIteration ?? 0
    ),
    parseRows: Math.max(incoming.parseRows ?? 0, previous.parseRows ?? 0),
    uploaders,
    watcherCount,
    watcherIds,
    identityAliases: mergeStrings(
      previous.identityAliases,
      incoming.identityAliases
    ),
    watcherSessionIds: mergeStrings(
      previous.watcherSessionIds,
      incoming.watcherSessionIds
    ),
    replayFingerprints: mergeStrings(
      previous.replayFingerprints,
      incoming.replayFingerprints
    ),
    watcherVersions: mergeStrings(previous.watcherVersions, incoming.watcherVersions),
    coverageLevel: coverageLevelForWatcherCount(watcherCount),
    streams,
    primaryStream: newer.primaryStream ?? older.primaryStream ?? null,
  };
}

export function reconcileLiveGamesSnapshots(
  previous: LiveGamesSnapshot,
  incoming: LiveGamesSnapshot,
  seenAt: Map<string, number>,
  now = Date.now(),
  graceMs = LIVE_GAME_CLIENT_GRACE_MS
): LiveGamesSnapshot {
  const previousByIdentity = new Map(
    previous.activeSessions.map((session) => [
      liveSessionIdentity(session),
      session,
    ])
  );
  const completedIdentities = new Set(
    incoming.recentlyCompletedSessions.flatMap((session) => [
      liveSessionIdentity(session),
      ...(session.identityAliases ?? [])
        .map(liveSessionAliasIdentity)
        .filter(Boolean),
    ])
  );
  const activeSessions: LiveSession[] = [];
  const incomingIdentities = new Set<string>();
  const consumedPreviousIdentities = new Set<string>();
  const previousOrder = new Map(
    previous.activeSessions.map((session, index) => [
      liveSessionIdentity(session),
      index,
    ])
  );
  const stableOrder = new Map(previousOrder);
  const aliasOwners = new Map<string, Set<string>>();

  for (const session of incoming.activeSessions) {
    const canonicalIdentity = liveSessionIdentity(session);
    for (const alias of session.identityAliases ?? []) {
      const aliasIdentity = liveSessionAliasIdentity(alias);
      if (!aliasIdentity || aliasIdentity === canonicalIdentity) continue;
      const owners = aliasOwners.get(aliasIdentity) ?? new Set<string>();
      owners.add(canonicalIdentity);
      aliasOwners.set(aliasIdentity, owners);
    }
  }

  for (const session of incoming.activeSessions) {
    const identity = liveSessionIdentity(session);
    incomingIdentities.add(identity);
    seenAt.set(identity, now);
    const exactPreviousIdentities = [
      identity,
      ...(session.identityAliases ?? [])
        .map(liveSessionAliasIdentity)
        .filter(
          (aliasIdentity) =>
            Boolean(aliasIdentity) &&
            aliasOwners.get(aliasIdentity)?.size === 1
        ),
    ];
    let mergedSession = session;
    let inheritedOrder = previousOrder.get(identity);

    for (const previousIdentity of new Set(exactPreviousIdentities)) {
      const previousSession = previousByIdentity.get(previousIdentity);
      if (!previousSession) continue;
      mergedSession = mergeLiveSessionMetadata(previousSession, mergedSession);
      consumedPreviousIdentities.add(previousIdentity);
      if (previousIdentity !== identity) {
        seenAt.delete(previousIdentity);
      }
      const candidateOrder = previousOrder.get(previousIdentity);
      if (
        candidateOrder !== undefined &&
        (inheritedOrder === undefined || candidateOrder < inheritedOrder)
      ) {
        inheritedOrder = candidateOrder;
      }
    }

    if (inheritedOrder !== undefined) {
      stableOrder.set(identity, inheritedOrder);
    }
    activeSessions.push({
      ...mergedSession,
      sessionKey: session.sessionKey,
      identityAliases: mergeStrings(
        mergedSession.identityAliases,
        session.identityAliases
      ),
    });
  }

  let retainedMissingCount = 0;
  for (const [identity, session] of previousByIdentity) {
    if (incomingIdentities.has(identity)) continue;
    if (consumedPreviousIdentities.has(identity)) continue;
    if (completedIdentities.has(identity)) {
      seenAt.delete(identity);
      continue;
    }

    /*
     * A generic legacy key may be promoted to an exact platform key between
     * polls. Do not bridge that rename by watcher process ID: one process can
     * span sequential games. The conservative result is at most this bounded
     * grace period with both cards, after which the unobserved legacy card is
     * removed. Exact completion identity still removes it immediately above.
     */
    const lastSeenAt = seenAt.get(identity) ?? now;
    seenAt.set(identity, lastSeenAt);
    if (now - lastSeenAt <= graceMs) {
      activeSessions.push(session);
      retainedMissingCount += 1;
    } else {
      seenAt.delete(identity);
    }
  }

  activeSessions.sort((left, right) => {
    const leftOrder = stableOrder.get(liveSessionIdentity(left));
    const rightOrder = stableOrder.get(liveSessionIdentity(right));

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder;
    }
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;

    return compareLiveSessionOrder(left, right);
  });

  return {
    ...incoming,
    activeSessions,
    liveCount: incoming.liveCount + retainedMissingCount,
  };
}
