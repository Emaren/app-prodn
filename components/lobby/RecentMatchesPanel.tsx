"use client";

import { formatLobbyMoment } from "@/components/lobby/utils";
import Link from "next/link";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import {
  outcomeBadgeLabel,
  parsePlayers as parseReplayPlayers,
  winnerLabel,
} from "@/lib/gameStatsView";
import type { LobbyMatchRow } from "@/lib/lobby";
import { pickLobbyMatchPlayedAt } from "@/lib/lobbyMatchTime";
import {
  normalizePublicReplayText,
  publicReplayMapLabel,
} from "@/lib/unresolvedWatcherResult";

const MATCH_FEED_PAGE_SIZE = 24;
const MATCH_FEED_REFRESH_MS = 15_000;

type RecentMatchesResponse = {
  ok?: boolean;
  matches?: LobbyMatchRow[];
  nextOffset?: number;
  hasMore?: boolean;
};

type RecentMatchesPanelProps = {
  recentMatches: LobbyMatchRow[];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  surface?: "standard" | "extreme";
};

function readMatchPlayersForTruth(match: LobbyMatchRow) {
  const raw = (match as { players?: unknown }).players;

  if (Array.isArray(raw)) {
    return raw.filter(
      (player): player is Record<string, unknown> =>
        Boolean(player) &&
        typeof player === "object" &&
        !Array.isArray(player)
    );
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        return parsed.filter(
          (player): player is Record<string, unknown> =>
            Boolean(player) &&
            typeof player === "object" &&
            !Array.isArray(player)
        );
      }
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeTruthWinner(value: unknown) {
  const winner = String(value || "").trim();

  if (!winner || winner.toLowerCase() === "unknown") {
    return "";
  }

  return winner;
}

function matchTruthScore(match: LobbyMatchRow) {
  const candidate = match as LobbyMatchRow & {
    winnerProof?: unknown;
    reviewNeeded?: unknown;
    unresolvedResult?: unknown;
    parse_reason?: unknown;
    parseReason?: unknown;
  };

  const directWinner = normalizeTruthWinner(candidate.winner);

  const markedWinners = readMatchPlayersForTruth(match).filter(
    (player) =>
      player.winner === true &&
      normalizeTruthWinner(player.name)
  );

  const unresolved =
    candidate.unresolvedResult &&
    typeof candidate.unresolvedResult === "object";

  const parseReason = String(
    candidate.parse_reason || candidate.parseReason || ""
  ).toLowerCase();

  let score = 0;

  if (directWinner) score += 1000;
  if (markedWinners.length > 0) score += 700;

  if (candidate.reviewNeeded === false) score += 120;
  if (candidate.reviewNeeded === true) score -= 180;

  if (!unresolved) score += 80;
  if (unresolved) score -= 40;

  if (candidate.winnerProof) score += 40;

  if (parseReason === "recorded_resignation_final") {
    score += 80;
  } else if (
    parseReason ===
      "watcher_inferred_opponent_win_on_incomplete_1v1" ||
    parseReason === "watcher_inferred_opponent_win_on_incomplete"
  ) {
    score += 30;
  }

  return score;
}

function matchRenderFingerprint(
  match: LobbyMatchRow
) {
  const candidate = match as LobbyMatchRow & {
    winnerProof?: unknown;
    reviewNeeded?: unknown;
    unresolvedResult?: unknown;
    parseReason?: unknown;
  };

  return JSON.stringify({
    map: candidate.map,
    players: candidate.players,
    winner: candidate.winner,
    winnerProof: candidate.winnerProof,
    reviewNeeded: candidate.reviewNeeded,
    unresolvedResult: candidate.unresolvedResult,
    parseReason:
      candidate.parse_reason ||
      candidate.parseReason ||
      "",
    playedAt: pickLobbyMatchPlayedAt(match),
  });
}

function mergeMatchLists(
  primary: LobbyMatchRow[],
  secondary: LobbyMatchRow[],
  preserveSecondaryWhenIdentical = false
) {
  const order: number[] = [];
  const byId = new Map<number, LobbyMatchRow>();

  for (const match of [...primary, ...secondary]) {
    if (!byId.has(match.id)) {
      order.push(match.id);
      byId.set(match.id, match);
      continue;
    }

    const current = byId.get(match.id)!;
    const currentScore = matchTruthScore(current);
    const incomingScore = matchTruthScore(match);

    if (incomingScore > currentScore) {
      byId.set(match.id, match);
      continue;
    }

    if (
      preserveSecondaryWhenIdentical &&
      incomingScore === currentScore &&
      matchRenderFingerprint(match) ===
        matchRenderFingerprint(current)
    ) {
      // Primary controls ordering and supplies fresher truth when
      // something changed. For identical rows, retain the existing
      // client object so React has nothing to repaint.
      byId.set(match.id, match);
    }
  }

  const merged = order
    .map((id) => byId.get(id))
    .filter(
      (match): match is LobbyMatchRow =>
        Boolean(match)
    );

  if (
    preserveSecondaryWhenIdentical &&
    merged.length === secondary.length &&
    merged.every(
      (match, index) =>
        match === secondary[index]
    )
  ) {
    return secondary;
  }

  return merged;
}

export function RecentMatchesPanel({
  recentMatches,
  themeKey,
  viewMode,
  surface = "standard",
}: RecentMatchesPanelProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";

  const [matches, setMatches] = useState(recentMatches);
  const [hasMoreMatches, setHasMoreMatches] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const matchesRef = useRef(matches);
  const loadingRef = useRef(false);
  const refreshingLatestRef = useRef(false);
  const hasMoreRef = useRef(true);
  const matchFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const matchFeedSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMatches((current) => mergeMatchLists(recentMatches, current, true));

    if (recentMatches.length > 0) {
      hasMoreRef.current = true;
      setHasMoreMatches(true);
    }
  }, [recentMatches]);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    hasMoreRef.current = hasMoreMatches;
  }, [hasMoreMatches]);

  const refreshLatestMatches = useCallback(async () => {
    if (refreshingLatestRef.current) return;

    refreshingLatestRef.current = true;

    try {
      const response = await fetch(
        `/api/lobby/recent-matches?offset=0&limit=${MATCH_FEED_PAGE_SIZE}&refresh=${Date.now()}`,
        {
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      if (!response.ok) return;

      const payload =
        (await response.json()) as RecentMatchesResponse;

      const latestMatches = Array.isArray(payload.matches)
        ? payload.matches
        : [];

      if (latestMatches.length === 0) return;

      // The fresh page goes first. Existing rows with the same ID are
      // discarded, so repaired winner truth replaces stale client truth.
      setMatches((current) =>
        mergeMatchLists(latestMatches, current, true)
      );
    } catch (error) {
      console.warn(
        "Failed to refresh latest lobby matches:",
        error
      );
    } finally {
      refreshingLatestRef.current = false;
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshLatestMatches();
      }
    };

    const firstRefresh = window.setTimeout(
      refreshIfVisible,
      700
    );

    const interval = window.setInterval(
      refreshIfVisible,
      MATCH_FEED_REFRESH_MS
    );

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener(
      "visibilitychange",
      refreshIfVisible
    );

    return () => {
      window.clearTimeout(firstRefresh);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener(
        "visibilitychange",
        refreshIfVisible
      );
    };
  }, [refreshLatestMatches]);

  const loadMoreMatches = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const offset = matchesRef.current.length;
      const response = await fetch(
        `/api/lobby/recent-matches?offset=${offset}&limit=${MATCH_FEED_PAGE_SIZE}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        hasMoreRef.current = false;
        setHasMoreMatches(false);
        return;
      }

      const payload = (await response.json()) as RecentMatchesResponse;
      const nextMatches = Array.isArray(payload.matches) ? payload.matches : [];

      if (nextMatches.length === 0) {
        hasMoreRef.current = false;
        setHasMoreMatches(false);
        return;
      }

      setMatches((current) => mergeMatchLists(current, nextMatches));

      const nextHasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : nextMatches.length >= MATCH_FEED_PAGE_SIZE;

      hasMoreRef.current = nextHasMore;
      setHasMoreMatches(nextHasMore);
    } catch (error) {
      console.warn("Failed to load more lobby matches:", error);
      hasMoreRef.current = false;
      setHasMoreMatches(false);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  const maybeLoadMoreMatches = useCallback(() => {
    if (loadingRef.current || !hasMoreRef.current) return;

    const viewport = matchFeedScrollRef.current;
    if (!viewport) return;

    const distanceFromBottom =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;

    const needsMoreRows = viewport.scrollHeight <= viewport.clientHeight + 24;
    const nearBottom = distanceFromBottom <= 320;

    if (needsMoreRows || nearBottom) {
      void loadMoreMatches();
    }
  }, [loadMoreMatches]);

  useEffect(() => {
    if (!hasMoreMatches || isLoadingMore) return;

    const frame = window.requestAnimationFrame(maybeLoadMoreMatches);
    const settleTimer = window.setTimeout(maybeLoadMoreMatches, 180);
    const lateTimer = window.setTimeout(maybeLoadMoreMatches, 520);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      window.clearTimeout(lateTimer);
    };
  }, [matches.length, hasMoreMatches, isLoadingMore, maybeLoadMoreMatches]);

  useEffect(() => {
    const root = matchFeedScrollRef.current;
    const target = matchFeedSentinelRef.current;

    if (!root || !target || !hasMoreMatches || isLoadingMore) return;

    if (typeof IntersectionObserver === "undefined") {
      maybeLoadMoreMatches();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMoreMatches();
        }
      },
      {
        root,
        rootMargin: "280px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [matches.length, hasMoreMatches, isLoadingMore, loadMoreMatches, maybeLoadMoreMatches]);

  return (
    <div
      className={`flex max-h-[min(76dvh,50rem)] flex-col overflow-hidden rounded-[1.75rem] border p-5 sm:p-6 ${
        isExtreme
          ? "border-amber-200/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[0_26px_88px_rgba(0,0,0,0.28)]"
          : tone.panelShell
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>
            Match Feed
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            Recent Parsed Games
          </h3>
        </div>
      </div>

      <div
        ref={matchFeedScrollRef}
        className="mt-5 min-h-0 max-h-[min(52dvh,32rem)] transform-gpu overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch] [will-change:scroll-position] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-busy={isLoadingMore}
      >
        <div className="space-y-3">
          {matches.length === 0 ? (
            <p className={`rounded-2xl border px-4 py-5 text-sm text-slate-300 ${tone.card}`}>
              Parsed matches will show here as soon as the watcher uploads them.
            </p>
          ) : (
            <>
              {matches.map((match) => (
                <MatchCard
                  key={match.id}
                  match={match}
                  themeKey={themeKey}
                  viewMode={viewMode}
                />
              ))}

              {hasMoreMatches ? (
                <div ref={matchFeedSentinelRef} className="h-px" aria-hidden="true" />
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}


type ReplayTruthResult = {
  code?: string | null;
  label?: string | null;
  reviewNeeded?: boolean | null;
};

function readReplayTruthResult(match: LobbyMatchRow): ReplayTruthResult | null {
  const value = (match as { unresolvedResult?: unknown }).unresolvedResult;

  if (!value || typeof value !== "object") return null;

  return value as ReplayTruthResult;
}

function readReplayTruthReviewNeeded(match: LobbyMatchRow, result: ReplayTruthResult | null) {
  return (match as { reviewNeeded?: unknown }).reviewNeeded === true || result?.reviewNeeded === true;
}

function normalizeLobbyWinnerName(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readLobbyMatchPlayers(match: LobbyMatchRow) {
  const value = (match as { players?: unknown }).players;

  if (Array.isArray(value)) {
    return value.filter(
      (player): player is Record<string, unknown> =>
        Boolean(player) && typeof player === "object" && !Array.isArray(player)
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (player): player is Record<string, unknown> =>
            Boolean(player) && typeof player === "object" && !Array.isArray(player)
        );
      }
    } catch {
      return [];
    }
  }

  return [];
}

function readMarkedPlayerWinner(match: LobbyMatchRow) {
  const players = readLobbyMatchPlayers(match);
  const winner = players.find((player) => player.winner === true);
  return normalizeLobbyWinnerName(winner?.name);
}

function readOldWatcherInferredOpponentWinner(match: LobbyMatchRow) {
  const parseReason = normalizeLobbyWinnerName(match.parse_reason).toLowerCase();

  if (parseReason !== "watcher_inferred_opponent_win_on_incomplete_1v1") {
    return "";
  }

  const players = readLobbyMatchPlayers(match);
  const namedPlayers = players
    .map((player) => normalizeLobbyWinnerName(player.name))
    .filter(Boolean);

  if (namedPlayers.length !== 2) return "";

  const ownerName =
    normalizeLobbyWinnerName((match as { ownerPlayerName?: unknown }).ownerPlayerName) ||
    normalizeLobbyWinnerName((match as { owner_player_name?: unknown }).owner_player_name) ||
    normalizeLobbyWinnerName((match as { ownerDisplayName?: unknown }).ownerDisplayName);

  if (ownerName) {
    const ownerLower = ownerName.toLowerCase();
    const opponent = namedPlayers.find((name) => name.toLowerCase() !== ownerLower);
    if (opponent) return opponent;
  }

  const emarenOpponent = namedPlayers.find((name) => name.toLowerCase() !== "emaren");
  return emarenOpponent || "";
}

function getLobbyMatchResultDisplay(match: LobbyMatchRow) {
  const rawWinner = normalizeLobbyWinnerName(match.winner);
  const markedPlayerWinner = readMarkedPlayerWinner(match);
  const oldWatcherWinner = readOldWatcherInferredOpponentWinner(match);
  const truthResult = readReplayTruthResult(match);
  const reviewNeeded = readReplayTruthReviewNeeded(match, truthResult);
  const resolvedWinner =
    rawWinner || markedPlayerWinner || oldWatcherWinner;

  const winnerProof = normalizeLobbyWinnerName(
    (match as { winnerProof?: unknown }).winnerProof
  );

  const acceptedPublicFallback =
    winnerProof === "historical_inferred_fallback";

  if (resolvedWinner) {
    // The public replay sanitizer has already made the product-level
    // decision to expose this historical fallback winner. Do not run
    // that accepted public result back through the stricter settlement
    // validator, which intentionally rejects inference-only evidence.
    if (acceptedPublicFallback) {
      return {
        headline: resolvedWinner,
        pill: "Replay result",
      };
    }

    return {
      headline: winnerLabel(
        resolvedWinner,
        match.parse_reason
      ),
      pill: outcomeBadgeLabel(
        match.parse_reason,
        resolvedWinner
      ),
    };
  }

  if (!reviewNeeded) {
    return {
      headline: truthResult?.label || "Completed",
      pill: null,
    };
  }

  return {
    headline: "Battle filed",
    pill: null,
  };
}

const MatchCard = memo(function MatchCard({
  match,
  themeKey,
  viewMode,
}: {
  match: LobbyMatchRow;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
}) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const players = parseReplayPlayers(match.players)
    .map((player) => normalizePublicReplayText(player.name) ?? "")
    .filter(Boolean);

  const playedAt = pickLobbyMatchPlayedAt(match);
  const resultDisplay = getLobbyMatchResultDisplay(match);

  return (
    <Link
      href={`/game-stats/${match.id}`}
      className={`block rounded-2xl border px-4 py-4 transition-colors duration-150 ${tone.card} ${tone.cardHover}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-white">{publicReplayMapLabel(match.map)}</div>
          <div className="mt-1 truncate text-sm text-slate-300">
            {players.length > 0 ? players.join(" vs ") : "HD battle record"}
          </div>
        </div>

        <div className="shrink-0 space-y-2 text-right">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
            {resultDisplay.headline}
          </div>
        </div>
      </div>

      {playedAt ? (
        <div className="mt-3 text-xs text-slate-400">
          {formatLobbyMoment(playedAt)}
        </div>
      ) : null}
    </Link>
  );
});
