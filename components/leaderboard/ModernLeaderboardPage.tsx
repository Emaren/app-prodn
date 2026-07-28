"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
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
import type {
  LeaderboardScope,
} from "@/lib/leaderboardScope";
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

type IdentityCensus = Pick<
  LobbyLeaderboardSummary,
  | "identityRows"
  | "steamIdentityRows"
  | "nameOnlyIdentityRows"
  | "siteOnlyIdentityRows"
  | "claimedIdentityRows"
  | "claimedProfileOnlyRows"
  | "accountsWithAliasHistory"
  | "rankDelta24hAsOf"
  | "rankDelta24hCutoff"
  | "rankDelta24hMethod"
>;

function identityCensus(
  leaderboard:
    | Partial<LobbyLeaderboardSummary>
    | null
    | undefined,
): IdentityCensus {
  return {
    identityRows:
      leaderboard?.identityRows ??
      leaderboard?.trackedPlayers ??
      0,
    steamIdentityRows:
      leaderboard?.steamIdentityRows ?? 0,
    nameOnlyIdentityRows:
      leaderboard?.nameOnlyIdentityRows ?? 0,
    siteOnlyIdentityRows:
      leaderboard?.siteOnlyIdentityRows ?? 0,
    claimedIdentityRows:
      leaderboard?.claimedIdentityRows ?? 0,
    claimedProfileOnlyRows:
      leaderboard?.claimedProfileOnlyRows ?? 0,
    accountsWithAliasHistory:
      leaderboard?.accountsWithAliasHistory ?? 0,
    rankDelta24hAsOf:
      leaderboard?.rankDelta24hAsOf ?? null,
    rankDelta24hCutoff:
      leaderboard?.rankDelta24hCutoff ?? null,
    rankDelta24hMethod:
      leaderboard?.rankDelta24hMethod ??
      "reconstructed_current_corpus",
  };
}

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
  const [scope, setScope] =
    useState<LeaderboardScope>(
      initialLeaderboard?.scope ??
        "all",
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
  const [census, setCensus] =
    useState<IdentityCensus>(
      identityCensus(
        initialLeaderboard,
      ),
    );
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
      scope,
    );
  }, [
    initialLeaderboard,
    lane,
    scope,
  ]);

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
          setEntries([]);
          setTrackedPlayers(0);
          setNextOffset(0);
          setHasMore(false);
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
            scope,
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
        if (
          !response.ok ||
          !Array.isArray(
            payload.entries,
          ) ||
          payload.scope !== scope ||
          payload.lane !==
            requestedLane
        ) {
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
        setCensus(
          identityCensus(
            payload,
          ),
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
          payload.scope === scope &&
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
      scope,
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
          scope,
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
        setCensus(
          identityCensus(
            cached,
          ),
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
        scope,
      );
    },
    [
      lane,
      loadPage,
      query,
      scope,
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
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Exact Steam accounts fold every verified historical display
                name into one current row. Name-only evidence stays separate
                until stronger identity proof exists.
              </p>
            </div>
            <LeaderboardViewLink from="modern" to="og" href="/leaderboard/og">Open Game Stats</LeaderboardViewLink>
          </div>
        </div>

        <div className="grid gap-4 border-b border-white/[0.07] bg-black/15 px-5 py-5 sm:px-8 lg:grid-cols-[auto_auto_minmax(18rem,1fr)_auto] lg:items-center">
          <LeaderboardLaneToggle lane={lane} onChange={changeLane} loading={loading} variant="compact" />
          <div
            className="inline-flex w-fit rounded-xl border border-cyan-300/20 bg-slate-950/75 p-1"
            role="group"
            aria-label="Leaderboard players"
          >
            <button
              type="button"
              aria-pressed={
                scope === "all"
              }
              onClick={() =>
                setScope("all")
              }
              className={`rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 ${
                scope === "all"
                  ? "bg-amber-200 text-slate-950 shadow-[0_8px_24px_rgba(251,191,36,0.18)]"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              Full leaderboard
            </button>
            <button
              type="button"
              aria-pressed={
                scope === "claimed"
              }
              onClick={() =>
                setScope("claimed")
              }
              className={`rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/55 ${
                scope === "claimed"
                  ? "bg-cyan-200 text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.16)]"
                  : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
              }`}
            >
              AoE2WAR users
              <span className="ml-1.5 tabular-nums opacity-70">
                {
                  census.claimedIdentityRows
                }
              </span>
            </button>
          </div>
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
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {query
                ? "matching identity rows"
                : scope === "claimed"
                  ? "public claimed profiles"
                  : "identity rows on board"}
            </div>
          </div>
        </div>

        <div className="grid gap-3 border-b border-white/[0.07] bg-slate-950/35 px-5 py-4 sm:grid-cols-2 sm:px-8 xl:grid-cols-4 2xl:grid-cols-7">
          <IdentityMetric
            label="Identity rows"
            value={census.identityRows}
            detail="Current board projection"
          />
          <IdentityMetric
            label="Steam account rows"
            value={census.steamIdentityRows}
            detail="Replay-backed exact SteamID64 evidence"
          />
          <IdentityMetric
            label="Name-only rows"
            value={census.nameOnlyIdentityRows}
            detail="Kept separate for safety"
          />
          <IdentityMetric
            label="Profile-only rows"
            value={census.claimedProfileOnlyRows}
            detail={`${Math.max(0, census.claimedProfileOnlyRows - census.siteOnlyIdentityRows).toLocaleString()} Steam-linked · ${census.siteOnlyIdentityRows.toLocaleString()} site-only`}
          />
          <IdentityMetric
            label="AoE2WAR profiles"
            value={
              census.claimedIdentityRows
            }
            detail="Public claimed profiles; systems excluded"
          />
          <IdentityMetric
            label="Alias-history accounts"
            value={census.accountsWithAliasHistory}
            detail="Multiple observed names"
          />
          <div className="rounded-xl border border-amber-200/16 bg-[linear-gradient(135deg,rgba(251,191,36,0.09),rgba(34,211,238,0.055))] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100/65">
              24hr Rank Pulse
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              Make the ladder move.
            </div>
            <div
              className="mt-1 text-[10px] leading-4 text-slate-400"
              title={census.rankDelta24hCutoff
                ? `Reconstructed cutoff ${census.rankDelta24hCutoff}`
                : "Reconstructed from the current accepted corpus"}
            >
              Reconstructed from evidence accepted by the cutoff; not yet a
              persisted rank snapshot.
            </div>
            <Link
              href="/watch"
              className="mt-1 inline-flex text-xs font-semibold text-cyan-200 underline decoration-cyan-300/30 underline-offset-4 transition hover:text-white"
            >
              Run the Watcher for fresher ranks →
            </Link>
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
            <div className="border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-slate-300">
              {scope === "claimed"
                ? "No public claimed AoE2WAR profiles are available in this lane yet."
                : "No ranked warriors yet. Final HD replays will raise the first names onto this board."}
            </div>
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

function IdentityMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-white">
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        {detail}
      </div>
    </div>
  );
}
