"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LeaderboardViewLink } from "@/components/leaderboard/LeaderboardViewLink";
import { ModernLeaderboardTable } from "@/components/leaderboard/ModernLeaderboardTable";
import { LeaderboardLaneToggle } from "@/components/lobby/LeaderboardLaneToggle";
import type { LobbyLeaderboardSummary } from "@/lib/lobby";
import {
  readStoredLeaderboardLane,
  writeStoredLeaderboardLane,
  type LeaderboardLane,
} from "@/lib/leaderboardLane";
import {
  prefetchLeaderboardLane,
  readLeaderboardLaneCache,
  seedLeaderboardLaneCache,
} from "@/lib/leaderboardLaneClientCache";
import {
  nextLeaderboardSort,
  sortLeaderboardEntries,
  type LeaderboardSortKey,
  type LeaderboardSortState,
} from "@/lib/leaderboardSort";

const PAGE_SIZE = 50;

type LeaderboardResponse = LobbyLeaderboardSummary & {
  ok?: boolean;
  nextOffset: number;
  hasMore: boolean;
};

function mergeEntries(
  current: LobbyLeaderboardSummary["entries"],
  incoming: LobbyLeaderboardSummary["entries"]
) {
  const merged = [...current];
  const indexByKey = new Map(
    merged.map((entry, index) => [
      entry.key,
      index,
    ])
  );

  for (const entry of incoming) {
    const existingIndex =
      indexByKey.get(entry.key);

    if (existingIndex === undefined) {
      indexByKey.set(
        entry.key,
        merged.length
      );
      merged.push(entry);
    } else {
      merged[existingIndex] = entry;
    }
  }

  // The server owns the requested ordering.
  // Preserve page order while infinite scrolling appends rows.
  return merged;
}

