import { PrismaClient } from "@/lib/generated/prisma";
import { ensureBetMarkets } from "@/lib/bets";
import { getEmptyAoe2HdPulseSnapshot, loadAoe2HdPulseSnapshot } from "@/lib/aoe2HdPulse";
import { getFeaturedTournament, getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import { getFallbackLiveTickerSnapshot, loadLiveTickerSnapshot } from "@/lib/liveTicker";
import {
  LOBBY_ROOM_SLUG,
  getFallbackLeaderboard,
  getFallbackTournament,
  getFallbackWoloEarnersBoard,
  type LobbySnapshot,
} from "@/lib/lobby";
import { loadPublicPresenceSnapshot } from "@/lib/publicPresence";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";
import { loadWoloMarketSnapshot } from "@/lib/woloMarket";

const LOBBY_RECENT_MATCH_INITIAL_LIMIT = 8;
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
      presence,
      recentMatches,
      leaderboard,
      woloEarners,
      aoe2hdPulse,
    ] = await Promise.all([
      getLobbyMessages(prisma, tournament.roomSlug, 24, {
        uid: viewerUid,
        guestSessionId: guestReactionSessionId,
      }),
      loadPublicPresenceSnapshot(prisma),
      loadLobbyRecentMatches({
        offset: 0,
        limit: LOBBY_RECENT_MATCH_INITIAL_LIMIT,
      }),
      loadLobbyLeaderboard(prisma, {
        limit: 32,
        includePendingClaimed: false,
        includeFeaturedClaimed: true,
        scope: "all",
      }),
      loadLobbyWoloEarnersBoard(prisma, {
        mode: "weekly",
        prefetchAlternate: true,
      }),
      loadAoe2HdPulseSnapshot(),
    ]);
    const visibleLeaderboard = {
      ...leaderboard,
      // The hero count and visible roster must be one presence sample.
      activePlayers: presence.activePlayers,
      entries: leaderboard.entries.slice(0, 32),
    };

    const featuredWarriorEntries = leaderboard.entries.filter(
      (entry) =>
        entry.claimed &&
        Boolean(entry.uid) &&
        Boolean(entry.hasFeaturedAvatar)
    );

    const visibleWoloEarners =
      woloEarners && Array.isArray(woloEarners.entries)
        ? {
            ...woloEarners,
            entries: woloEarners.entries.slice(0, 16),
            prefetchedEntriesByMode: woloEarners.prefetchedEntriesByMode
              ? {
                  weekly:
                    woloEarners.prefetchedEntriesByMode.weekly?.slice(0, 16) ??
                    [],
                  all_time:
                    woloEarners.prefetchedEntriesByMode.all_time?.slice(0, 16) ??
                    [],
                }
              : undefined,
          }
        : woloEarners;

    const liveTicker = await loadLiveTickerSnapshot(prisma, {
      tournament,
      leaderboard: visibleLeaderboard,
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
      onlineUsers: presence.onlineUsers,
      recentMatches,
      leaderboard: visibleLeaderboard,
      featuredWarriorEntries,
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
      recentMatches: await loadLobbyRecentMatches({
        offset: 0,
        limit: LOBBY_RECENT_MATCH_INITIAL_LIMIT,
      }),
      leaderboard: getFallbackLeaderboard(),
      featuredWarriorEntries: [],
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

  const value = await loadLobbySnapshotFresh(
    prisma,
    viewerUid,
    guestReactionSessionId
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
