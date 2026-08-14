"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";

import type { PlayerProfileIdentity, PlayerProfileMatchItem } from "@/lib/playerProfile";
import ReviewReplayResultButton from "@/components/game-stats/ReviewReplayResultButton";
import { appendUniqueRowsById } from "@/lib/authoritativeListWindow";
import {
  PLAYER_MATCH_FEED_RECONCILE_BATCH_SIZE,
  playerMatchFeedNextCursor,
  playerMatchFeedRefreshDepth,
} from "@/lib/playerMatchFeedPagination";

const PLAYER_MATCH_FEED_PAGE_SIZE = 18;

type PlayerMatchFeedClientProps = {
  identity: PlayerProfileIdentity;
  initialGeneration: string;
  initialItems: PlayerProfileMatchItem[];
  initialNextCursor: number | null;
  totalMatches: number;
  accent?: "amber" | "rose" | "sky";
  variant?: "command" | "classic";
};

type PlayerMatchFeedResponse = {
  detail?: string;
  generation?: string;
  items?: PlayerProfileMatchItem[];
  nextCursor?: number | null;
  totalMatches?: number;
};

function formatDate(value: string | null) {
  if (!value) return "Date hidden";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date hidden";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function resultClass(result: PlayerProfileMatchItem["result"]) {
  if (result === "win") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (result === "loss") return "border-rose-300/25 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/5 text-slate-300";
}

function resultLabel(result: PlayerProfileMatchItem["result"]) {
  return result === "unknown" ? "filed" : result;
}

function accentHoverClass(accent: "amber" | "rose" | "sky") {
  if (accent === "rose") return "hover:border-rose-300/35";
  if (accent === "sky") return "hover:border-sky-300/35";
  return "hover:border-amber-300/35";
}

function buildFeedUrl(
  identity: PlayerProfileIdentity,
  cursor: number,
  limit = PLAYER_MATCH_FEED_PAGE_SIZE,
) {
  const params = new URLSearchParams({
    kind: identity.kind,
    cursor: String(cursor),
    limit: String(limit),
  });

  if (identity.kind === "claimed") {
    params.set("uid", identity.uid);
  } else {
    params.set("name", identity.name);
  }

  return `/api/player-profile/matches?${params.toString()}`;
}

