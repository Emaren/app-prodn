import type { PrismaClient } from "@/lib/generated/prisma";
import { publicReplayWinnerTruth } from "@/lib/publicReplayTruth";
import type { LibraryOrigin } from "@/lib/libraryLedger";
import {
  reconstructLibraryOrigins,
  matchesLibraryOriginFilter,
  type LibraryHistoryRow,
  type LibraryOriginFilter,
  type LibrarySource,
} from "@/lib/libraryHistoricalProvenance";

export type LibraryHistoricalEntry = {
  id: number;
  userUid: string | null;
  createdAt: Date;
  source: LibrarySource;
  unknownOutcome: boolean;
  checkpoint: boolean;
  ordinal: number;
};

export type LibraryPlayerOriginCounts = {
  count: number;
  unknown: number;
  checkpoints: number;
  inferred: number;
};

export type LibraryPlayerCensus = {
  uid: string;
  name: string;
  href: string;
  total: number;
  unknown: number;
  byOrigin: Record<LibraryOrigin, LibraryPlayerOriginCounts>;
};

export type LibraryHistoricalSnapshot = {
  generatedAt: string;
  total: number;
  last24h: number;
  entries: LibraryHistoricalEntry[];
  byId: Map<number, LibraryHistoricalEntry>;
  profiles: LibraryPlayerCensus[];
  totalByOrigin: Record<LibraryOrigin, LibraryPlayerOriginCounts>;
};

const ORIGINS = [
  "watcher-live", "watcher-batch", "watcher-legacy",
  "manual", "manual-zip", "unclassified",
] as const satisfies readonly LibraryOrigin[];

const SNAPSHOT_TTL_MS = 20_000;
let snapshotCache: { at: number; value: LibraryHistoricalSnapshot } | null = null;
let snapshotPromise: Promise<LibraryHistoricalSnapshot> | null = null;

function emptyCounts(): LibraryPlayerOriginCounts {
  return { count: 0, unknown: 0, checkpoints: 0, inferred: 0 };
}
function emptyOrigins(): Record<LibraryOrigin, LibraryPlayerOriginCounts> {
  return Object.fromEntries(ORIGINS.map(origin => [origin, emptyCounts()])) as
    Record<LibraryOrigin, LibraryPlayerOriginCounts>;
}

export function selectLibraryHistoryPage(
  snapshot: LibraryHistoricalSnapshot,
  options: {
    filter: LibraryOriginFilter;
    before: number | null;
    after: number | null;
    limit: number;
  },
) {
  const eligible = snapshot.entries.filter(row =>
    matchesLibraryOriginFilter(row.source.kind, options.filter));
  const after = options.after;
  const before = options.before;
  const selected = after !== null
    ? eligible.filter(row => row.id > after).reverse()
    : eligible.filter(row => before === null || row.id < before);
  const hasMore = selected.length > options.limit;
  const chosen = selected.slice(0, options.limit);
  const rows = options.after !== null ? chosen.reverse() : chosen;
  return {
    rows,
    hasMore,
    filterTotal: eligible.length,
    nextBefore: rows.length ? Math.min(...rows.map(row => row.id)) : null,
    latestId: rows.length ? Math.max(...rows.map(row => row.id)) : null,
  };
}

