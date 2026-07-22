import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getPrisma } from "@/lib/prisma";
import {
  hydrateLobbyHumanEvidenceMarkers,
} from "@/lib/lobbyHumanEvidence";
import type { LobbyMatchRow } from "@/lib/lobby";
import { loadLiveSessionSnapshot } from "@/lib/liveSessionSnapshot";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import { mergeCompletedSessionsIntoLobbyMatches } from "@/lib/liveCompletedMatchSurface";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  hydrateEffectiveReplayResultAdjudications,
} from "@/lib/replayAdjudications";

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
    const response = await fetch(`${base}/api/game_stats?limit=160`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) return [];

    const hydratedRows =
      await hydrateEffectiveReplayResultAdjudications(
        getPrisma(),
        payload
      );

    const publicRows = cleanPublicGameRows(hydratedRows, {
      includeReview: true,
      includeLive: false,
    }) as LobbyMatchRow[];

    const completedSessions = await loadLiveSessionSnapshot(getPrisma())
      .then((snapshot) => snapshot.recentlyCompletedSessions)
      .catch((error) => {
        console.warn("Failed to merge completed watcher-live matches into recent matches:", error);
        return [];
      });

    const mergedRows = mergeCompletedSessionsIntoLobbyMatches(
      publicRows.slice().sort((a, b) => getLobbyMatchPlayedAtMs(b) - getLobbyMatchPlayedAtMs(a)),
      completedSessions,
      safeOffset + safeLimit
    );

    const visibleRows =
      cleanPublicGameRows(
        mergedRows,
        {
          includeReview:
            true,

          includeLive:
            false,
        }
      )
        .slice(
          safeOffset,
          safeOffset +
            safeLimit
        ) as LobbyMatchRow[];

    return hydrateLobbyHumanEvidenceMarkers(
      getPrisma(),
      visibleRows
    );
  } catch (error) {
    console.warn("Failed to load lobby recent matches:", error);
    return [];
  }
}
