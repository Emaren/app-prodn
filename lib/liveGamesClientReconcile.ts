import type { LiveGamesSnapshot } from "./liveGames.ts";
import { normalizePublicReplayText } from "./unresolvedWatcherResult.ts";

type LiveSession = LiveGamesSnapshot["activeSessions"][number];

export const LIVE_GAME_CLIENT_GRACE_MS = 8 * 60_000;

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
  for (const value of [
    session.updatedAt,
    session.playedOn,
    session.createdAt,
  ]) {
    const ms = new Date(value ?? "").getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function startedMs(session: LiveSession) {
  for (const value of [
    session.playedOn,
    session.createdAt,
    session.updatedAt,
  ]) {
    const ms = new Date(value ?? "").getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return Number.MAX_SAFE_INTEGER;
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

  return {
    ...older,
    ...newer,
    mapName,
    durationSeconds: durationSeconds > 0 ? durationSeconds : null,
    players,
    parseIteration: Math.max(
      incoming.parseIteration ?? 0,
      previous.parseIteration ?? 0
    ),
    parseRows: Math.max(incoming.parseRows ?? 0, previous.parseRows ?? 0),
    uploaders,
    watcherCount: Math.max(
      incoming.watcherCount ?? 0,
      previous.watcherCount ?? 0,
      uploaders.length
    ),
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
    incoming.recentlyCompletedSessions.map(liveSessionIdentity)
  );
  const activeSessions: LiveSession[] = [];
  const incomingIdentities = new Set<string>();

  for (const session of incoming.activeSessions) {
    const identity = liveSessionIdentity(session);
    incomingIdentities.add(identity);
    seenAt.set(identity, now);
    const previousSession = previousByIdentity.get(identity);
    activeSessions.push(
      previousSession
        ? mergeLiveSessionMetadata(previousSession, session)
        : session
    );
  }

  let retainedMissingCount = 0;
  for (const [identity, session] of previousByIdentity) {
    if (incomingIdentities.has(identity)) continue;
    if (completedIdentities.has(identity)) {
      seenAt.delete(identity);
      continue;
    }

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
    const startedDiff = startedMs(left) - startedMs(right);
    if (startedDiff !== 0) return startedDiff;
    const activityDiff = activityMs(right) - activityMs(left);
    if (activityDiff !== 0) return activityDiff;
    return liveSessionIdentity(left).localeCompare(liveSessionIdentity(right));
  });

  return {
    ...incoming,
    activeSessions,
    liveCount: incoming.liveCount + retainedMissingCount,
  };
}
