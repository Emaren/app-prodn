"use client";

import { formatLobbyMoment } from "@/components/lobby/utils";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import {
  outcomeBadgeLabel,
  parsePlayers as parseReplayPlayers,
  readMapName,
  winnerLabel,
} from "@/lib/gameStatsView";
import type { LobbyMatchRow } from "@/lib/lobby";
import { pickLobbyMatchPlayedAt } from "@/lib/lobbyMatchTime";

const MATCH_FEED_PAGE_SIZE = 24;

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

function mergeMatchLists(primary: LobbyMatchRow[], secondary: LobbyMatchRow[]) {
  const seen = new Set<number>();
  const merged: LobbyMatchRow[] = [];

  for (const match of [...primary, ...secondary]) {
    if (seen.has(match.id)) continue;
    seen.add(match.id);
    merged.push(match);
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
  const hasMoreRef = useRef(true);
  const matchFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const matchFeedSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMatches((current) => mergeMatchLists(recentMatches, current));

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
        className="mt-5 min-h-0 max-h-[min(52dvh,32rem)] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-busy={isLoadingMore}
        onScroll={maybeLoadMoreMatches}
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

function MatchCard({
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
    .map((player) => String(player.name || ""))
    .filter(Boolean);

  const playedAt = pickLobbyMatchPlayedAt(match);
  const outcomeLabel = outcomeBadgeLabel(match.parse_reason, match.winner);

  return (
    <Link
      href={`/game-stats/${match.id}`}
      className={`block rounded-2xl border px-4 py-4 transition ${tone.card} ${tone.cardHover}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-medium text-white">{readMapName(match.map)}</div>
          <div className="mt-1 truncate text-sm text-slate-300">
            {players.join(" vs ")}
          </div>
        </div>

        <div className="shrink-0 space-y-2 text-right">
          <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
            {winnerLabel(match.winner, match.parse_reason)}
          </div>
          {outcomeLabel ? (
            <ResultTypePill toneClassName={tone.resultPill}>
              {outcomeLabel}
            </ResultTypePill>
          ) : null}
        </div>
      </div>

      {playedAt ? (
        <div className="mt-3 text-xs text-slate-400">
          {formatLobbyMoment(playedAt)}
        </div>
      ) : null}
    </Link>
  );
}

function ResultTypePill({
  children,
  toneClassName,
}: {
  children: ReactNode;
  toneClassName: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}
