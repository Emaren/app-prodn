import { PrismaClient } from "@/lib/generated/prisma";
import { ensureBetMarkets } from "@/lib/bets";
import { getEmptyAoe2HdPulseSnapshot, loadAoe2HdPulseSnapshot } from "@/lib/aoe2HdPulse";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getFeaturedTournament, getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";
import { mergeCompletedSessionsIntoLobbyMatches } from "@/lib/liveCompletedMatchSurface";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import { getFallbackLiveTickerSnapshot, loadLiveTickerSnapshot } from "@/lib/liveTicker";
import { loadLiveSessionSnapshot } from "@/lib/liveSessionSnapshot";
import {
  LOBBY_ROOM_SLUG,
  getFallbackLeaderboard,
  getFallbackTournament,
  getFallbackWoloEarnersBoard,
  type LobbyMatchRow,
  type LobbyOnlineUser,
  type LobbySnapshot,
} from "@/lib/lobby";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";
import { loadWoloMarketSnapshot } from "@/lib/woloMarket";

const LOBBY_RECENT_MATCH_INITIAL_LIMIT = 12;
const LOBBY_MAINTENANCE_INTERVAL_MS = 15_000;

let lastLobbyMaintenanceAt = 0;
let lobbyMaintenancePromise: Promise<void> | null = null;

