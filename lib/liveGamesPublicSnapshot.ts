import type { PrismaClient } from "@/lib/generated/prisma";
import {
  loadLiveGamesSnapshot,
  type LiveGamesSnapshot,
} from "@/lib/liveGames";
import {
  cleanPublicGameRows,
  sanitizePublicLiveGamesSnapshot,
  type PublicGameStatsLike,
} from "@/lib/publicReplayTruth";

type PublicRow = PublicGameStatsLike & Record<string, unknown>;
type CompletedSession = LiveGamesSnapshot["recentlyCompletedSessions"][number] & Record<string, unknown>;

function safePositiveInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readMapName(row: PublicRow): string | null {
  const map = row.map;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    const name = (map as Record<string, unknown>).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }

  for (const key of ["mapName", "map_name"]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return null;
}

async function loadCanonicalFinalRowsById(
  prisma: PrismaClient,
  ids: number[]
): Promise<Map<number, PublicRow>> {
  if (ids.length === 0) return new Map();

  const client = prisma as unknown as {
    gameStats: {
      findMany(args: unknown): Promise<PublicRow[]>;
    };
  };

  const rows = await client.gameStats.findMany({
    where: {
      id: { in: ids },
      is_final: true,
    },
    select: {
      id: true,
      replayHash: true,
      replay_file: true,
      original_filename: true,
      winner: true,
      players: true,
      map: true,
      key_events: true,
      event_types: true,
      parse_reason: true,
      parse_source: true,
      is_final: true,
      timestamp: true,
      played_on: true,
      createdAt: true,
      parse_iteration: true,
      game_duration: true,
      disconnect_detected: true,
    },
  });

  const cleanedRows = cleanPublicGameRows(rows, {
    includeReview: true,
    includeLive: false,
  });

  const byId = new Map<number, PublicRow>();
  for (const row of cleanedRows as PublicRow[]) {
    const id = safePositiveInteger(row.id);
    if (id) byId.set(id, row);
  }

  return byId;
}

function hydrateCompletedSessionFromFinalRow(
  session: CompletedSession,
  finalRow: PublicRow | null | undefined
): CompletedSession {
  if (!finalRow) return session;

  const parsedPlayers =
    Array.isArray(finalRow.players) && finalRow.players.length > 0
      ? finalRow.players
      : session.players;

  const parsedMap = finalRow.map ?? session.map ?? null;
  const parsedMapName = readMapName(finalRow) ?? (typeof session.mapName === "string" ? session.mapName : null);

  const hydrated = {
    ...session,
    ...finalRow,

    // Keep live-session shell identity/timing/typed fields, but foreground canonical parsed truth.
    id: session.id,
    sessionKey: session.sessionKey,
    state: session.state,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    completedAt: session.completedAt,
    replayHash:
      session.replayHash ||
      String(finalRow.replayHash ?? finalRow.replay_hash ?? ""),
    parseIteration:
      typeof session.parseIteration === "number" && Number.isFinite(session.parseIteration)
        ? session.parseIteration
        : 0,

    replayFile: session.replayFile ?? finalRow.replay_file ?? finalRow.replayFile ?? null,
    originalFilename:
      session.originalFilename ??
      finalRow.original_filename ??
      finalRow.originalFilename ??
      null,

    map: parsedMap,
    mapName: parsedMapName,
    players: parsedPlayers,

    parseReason: finalRow.parse_reason ?? finalRow.parseReason ?? session.parseReason ?? null,
    parseSource: finalRow.parse_source ?? finalRow.parseSource ?? session.parseSource ?? null,

    winner: finalRow.winner ?? null,
    winnerProof: finalRow.winnerProof ?? null,
    unresolvedResult: finalRow.unresolvedResult ?? null,
    reviewNeeded: finalRow.reviewNeeded ?? false,
  };

  return hydrated as CompletedSession;
}

export async function hydrateLiveGamesSnapshotFromFinalRows(
  prisma: PrismaClient,
  snapshot: LiveGamesSnapshot
): Promise<LiveGamesSnapshot> {
  const completed = Array.isArray(snapshot.recentlyCompletedSessions)
    ? snapshot.recentlyCompletedSessions
    : [];

  const ids = Array.from(
    new Set(
      completed
        .map((session) => safePositiveInteger((session as Record<string, unknown>).id))
        .filter((id): id is number => Boolean(id))
    )
  );

  const finalRowsById = await loadCanonicalFinalRowsById(prisma, ids);

  return {
    ...snapshot,
    recentlyCompletedSessions: completed.map((session) =>
      hydrateCompletedSessionFromFinalRow(
        session as CompletedSession,
        finalRowsById.get(safePositiveInteger((session as Record<string, unknown>).id) ?? -1)
      )
    ),
  };
}

export async function loadPublicLiveGamesSnapshot(prisma: PrismaClient) {
  const snapshot = await loadLiveGamesSnapshot(prisma);
  const hydrated = await hydrateLiveGamesSnapshotFromFinalRows(prisma, snapshot);
  return sanitizePublicLiveGamesSnapshot(hydrated) as LiveGamesSnapshot;
}
