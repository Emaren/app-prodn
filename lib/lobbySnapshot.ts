import { PrismaClient } from "@/lib/generated/prisma";
import { ensureBetMarkets } from "@/lib/bets";
import { getEmptyAoe2HdPulseSnapshot, loadAoe2HdPulseSnapshot } from "@/lib/aoe2HdPulse";
import { getFeaturedTournament, getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { loadLobbyRecentMatches } from "@/lib/lobbyRecentMatches";
import { projectLobbyMatchRow } from "@/lib/lobbyMatchProjection";
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
import { featuredWarriorHonorLabel } from "@/lib/featuredWarriorPresentation";
import { trophyIsPubliclyForcedVacant } from "@/lib/trophies/service";

const LOBBY_RECENT_MATCH_INITIAL_LIMIT = 8;
const LOBBY_MAINTENANCE_INTERVAL_MS = 15_000;

let lastLobbyMaintenanceAt = 0;
let lobbyMaintenancePromise: Promise<void> | null = null;

async function loadFeaturedWarriorHonors(
  prisma: PrismaClient
) {
  try {
    const trophies =
      await prisma.trophy.findMany({
        where: {
          status: {
            in: ["held", "active"],
          },
        },
        select: {
          id: true,
          trophyId: true,
          displayName: true,
          holderSince: true,
          currentHolderDisplayName: true,
          currentHolder: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
        orderBy: [
          { holderSince: "desc" },
          { id: "desc" },
        ],
      });

    return trophies.flatMap(
      (trophy) => {
        if (trophyIsPubliclyForcedVacant(trophy.trophyId)) {
          return [];
        }

        const name =
          trophy.currentHolderDisplayName ||
          trophy.currentHolder?.inGameName ||
          trophy.currentHolder?.steamPersonaName ||
          trophy.currentHolder?.uid ||
          "";

        if (!name) {
          return [];
        }

        return [{
          uid:
            trophy.currentHolder?.uid ??
            null,
          name,
          title:
            featuredWarriorHonorLabel(
              trophy.trophyId,
              trophy.displayName
            ),
          holderSince:
            trophy.holderSince
              ?.toISOString() ??
            null,
        }];
      }
    );
  } catch (error) {
    console.warn(
      "Featured Warrior title honors unavailable:",
      error
    );
    return [];
  }
}

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
  /*
   * Cold lobby work has several independent authorities. Start them together
   * so the first request pays the slowest lane rather than the sum of WOLO,
   * tournament, replay, leaderboard and presence latency.
   */
  const woloPromise = loadWoloDevSnapshot();
  const woloMarketPromise = loadWoloMarketSnapshot();
  const tournamentPromise = getFeaturedTournament(prisma, viewerUid);
  const presencePromise = loadPublicPresenceSnapshot(prisma);
  const recentMatchesPromise = loadLobbyRecentMatches({
    offset: 0,
    limit: LOBBY_RECENT_MATCH_INITIAL_LIMIT,
  });
  const leaderboardPromise = loadLobbyLeaderboard(prisma, {
    limit: 32,
    includePendingClaimed: false,
    includeFeaturedClaimed: true,
    scope: "all",
  });
  const woloEarnersPromise = loadLobbyWoloEarnersBoard(prisma, {
    mode: "weekly",
    prefetchAlternate: true,
  });
  const aoe2hdPulsePromise = loadAoe2HdPulseSnapshot();
  const featuredWarriorHonorsPromise = loadFeaturedWarriorHonors(prisma);
  const tournamentMessagesPromise = tournamentPromise.then((tournament) =>
    getLobbyMessages(prisma, tournament.roomSlug, 24, {
      uid: viewerUid,
      guestSessionId: guestReactionSessionId,
    }),
  );

  queueLobbyMaintenance(prisma);

  try {
    const [
      wolo,
      woloMarket,
      tournament,
      tournamentMessages,
      presence,
      recentMatches,
      leaderboard,
      woloEarners,
      aoe2hdPulse,
      featuredWarriorHonors,
    ] = await Promise.all([
      woloPromise,
      woloMarketPromise,
      tournamentPromise,
      tournamentMessagesPromise,
      presencePromise,
      recentMatchesPromise,
      leaderboardPromise,
      woloEarnersPromise,
      aoe2hdPulsePromise,
      featuredWarriorHonorsPromise,
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
      recentMatches: recentMatches.map(projectLobbyMatchRow),
      leaderboard: visibleLeaderboard,
      featuredWarriorEntries,
      featuredWarriorHonors,
      wolo,
      woloEarners: visibleWoloEarners,
      aoe2hdPulse,
      liveTicker,
      woloMarket,
    };
  } catch (error) {
    console.warn("Falling back to lobby snapshot defaults:", error);

    /*
     * Preserve the existing Wolo failure semantics: if either critical Wolo
     * snapshot failed, this await rethrows instead of fabricating chain truth.
     */
    const [wolo, woloMarket] = await Promise.all([
      woloPromise,
      woloMarketPromise,
    ]);

    return {
      tournament: getFallbackTournament(false),
      messages: [],
      onlineUsers: [],
      recentMatches: (await loadLobbyRecentMatches({
        offset: 0,
        limit: LOBBY_RECENT_MATCH_INITIAL_LIMIT,
      })).map(projectLobbyMatchRow),
      leaderboard: getFallbackLeaderboard(),
      featuredWarriorEntries: [],
      featuredWarriorHonors: [],
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

export function invalidateLobbySnapshotCache() {
  lobbySnapshotCache.clear();
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
