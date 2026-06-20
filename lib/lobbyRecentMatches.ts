import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getPrisma } from "@/lib/prisma";
import type { LobbyMatchRow } from "@/lib/lobby";
import { loadLiveSessionSnapshot } from "@/lib/liveSessionSnapshot";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import { mergeCompletedSessionsIntoLobbyMatches } from "@/lib/liveCompletedMatchSurface";

export type LoadLobbyRecentMatchesOptions = {
  offset?: number;
  limit?: number;
};

export async function loadLobbyRecentMatches({
  offset = 0,
  limit = 24,
}: LoadLobbyRecentMatchesOptions = {}): Promise<LobbyMatchRow[]> {
  try {
    const safeOffset = Math.max(0, Math.floor(offset));
    const safeLimit = Math.max(1, Math.min(96, Math.floor(limit)));

    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    if (!Array.isArray(payload)) return [];

    const completedSessions = await loadLiveSessionSnapshot(getPrisma())
      .then((snapshot) => snapshot.recentlyCompletedSessions)
      .catch((error) => {
        console.warn("Failed to merge completed watcher-live matches into recent matches:", error);
        return [];
      });

    return mergeCompletedSessionsIntoLobbyMatches(
      payload.slice().sort((a, b) => getLobbyMatchPlayedAtMs(b) - getLobbyMatchPlayedAtMs(a)),
      completedSessions,
      safeOffset + safeLimit
    ).slice(safeOffset, safeOffset + safeLimit);
  } catch (error) {
    console.warn("Failed to load lobby recent matches:", error);
    return [];
  }
}