export default function PlayerMatchFeedClient({
  identity,
  initialGeneration,
  initialItems,
  initialNextCursor,
  totalMatches,
  accent = "amber",
  variant = "command",
}: PlayerMatchFeedClientProps) {
  const [items, setItems] = useState(initialItems);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [currentTotalMatches, setCurrentTotalMatches] = useState(totalMatches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(initialItems);
  const nextCursorRef = useRef(initialNextCursor);
  const totalMatchesRef = useRef(totalMatches);
  const appliedGenerationRef = useRef(initialGeneration);
  const dataGenerationRef = useRef(0);
  const loadingRef = useRef(false);
  const reconcilingRef = useRef(false);
  const reconciliationSequenceRef = useRef(0);
  const mountedRef = useRef(true);

  const applyItems = useCallback((nextItems: PlayerProfileMatchItem[]) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      reconciliationSequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (initialGeneration === appliedGenerationRef.current) return;

    const reconciliationSequence =
      ++reconciliationSequenceRef.current;
    const refreshDepth = playerMatchFeedRefreshDepth({
      currentlyLoaded: itemsRef.current.length,
      initialWindow: initialItems.length,
      nextTotal: totalMatches,
      previousTotal: totalMatchesRef.current,
    });

    dataGenerationRef.current += 1;
    reconcilingRef.current = true;

    const applyAuthoritativePrefix = (
      authoritativeItems: PlayerProfileMatchItem[],
      authoritativeTotal: number,
    ) => {
      if (
        !mountedRef.current ||
        reconciliationSequence !== reconciliationSequenceRef.current
      ) {
        return;
      }

      appliedGenerationRef.current = initialGeneration;
      totalMatchesRef.current = authoritativeTotal;
      applyItems(authoritativeItems);
      setCurrentTotalMatches(authoritativeTotal);

      const refreshedCursor = playerMatchFeedNextCursor(
        authoritativeItems.length,
        authoritativeTotal,
      );
      nextCursorRef.current = refreshedCursor;
      setNextCursor(refreshedCursor);
      setError(null);
    };

    if (refreshDepth <= initialItems.length) {
      applyAuthoritativePrefix(
        initialItems.slice(0, refreshDepth),
        totalMatches,
      );
      reconcilingRef.current = false;
      return;
    }

    const reconcileLoadedPrefix = async () => {
      try {
        let authoritativeTotal = totalMatches;
        let cursor = 0;
        let authoritativeItems: PlayerProfileMatchItem[] = [];

        while (authoritativeItems.length < refreshDepth) {
          const batchLimit = Math.min(
            PLAYER_MATCH_FEED_RECONCILE_BATCH_SIZE,
            refreshDepth - authoritativeItems.length,
          );
          const response = await fetch(
            `${buildFeedUrl(identity, cursor, batchLimit)}&refresh=${Date.now()}`,
            {
              cache: "no-store",
              headers: { "Cache-Control": "no-cache" },
            },
          );
          const payload = (await response.json()) as PlayerMatchFeedResponse;

          if (!response.ok) {
            throw new Error(
              payload.detail || "Match feed could not reconcile.",
            );
          }

          const responseGeneration = String(payload.generation || "").trim();
          if (
            responseGeneration &&
            responseGeneration !== initialGeneration
          ) {
            window.dispatchEvent(
              new Event("aoe2war:player-profile-refresh"),
            );
            return;
          }

          const batchItems = Array.isArray(payload.items)
            ? payload.items
            : [];
          authoritativeItems = appendUniqueRowsById(
            authoritativeItems,
            batchItems,
          );
          authoritativeTotal = Number.isFinite(payload.totalMatches)
            ? Math.max(0, Number(payload.totalMatches))
            : authoritativeTotal;

          const nextBatchCursor = payload.nextCursor ?? null;
          if (
            batchItems.length === 0 ||
            nextBatchCursor === null ||
            nextBatchCursor <= cursor
          ) {
            break;
          }
          cursor = nextBatchCursor;
        }

        applyAuthoritativePrefix(
          authoritativeItems,
          authoritativeTotal,
        );
      } catch (reconciliationError) {
        console.warn(
          "Failed to reconcile loaded player match prefix:",
          reconciliationError,
        );

        // Fall back to the fresh server window and its own safe cursor. This
        // sacrifices loaded depth only on failure, never archive ordering.
        applyAuthoritativePrefix(initialItems, totalMatches);
      } finally {
        if (reconciliationSequence === reconciliationSequenceRef.current) {
          reconcilingRef.current = false;
        }
      }
    };

    void reconcileLoadedPrefix();
  }, [
    applyItems,
    identity,
    initialGeneration,
    initialItems,
    totalMatches,
  ]);

  const loadMore = useCallback(async () => {
    const cursor = nextCursorRef.current;
    if (loadingRef.current || reconcilingRef.current || cursor === null) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);
    const requestDataGeneration = dataGenerationRef.current;

    try {
      const response = await fetch(buildFeedUrl(identity, cursor), {
        cache: "no-store",
      });
      const payload = (await response.json()) as PlayerMatchFeedResponse;

      if (!response.ok) {
        throw new Error(payload.detail || "Match feed could not load.");
      }

      const responseGeneration = String(payload.generation || "").trim();
      if (
        requestDataGeneration !== dataGenerationRef.current ||
        (responseGeneration &&
          responseGeneration !== appliedGenerationRef.current)
      ) {
        window.dispatchEvent(
          new Event("aoe2war:player-profile-refresh"),
        );
        return;
      }

      const nextItems = appendUniqueRowsById(
        itemsRef.current,
        Array.isArray(payload.items) ? payload.items : [],
      );
      applyItems(nextItems);

      const nextPageCursor = payload.nextCursor ?? null;
      nextCursorRef.current = nextPageCursor;
      setNextCursor(nextPageCursor);

      if (Number.isFinite(payload.totalMatches)) {
        const nextTotal = Math.max(0, Number(payload.totalMatches));
        totalMatchesRef.current = nextTotal;
        setCurrentTotalMatches(nextTotal);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Match feed could not load.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [applyItems, identity]);

  const handleFeedScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const node = event.currentTarget;
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      if (distanceFromBottom < 1600) {
        void loadMore();
      }
    },
    [loadMore]
  );

  useEffect(() => {
    if (!sentinelRef.current || nextCursor === null) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      {
        root: scrollerRef.current,
        rootMargin: "1600px 0px",
      }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [loadMore, nextCursor]);

  return (
    <div className="min-h-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.28em] text-slate-400">
          {items.length} / {currentTotalMatches} loaded
        </div>
        {nextCursor !== null ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loading}
            className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? "Loading..." : "Load older wars"}
          </button>
        ) : (
          <div className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100">
            Full archive loaded
          </div>
        )}
      </div>

      <div ref={scrollerRef} onScroll={handleFeedScroll} className="max-h-[min(74dvh,56rem)] space-y-3 overflow-y-auto overscroll-contain pr-1 scroll-smooth [contain:layout_paint] [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:rgba(251,191,36,0.35)_rgba(15,23,42,0.55)] [-webkit-overflow-scrolling:touch] [touch-action:pan-y]">
        {items.length === 0 ? (
          <div className="rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
            No replay-backed matches have landed here yet.
          </div>
        ) : (
          items.map((item) => {
            if (variant === "classic") {
              return (
                <div
                  key={item.id}
                  className="space-y-2 [content-visibility:auto] [contain-intrinsic-size:auto_10rem]"
                >
                  <Link
                    href={item.href}
                    className={`block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:bg-white/10 ${accentHoverClass(accent)}`}
                  >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-white">{item.mapName}</div>
                      <div className="mt-1 text-sm text-slate-300">{item.playersLabel}</div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                      {item.winnerLabel}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.outcomeLabel ? <Tag>{item.outcomeLabel}</Tag> : null}
                    <Tag>{item.parseLabel}</Tag>
                  </div>

                  {item.playedAt ? (
                    <div className="mt-3 text-xs text-slate-400">{formatDate(item.playedAt)}</div>
                  ) : null}
                  </Link>
                  <ReviewReplayResultButton
                    gameStatsId={item.id}
                    submitterUids={item.submitterUids}
                  />
                </div>
              );
            }

            return (
              <div
                key={item.id}
                className="space-y-2 [content-visibility:auto] [contain-intrinsic-size:auto_11rem]"
              >
                <Link
                  href={item.href}
                  className={`block rounded-[1.25rem] border border-white/8 bg-white/5 px-4 py-4 transition hover:bg-white/10 ${accentHoverClass(accent)}`}
                >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white">{item.mapName}</div>
                      <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${resultClass(item.result)}`}>
                        {resultLabel(item.result)}
                      </span>
                    </div>
                    <div className="mt-1 text-sm leading-6 text-slate-300">{item.playersLabel}</div>
                  </div>
                  <div className="text-right text-xs uppercase tracking-[0.22em] text-slate-400">
                    {item.winnerLabel}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Tag>{item.parseLabel}</Tag>
                  {item.durationLabel ? <Tag>{item.durationLabel}</Tag> : null}
                  {item.playerCivilization ? <Tag>{item.playerCivilization}</Tag> : null}
                  {item.score !== null ? <Tag>{Math.round(item.score).toLocaleString()} score</Tag> : null}
                  {item.eapm !== null ? <Tag>{Math.round(item.eapm * 10) / 10} EAPM</Tag> : null}
                  {item.outcomeLabel ? <Tag>{item.outcomeLabel}</Tag> : null}
                </div>

                  {item.playedAt ? <div className="mt-3 text-xs text-slate-400">{formatDate(item.playedAt)}</div> : null}
                </Link>
                <ReviewReplayResultButton
                  gameStatsId={item.id}
                  submitterUids={item.submitterUids}
                />
              </div>
            );
          })
        )}
        <div ref={sentinelRef} className="h-6" />
      </div>

      {error ? (
        <div className="mt-3 rounded-[1rem] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}
