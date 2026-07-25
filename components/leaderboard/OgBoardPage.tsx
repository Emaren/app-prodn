"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { OgBattleCard } from "@/components/leaderboard/OgBattleCard";
import { Button } from "@/components/ui/button";
import {
  trackLeaderboardEvent,
} from "@/lib/leaderboardTelemetry";
import {
  writeStoredLeaderboardView,
} from "@/lib/leaderboardViewPreference";
import type { OgBoardPage as OgBoardPageData } from "@/lib/ogBoard";

const PAGE_SIZE = 24;

export function OgBoardPage({
  initialPage,
}: {
  initialPage: OgBoardPageData | null;
}) {
  const router = useRouter();

  const [entries, setEntries] = useState(
    initialPage?.entries ?? [],
  );
  const [nextOffset, setNextOffset] = useState(
    initialPage?.nextOffset ?? 0,
  );
  const [hasMore, setHasMore] = useState(
    initialPage?.hasMore ?? false,
  );
  const [loading, setLoading] = useState(
    !initialPage,
  );
  const [error, setError] = useState<string | null>(
    initialPage
      ? null
      : "Game stats are temporarily unavailable.",
  );

  const loadingRef = useRef(false);
  const sentinelRef =
    useRef<HTMLButtonElement | null>(null);

  const loadMore = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;

      loadingRef.current = true;
      setLoading(true);
      setError(null);

      const offset = reset ? 0 : nextOffset;

      try {
        const response = await fetch(
          `/api/leaderboard/og?offset=${offset}&limit=${PAGE_SIZE}`,
          {
            cache: "no-store",
          },
        );

        const payload = (await response
          .json()
          .catch(() => ({}))) as Partial<OgBoardPageData>;

        if (
          !response.ok ||
          !Array.isArray(payload.entries)
        ) {
          throw new Error(
            "Game stats unavailable",
          );
        }

        setEntries((current) => {
          const next = reset
            ? []
            : [...current];

          const ids = new Set(
            next.map((entry) => entry.id),
          );

          for (const entry of payload.entries!) {
            if (!ids.has(entry.id)) {
              next.push(entry);
            }
          }

          return next;
        });

        setNextOffset(
          typeof payload.nextOffset === "number"
            ? payload.nextOffset
            : offset + PAGE_SIZE,
        );

        setHasMore(
          Boolean(payload.hasMore),
        );
      } catch {
        setError(
          reset
            ? "Game stats are temporarily unavailable."
            : "Older games could not be loaded. Try again.",
        );
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [nextOffset],
  );

  useEffect(() => {
    if (!hasMore || loading) return;

    const node = sentinelRef.current;
    if (!node) return;

    const observer =
      new IntersectionObserver(
        (items) => {
          if (
            items.some(
              (item) => item.isIntersecting,
            )
          ) {
            void loadMore();
          }
        },
        {
          rootMargin: "700px 0px",
        },
      );

    observer.observe(node);

    return () =>
      observer.disconnect();
  }, [
    hasMore,
    loadMore,
    loading,
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mt-8 flex justify-center gap-3">
        <Button
          className="bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          onClick={() => router.push("/")}
        >
          ⬅️ Back to Home
        </Button>

        <Link
          href="/leaderboard?view=modern"
          onClick={() => {
            writeStoredLeaderboardView("modern");

            trackLeaderboardEvent({
              type: "leaderboard_switch_view",
              metadata: {
                from: "og",
                to: "modern",
              },
            });
          }}
          className="inline-flex items-center justify-center rounded-md bg-gray-700 px-6 py-3 font-semibold text-white transition hover:bg-gray-600"
        >
          🏆 Leaderboard
        </Link>
      </div>

      <h2 className="mb-6 text-center text-3xl font-bold text-gray-400">
        Game Stats
      </h2>

      {entries.length === 0 && loading ? (
        <p className="text-center text-gray-400">
          Loading game stats...
        </p>
      ) : entries.length === 0 ? (
        <p className="text-center text-gray-400">
          No game stats available.
        </p>
      ) : (
        <div
          className="space-y-6"
          aria-busy={loading}
        >
          {entries.map(
            (entry, index) => (
              <OgBattleCard
                key={entry.id}
                entry={entry}
                latest={index === 0}
              />
            ),
          )}
        </div>
      )}

      {error ? (
        <div className="mt-6 rounded-lg border border-red-400/30 bg-red-950/20 p-4 text-center text-sm text-red-300">
          <p>{error}</p>

          <button
            type="button"
            onClick={() =>
              void loadMore(
                entries.length === 0,
              )
            }
            className="mt-2 cursor-pointer font-semibold underline underline-offset-4"
          >
            Try again
          </button>
        </div>
      ) : null}

      {hasMore &&
      entries.length > 0 ? (
        <button
          ref={sentinelRef}
          type="button"
          disabled={loading}
          onClick={() =>
            void loadMore()
          }
          className="mt-6 w-full cursor-pointer rounded-lg bg-gray-700 px-4 py-3 text-sm font-semibold text-gray-200 transition hover:bg-gray-600 disabled:cursor-wait disabled:opacity-60"
        >
          {loading
            ? "Loading older games..."
            : "Load older games"}
        </button>
      ) : null}

    </div>
  );
}