function queueLobbyMaintenance(prisma: PrismaClient) {
  const now = Date.now();

  if (
    lobbyMaintenancePromise ||
    now - lastLobbyMaintenanceAt <
      LOBBY_MAINTENANCE_INTERVAL_MS
  ) {
    return;
  }

  lastLobbyMaintenanceAt = now;

  lobbyMaintenancePromise = Promise.resolve()
    .then(() => reconcileTournamentMatchProofs(prisma))
    .then(() => ensureBetMarkets(prisma))
    .catch((error) => {
      console.warn(
        "Background lobby maintenance failed:",
        error
      );
    })
    .finally(() => {
      lobbyMaintenancePromise = null;
    });
}

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats?limit=128`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    if (!Array.isArray(payload)) return [];

    const publicRows = cleanPublicGameRows(payload, {
      includeReview: true,
      includeLive: false,
    }) as LobbyMatchRow[];

    return publicRows
      .slice()
      .sort((a, b) => getLobbyMatchPlayedAtMs(b) - getLobbyMatchPlayedAtMs(a))
      .slice(0, LOBBY_RECENT_MATCH_INITIAL_LIMIT);
  } catch (error) {
    console.warn("Failed to load recent matches for lobby:", error);
    return [];
  }
}

async function loadOnlineUsers(prisma: PrismaClient): Promise<LobbyOnlineUser[]> {
  try {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const users = await prisma.user.findMany({
      where: {
        inGameName: { not: null },
        lastSeen: { gt: twoMinutesAgo },
      },
      orderBy: { lastSeen: "desc" },
      select: {
        uid: true,
        inGameName: true,
        verified: true,
        verificationLevel: true,
      },
      take: 12,
    });

    return users.map(
      (user) =>
        ({
          uid: user.uid,
          in_game_name: user.inGameName || user.uid,
          verified: user.verified,
          verificationLevel: user.verificationLevel,
        }) satisfies LobbyOnlineUser
    );
  } catch (error) {
    console.warn("Failed to load online users for lobby:", error);
    return [];
  }
}

async function loadLobbySnapshotFresh(
  prisma: PrismaClient,
  viewerUid?: string | null,
  guestReactionSessionId?: string | null
): Promise<LobbySnapshot> {
  const [wolo, woloMarket] = await Promise.all([
    loadWoloDevSnapshot(),
    loadWoloMarketSnapshot(),
  ]);

  queueLobbyMaintenance(prisma);

  try {
    const tournament = await getFeaturedTournament(prisma, viewerUid);

    const [
      tournamentMessages,
      onlineUsers,
      baseRecentMatches,
      leaderboard,
      woloEarners,
      aoe2hdPulse,
      liveSessionSnapshot,
    ] = await Promise.all([
      getLobbyMessages(prisma, tournament.roomSlug, 24, {
        uid: viewerUid,
        guestSessionId: guestReactionSessionId,
      }),
      loadOnlineUsers(prisma),
      loadRecentMatches(),
      loadLobbyLeaderboard(prisma, { limit: 256, includePendingClaimed: false }),
      loadLobbyWoloEarnersBoard(prisma, { mode: "weekly" }),
      loadAoe2HdPulseSnapshot(),
      loadLiveSessionSnapshot(prisma),
    ]);
    const visibleWoloEarners = woloEarners;

    const recentMatches = cleanPublicGameRows(
      mergeCompletedSessionsIntoLobbyMatches(
        baseRecentMatches,
        liveSessionSnapshot.recentlyCompletedSessions,
        LOBBY_RECENT_MATCH_INITIAL_LIMIT
      ),
      {
        includeReview: true,
        includeLive: false,
      }
    ) as LobbyMatchRow[];
    const liveTicker = await loadLiveTickerSnapshot(prisma, {
      tournament,
      leaderboard,
      recentMatches,
      woloMarket,
    });

    const messages =
      tournamentMessages.length > 0 || tournament.roomSlug === LOBBY_ROOM_SLUG
        ? tournamentMessages
        : await getLobbyMessages(prisma, LOBBY_ROOM_SLUG, 24, {
            uid: viewerUid,
            guestSessionId: guestReactionSessionId,
          });

    return {
      tournament,
      messages,
      onlineUsers,
      recentMatches,
      leaderboard,
      wolo,
      woloEarners: visibleWoloEarners,
      aoe2hdPulse,
      liveTicker,
      woloMarket,
    };
  } catch (error) {
    console.warn("Falling back to lobby snapshot defaults:", error);

    return {
      tournament: getFallbackTournament(false),
      messages: [],
      onlineUsers: [],
      recentMatches: cleanPublicGameRows(await loadRecentMatches(), {
        includeReview: true,
        includeLive: false,
      }) as LobbyMatchRow[],
      leaderboard: getFallbackLeaderboard(),
      wolo,
      woloEarners: getFallbackWoloEarnersBoard(),
      aoe2hdPulse: getEmptyAoe2HdPulseSnapshot(),
      liveTicker: getFallbackLiveTickerSnapshot(),
      woloMarket,
    };
  }
}
type LobbySnapshotCacheEntry = {
  expiresAt: number;
  staleUntil: number;
  refreshing: boolean;
  value: Awaited<ReturnType<typeof loadLobbySnapshotFresh>>;
};

const LOBBY_SNAPSHOT_CACHE_TTL_MS = 15000;
const LOBBY_SNAPSHOT_STALE_TTL_MS = 10 * 60 * 1000;
const lobbySnapshotCache = new Map<string, LobbySnapshotCacheEntry>();

async function attachCanonicalRecentMatches(
  snapshot: LobbySnapshotCacheEntry["value"]
): Promise<LobbySnapshotCacheEntry["value"]> {
  try {
    const recentMatches = await loadLobbyRecentMatches({
      offset: 0,
      limit: LOBBY_RECENT_MATCH_INITIAL_LIMIT,
    });

    if (recentMatches.length === 0) {
      return snapshot;
    }

    return {
      ...snapshot,
      recentMatches,
    };
  } catch (error) {
    console.warn(
      "Failed to attach canonical recent matches to lobby snapshot:",
      error
    );

    return snapshot;
  }
}

export async function loadLobbySnapshot(
  prisma: Parameters<typeof loadLobbySnapshotFresh>[0],
  viewerUid: Parameters<typeof loadLobbySnapshotFresh>[1],
  guestReactionSessionId: Parameters<typeof loadLobbySnapshotFresh>[2]
) {
  const now = Date.now();
  const cacheKey = `${viewerUid || "anon"}:${guestReactionSessionId || "no-guest"}`;
  const cached = lobbySnapshotCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (cached && cached.staleUntil > now) {
    if (!cached.refreshing) {
      cached.refreshing = true;

      void loadLobbySnapshotFresh(
        prisma,
        viewerUid,
        guestReactionSessionId
      )
        .then(attachCanonicalRecentMatches)
        .then((value) => {
          const refreshedAt = Date.now();

          lobbySnapshotCache.set(cacheKey, {
            expiresAt:
              refreshedAt +
              LOBBY_SNAPSHOT_CACHE_TTL_MS,
            staleUntil:
              refreshedAt +
              LOBBY_SNAPSHOT_STALE_TTL_MS,
            refreshing: false,
            value,
          });
        })
        .catch((error) => {
          console.error("Failed to refresh lobby snapshot cache:", error);
          const current = lobbySnapshotCache.get(cacheKey);

          if (current) {
            current.refreshing = false;
          }
        });
    }

    return cached.value;
  }

  const value = await attachCanonicalRecentMatches(
    await loadLobbySnapshotFresh(
      prisma,
      viewerUid,
      guestReactionSessionId
    )
  );

  lobbySnapshotCache.set(cacheKey, {
    expiresAt: now + LOBBY_SNAPSHOT_CACHE_TTL_MS,
    staleUntil: now + LOBBY_SNAPSHOT_STALE_TTL_MS,
    refreshing: false,
    value,
  });

  if (lobbySnapshotCache.size > 128) {
    for (const [key, entry] of lobbySnapshotCache) {
      if (entry.staleUntil <= now || lobbySnapshotCache.size > 96) {
        lobbySnapshotCache.delete(key);
      }
    }
  }

  return value;
}