export function ModernLeaderboardPage({
  initialLeaderboard,
}: {
  initialLeaderboard: LobbyLeaderboardSummary | null;
}) {
  const [lane, setLane] = useState<LeaderboardLane>(
    initialLeaderboard?.lane ?? "rm"
  );
  const [sort, setSort] =
    useState<LeaderboardSortState>({
      key: null,
      direction: null,
    });
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState(initialLeaderboard?.entries ?? []);
  const [trackedPlayers, setTrackedPlayers] = useState(initialLeaderboard?.trackedPlayers ?? 0);
  const [nextOffset, setNextOffset] = useState(initialLeaderboard?.entries.length ?? 0);
  const [hasMore, setHasMore] = useState(
    (initialLeaderboard?.entries.length ?? 0) < (initialLeaderboard?.trackedPlayers ?? 0)
  );
  const [loading, setLoading] = useState(!initialLeaderboard);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(initialLeaderboard ? null : "The ranked board is temporarily unavailable.");
  const firstEffect = useRef(true);
  const sortRef = useRef<LeaderboardSortState>({
    key: null,
    direction: null,
  });
  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);
  const sentinelRef = useRef<HTMLButtonElement | null>(null);
  const skipNextLaneReloadRef = useRef(false);

  useEffect(() => {
    seedLeaderboardLaneCache(
      initialLeaderboard,
    );

    const activeLane =
      lane;

    const alternateLane:
      LeaderboardLane =
      activeLane === "rm"
        ? "dm"
        : "rm";

    void prefetchLeaderboardLane(
      alternateLane,
      PAGE_SIZE,
    );
  }, [initialLeaderboard, lane]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(searchInput.trim()), 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadPage = useCallback(
    async ({
      reset,
      offset = 0,
      preserveRows = false,
      sortOverride,
      laneOverride,
    }: {
      reset: boolean;
      offset?: number;
      preserveRows?: boolean;
      sortOverride?: LeaderboardSortState;
      laneOverride?: LeaderboardLane;
    }) => {
      if (
        !reset &&
        loadingMoreRef.current
      ) {
        return;
      }

      const activeRequest =
        ++requestId.current;

      if (reset) {
        loadingMoreRef.current = false;
        setLoadingMore(false);

        if (!preserveRows) {
          setLoading(true);
        }
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }
      setError(null);

      try {
        const requestedLane =
          laneOverride ??
          lane;

        const params =
          new URLSearchParams({
            lane: requestedLane,
            offset: String(offset),
            limit: String(PAGE_SIZE),
          });
        if (query) {
          params.set("q", query);
        }

        const activeSort =
          sortOverride ??
          sortRef.current;

        if (
          activeSort.key &&
          activeSort.direction
        ) {
          params.set(
            "sort",
            activeSort.key,
          );

          params.set(
            "dir",
            activeSort.direction,
          );
        }

        const response = await fetch(
          `/api/lobby/leaderboard?${params}`,
          {
            cache: "no-store",
          }
        );
        const payload = (await response.json().catch(() => ({}))) as Partial<LeaderboardResponse>;
        if (!response.ok || !Array.isArray(payload.entries)) {
          throw new Error("leaderboard unavailable");
        }
        if (activeRequest !== requestId.current) return;

        setEntries((current) =>
          reset
            ? payload.entries!
            : mergeEntries(
                current,
                payload.entries!,
              ),
        );

        setTrackedPlayers(
          typeof payload.trackedPlayers ===
            "number"
            ? payload.trackedPlayers
            : payload.entries.length,
        );

        setNextOffset(
          typeof payload.nextOffset ===
            "number"
            ? payload.nextOffset
            : offset +
              payload.entries.length,
        );

        setHasMore(
          Boolean(payload.hasMore),
        );

        if (
          reset &&
          offset === 0 &&
          !query &&
          !activeSort.key &&
          payload.lane ===
            requestedLane
        ) {
          seedLeaderboardLaneCache(
            payload as LobbyLeaderboardSummary,
          );
        }
      } catch {
        if (activeRequest !== requestId.current) return;
        setError(reset ? "The ranked board is temporarily unavailable." : "Older ranks could not be loaded. Try again.");
      } finally {
        if (activeRequest === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          loadingMoreRef.current = false;
        }
      }
    },
    [
      lane,
      query,
    ]
  );

  useEffect(() => {
    if (firstEffect.current) {
      firstEffect.current = false;
      const storedLane = readStoredLeaderboardLane();
      if (storedLane !== lane) {
        setLane(storedLane);
      } else if (!initialLeaderboard) {
        void loadPage({ reset: true });
      }
      return;
    }

    if (
      skipNextLaneReloadRef.current
    ) {
      skipNextLaneReloadRef.current =
        false;
      return;
    }

    void loadPage({
      reset: true,
    });
  }, [initialLeaderboard, lane, query, loadPage]);

  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) {
          void loadPage({ reset: false, offset: nextOffset });
        }
      },
      { rootMargin: "700px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, loadingMore, nextOffset]);

  const changeLane = useCallback(
    (
      nextLane:
        LeaderboardLane,
    ) => {
      if (nextLane === lane) {
        return;
      }

      const cached =
        readLeaderboardLaneCache(
          nextLane,
        );

      writeStoredLeaderboardLane(
        nextLane,
      );

      // Prevent the generic lane effect from performing
      // a second blocking reset after this explicit switch.
      skipNextLaneReloadRef.current =
        true;

      // Invalidate an older in-flight page request.
      requestId.current += 1;

      setLane(nextLane);

      // The opposite lane is normally already prefetched.
      // Apply it synchronously before React paints again.
      if (
        cached &&
        !query &&
        !sortRef.current.key
      ) {
        setEntries(
          cached.entries,
        );

        setTrackedPlayers(
          cached.trackedPlayers,
        );

        setNextOffset(
          cached.entries.length,
        );

        setHasMore(
          cached.entries.length <
            cached.trackedPlayers,
        );

        setLoading(false);
        setLoadingMore(false);
        loadingMoreRef.current =
          false;
        setError(null);
      }

      // Revalidate quietly against authoritative server
      // truth. Never blank the table into skeletons.
      void loadPage({
        reset: true,
        preserveRows: true,
        laneOverride:
          nextLane,
      });

      // Keep the opposite lane warm for the next flip.
      void prefetchLeaderboardLane(
        lane,
        PAGE_SIZE,
      );
    },
    [
      lane,
      loadPage,
      query,
    ],
  );

  const changeSort = useCallback(
    (key: LeaderboardSortKey) => {
      const next =
        nextLeaderboardSort(
          sortRef.current,
          key,
        );

      sortRef.current = next;
      setSort(next);

      // Immediate response for the rows already in memory.
      setEntries((current) =>
        sortLeaderboardEntries(
          current,
          next,
        ),
      );

      // Quietly replace them with the authoritative
      // full-board server ordering. Do not show skeletons.
      void loadPage({
        reset: true,
        preserveRows: true,
        sortOverride: next,
      });
    },
    [loadPage],
  );

  return (
    <main className="space-y-5 py-3 text-white sm:py-6">
      <section className="overflow-hidden rounded-[1.8rem] border border-amber-200/14 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.09),transparent_26%),linear-gradient(145deg,#101a2d,#070d18_62%,#030711)] shadow-[0_30px_100px_rgba(0,0,0,0.3)]">
        <div className="border-b border-amber-200/18 px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.36em] text-amber-200/65">AoE2WAR · HD Ranked Command</div>
              <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-amber-100 sm:text-5xl">HD Leaderboard</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">Real HD ratings, replay-backed records, and the warriors ruling the ladder now.</p>
            </div>
            <LeaderboardViewLink from="modern" to="og" href="/leaderboard/og">Open the OG Board</LeaderboardViewLink>
          </div>
        </div>

        <div className="grid gap-4 border-b border-white/[0.07] bg-black/15 px-5 py-5 sm:px-8 lg:grid-cols-[auto_minmax(18rem,1fr)_auto] lg:items-center">
          <LeaderboardLaneToggle lane={lane} onChange={changeLane} loading={loading} variant="compact" />
          <label className="relative block lg:mx-auto lg:w-full lg:max-w-xl">
            <span className="sr-only">Search warriors</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-200/70" aria-hidden="true" />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by warrior name"
              className="h-13 w-full rounded-none border border-cyan-300/25 bg-slate-950/75 pl-12 pr-12 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/55 focus:ring-2 focus:ring-amber-200/15"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50"
                aria-label="Clear player search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="text-left lg:text-right">
            <div className="text-2xl font-semibold tabular-nums text-white">{trackedPlayers.toLocaleString()}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{query ? "matching warriors" : "warriors on board"}</div>
          </div>
        </div>

        <div className="p-3 sm:p-5 lg:p-7" aria-busy={loading || loadingMore}>
          {loading ? (
            <div className="space-y-2" aria-label="Loading leaderboard">
              {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-16 animate-pulse border border-white/[0.05] bg-white/[0.035]" />)}
            </div>
          ) : entries.length === 0 && query ? (
            <div className="border border-amber-200/14 bg-amber-300/[0.045] px-5 py-10 text-center text-slate-300">No ranked warrior matches “{query}”.</div>
          ) : entries.length === 0 ? (
            <div className="border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-slate-300">No ranked warriors yet. Final HD replays will raise the first names onto this board.</div>
          ) : (
            <ModernLeaderboardTable
              entries={entries}
              sortKey={sort.key}
              sortDirection={sort.direction}
              onSort={changeSort}
            />
          )}

          {error ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-orange-300/20 bg-orange-400/[0.06] px-4 py-3 text-sm text-orange-100">
              <span>{error}</span>
              <button type="button" onClick={() => void loadPage({ reset: entries.length === 0, offset: entries.length === 0 ? 0 : nextOffset })} className="font-semibold underline underline-offset-4">Try again</button>
            </div>
          ) : null}

          {hasMore && !loading ? (
            <button
              ref={sentinelRef}
              type="button"
              disabled={loadingMore}
              onClick={() => void loadPage({ reset: false, offset: nextOffset })}
              className="mt-5 w-full border border-amber-200/16 bg-amber-300/[0.045] px-4 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100 transition hover:border-amber-200/35 hover:bg-amber-300/[0.08] disabled:cursor-wait disabled:opacity-65"
            >
              {loadingMore ? "Calling up more warriors…" : "Load more warriors"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