async function buildSnapshot(prisma: PrismaClient): Promise<LibraryHistoricalSnapshot> {
  const [games, users, packages, batchReceipts] = await Promise.all([
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: { id: "desc" },
      select: {
        id: true,
        userUid: true,
        replayHash: true,
        createdAt: true,
        original_filename: true,
        replay_file: true,
        parse_source: true,
        parse_reason: true,
        key_events: true,
        event_types: true,
        players: true,
        winner: true,
        disconnect_detected: true,
        is_final: true,
      },
    }),
    prisma.user.findMany({
      select: {
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        steamId: true,
      },
    }),
    prisma.userActivityEvent.findMany({
      where: {
        type: "replay_upload",
        metadata: { path: ["packageUpload"], equals: true },
      },
      select: {
        createdAt: true,
        metadata: true,
        user: { select: { uid: true } },
      },
    }),
    prisma.watcherClientEvent.findMany({
      where: {
        eventType: "batch_upload_file_succeeded",
        replayHash: { not: null },
      },
      select: {
        createdAt: true,
        userUid: true,
        replayHash: true,
      },
    }),
  ]);

  const historyRows: LibraryHistoryRow[] = games.map(game => ({
    id: game.id,
    userUid: game.userUid,
    createdAt: game.createdAt,
    replayHash: game.replayHash,
    original_filename: game.original_filename,
    replay_file: game.replay_file,
    parse_source: game.parse_source,
    key_events: game.key_events,
  }));
  const sources = reconstructLibraryOrigins(
    historyRows,
    packages.map(receipt => ({
      createdAt: receipt.createdAt,
      uid: receipt.user?.uid ?? null,
      metadata: receipt.metadata,
    })),
    batchReceipts,
  );

  const accountByUid = new Map(users.map(user => [user.uid, user]));
  const profilesByUid = new Map<string, LibraryPlayerCensus>();
  for (const user of users) {
    if (user.uid === "system") continue;
    // Same named-site-account boundary as claimed profiles; a mere replay
    // participant or unregistered Steam ID never enters this census.
    const name = user.inGameName?.trim() || user.steamPersonaName?.trim();
    if (!name) continue;
    profilesByUid.set(user.uid, {
      uid: user.uid,
      name,
      href: `/players/${encodeURIComponent(user.uid)}`,
      total: 0,
      unknown: 0,
      byOrigin: emptyOrigins(),
    });
  }

  const totalByOrigin = emptyOrigins();
  const entries: LibraryHistoricalEntry[] = games.map((game, index) => {
    const source = sources.get(game.id) ?? {
      kind: "unclassified", evidence: "unclassified",
    } satisfies LibrarySource;
    const isCheckpoint = (game.original_filename || game.replay_file)
      .toLowerCase().endsWith(".aoe2mpgame");
    const outcome = publicReplayWinnerTruth({
      id: game.id,
      winner: game.winner,
      players: game.players,
      key_events: game.key_events,
      event_types: game.event_types,
      parse_reason: game.parse_reason,
      parse_source: game.parse_source,
      disconnect_detected: game.disconnect_detected,
      is_final: game.is_final,
    });
    const unknownOutcome = !isCheckpoint && !outcome.statsEligible;
    const inferred = source.evidence === "zip-legacy-correlation";
    const count = totalByOrigin[source.kind];
    count.count++;
    if (unknownOutcome) count.unknown++;
    if (isCheckpoint) count.checkpoints++;
    if (inferred) count.inferred++;

    const owner = accountByUid.get(game.userUid ?? "");
    const account = owner ? profilesByUid.get(owner.uid) : null;
    if (account) {
      account.total++;
      if (unknownOutcome) account.unknown++;
      const bucket = account.byOrigin[source.kind];
      bucket.count++;
      if (unknownOutcome) bucket.unknown++;
      if (isCheckpoint) bucket.checkpoints++;
      if (inferred) bucket.inferred++;
    }
    return {
      id: game.id,
      userUid: game.userUid,
      createdAt: game.createdAt,
      source,
      unknownOutcome,
      checkpoint: isCheckpoint,
      ordinal: games.length - index,
    };
  });

  const now = Date.now();
  return {
    generatedAt: new Date(now).toISOString(),
    total: entries.length,
    last24h: entries.filter(row =>
      row.createdAt.getTime() >= now - 24 * 60 * 60_000).length,
    entries,
    byId: new Map(entries.map(row => [row.id, row])),
    profiles: [...profilesByUid.values()]
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    totalByOrigin,
  };
}

/** A coalesced read-only census; never modifies original replay or telemetry. */
export async function loadLibraryHistoricalSnapshot(
  prisma: PrismaClient,
): Promise<LibraryHistoricalSnapshot> {
  if (snapshotCache && Date.now() - snapshotCache.at < SNAPSHOT_TTL_MS) {
    return snapshotCache.value;
  }
  if (snapshotPromise) return snapshotPromise;
  snapshotPromise = buildSnapshot(prisma);
  try {
    const result = await snapshotPromise;
    snapshotCache = { at: Date.now(), value: result };
    return result;
  } finally {
    snapshotPromise = null;
  }
}
