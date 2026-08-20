"use client";

import { Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LeaderboardScopeToggle } from "@/components/leaderboard/LeaderboardScopeToggle";
import { LeaderboardViewToggle } from "@/components/leaderboard/LeaderboardViewToggle";
import { LeaderboardWatcherCard } from "@/components/leaderboard/LeaderboardWatcherCard";
import { ModernLeaderboardTable } from "@/components/leaderboard/ModernLeaderboardTable";
import {
  LivingLeaderboard,
  type LivingLeaderboardSpotlightTarget,
} from "@/components/leaderboard/LivingLeaderboard";
import { useLivingLeaderboardPreferences } from "@/components/leaderboard/useLivingLeaderboardPreferences";
import { LeaderboardLaneToggle } from "@/components/lobby/LeaderboardLaneToggle";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
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
  type LeaderboardSortKey,
  type LeaderboardSortState,
} from "@/lib/leaderboardSort";

const RESET_PAGE_SIZE = 50;
const SCROLL_PAGE_SIZE = 150;
const SPOTLIGHT_CONTEXT_ROWS = 50;
const SPOTLIGHT_INITIAL_ROWS =
  SPOTLIGHT_CONTEXT_ROWS * 2 + 1;

type LeaderboardResponse = LobbyLeaderboardSummary & {
  ok?: boolean;
  nextOffset: number;
  hasMore: boolean;
};

type SpotlightWarmWindow = {
  cacheKey: string;
  rank: number;
  key: string;
  name: string;
  offset: number;
  entries: LobbyLeaderboardSummary["entries"];
  trackedPlayers: number;
  nextOffset: number;
  hasMore: boolean;
  warmedAt: number;
};

type CommandSortWarmWindow = {
  cacheKey: string;
  entries:
    LobbyLeaderboardSummary["entries"];
  trackedPlayers: number;
  nextOffset: number;
  hasMore: boolean;
  warmedAt: number;
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
  const {
    viewMode,
    setViewMode,
  } = useTileViewPreference(
    "leaderboard",
  );
  const isExtreme =
    viewMode === "extreme";

  const {
    preferences: livingPreferences,
    updatePreferences: updateLivingPreferencesRaw,
    ready: livingPreferencesReady,
    isAuthenticated: livingPreferencesAuthenticated,
  } = useLivingLeaderboardPreferences();

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
  const [podiumEntries, setPodiumEntries] = useState(
    (initialLeaderboard?.entries ?? [])
      .filter((entry) => entry.rank <= 3)
      .sort((left, right) => left.rank - right.rank)
  );
  const [trackedPlayers, setTrackedPlayers] = useState(initialLeaderboard?.trackedPlayers ?? 0);
  const [spotlightTarget, setSpotlightTarget] =
    useState<LivingLeaderboardSpotlightTarget | null>(null);
  const [spotlightLoading, setSpotlightLoading] = useState(false);
  const [firstOffset, setFirstOffset] = useState(0);
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
  const skipNextScopeReloadRef = useRef(false);
  const skipNextViewModeReloadRef = useRef(false);
  const personalViewWasActiveRef = useRef(false);
  const personalViewRequestRef = useRef(0);

  const spotlightWarmRef =
    useRef<SpotlightWarmWindow | null>(
      null,
    );

  const spotlightWarmRequestRef =
    useRef(0);

  const spotlightWarmPromiseRef =
    useRef<{
      cacheKey: string;
      promise:
        Promise<SpotlightWarmWindow | null>;
    } | null>(null);

  const commandSortWarmRef =
    useRef<
      Map<
        string,
        CommandSortWarmWindow
      >
    >(
      new Map(),
    );

  const commandSortWarmPromiseRef =
    useRef<
      Map<
        string,
        Promise<
          CommandSortWarmWindow | null
        >
      >
    >(
      new Map(),
    );

  const hasPersonalRankView =
    isExtreme &&
    livingPreferencesReady &&
    (
      livingPreferences.spotlightMode !== "off" ||
      livingPreferences.rankWindowStart !== null
    );

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

    const alternateScope:
      LeaderboardScope =
      scope === "all"
        ? "claimed"
        : "all";

    // Warm the two most likely next interactions:
    // RM <-> DM and Warriors <-> Kingdom.
    void prefetchLeaderboardLane(
      alternateLane,
      RESET_PAGE_SIZE,
      scope,
    );

    void prefetchLeaderboardLane(
      activeLane,
      RESET_PAGE_SIZE,
      alternateScope,
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
      scopeOverride,
      limitOverride,
      prepend = false,
    }: {
      reset: boolean;
      offset?: number;
      preserveRows?: boolean;
      sortOverride?: LeaderboardSortState;
      laneOverride?: LeaderboardLane;
      scopeOverride?: LeaderboardScope;
      limitOverride?: number;
      prepend?: boolean;
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
          setFirstOffset(0);
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

        const requestedScope =
          scopeOverride ??
          scope;

        const requestedLimit =
          Math.max(
            1,
            Math.min(
              600,
              Math.floor(
                limitOverride ??
                  (reset
                    ? RESET_PAGE_SIZE
                    : SCROLL_PAGE_SIZE),
              ),
            ),
          );

        const params =
          new URLSearchParams({
            lane: requestedLane,
            scope: requestedScope,
            offset: String(offset),
            limit: String(requestedLimit),
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
          payload.scope !==
            requestedScope ||
          payload.lane !==
            requestedLane
        ) {
          throw new Error("leaderboard unavailable");
        }
        if (activeRequest !== requestId.current) return;

        setEntries((current) =>
          reset
            ? payload.entries!
            : prepend
              ? mergeEntries(
                  payload.entries!,
                  current,
                )
              : mergeEntries(
                  current,
                  payload.entries!,
                ),
        );

        if (reset || prepend) {
          setFirstOffset(offset);
        }

        setTrackedPlayers(
          typeof payload.trackedPlayers ===
            "number"
            ? payload.trackedPlayers
            : payload.entries.length,
        );

        if (
          reset &&
          offset === 0 &&
          !query &&
          !activeSort.key
        ) {
          setPodiumEntries(
            payload.entries
              .filter((entry) => entry.rank <= 3)
              .sort((left, right) => left.rank - right.rank),
          );
        }

        if (!prepend) {
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
        }

        if (
          reset &&
          offset === 0 &&
          !query &&
          !activeSort.key &&
          payload.scope ===
            requestedScope &&
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

  const warmSpotlight =
    useCallback(
      (): Promise<
        SpotlightWarmWindow | null
      > => {
        if (
          !isExtreme ||
          !livingPreferencesAuthenticated ||
          query
        ) {
          return Promise.resolve(
            null,
          );
        }

        const cacheKey =
          `${lane}:${scope}:spotlight:${SPOTLIGHT_INITIAL_ROWS}`;

        const existing =
          spotlightWarmRef.current;

        if (
          existing &&
          existing.cacheKey ===
            cacheKey &&
          Date.now() -
            existing.warmedAt <
            30_000
        ) {
          return Promise.resolve(
            existing,
          );
        }

        const inFlight =
          spotlightWarmPromiseRef.current;

        if (
          inFlight &&
          inFlight.cacheKey ===
            cacheKey
        ) {
          return inFlight.promise;
        }

        const warmRequest =
          ++spotlightWarmRequestRef.current;

        const promise =
          (async () => {
            try {
              // ----------------------------------------------
              // Resolve signed-in canonical rank.
              // ----------------------------------------------

              const locateParams =
                new URLSearchParams({
                  lane,
                  scope,
                });

              const locateResponse =
                await fetch(
                  `/api/lobby/leaderboard/locate?${locateParams}`,
                  {
                    cache:
                      "no-store",
                  },
                );

              const located =
                (await locateResponse
                  .json()
                  .catch(
                    () => ({}),
                  )) as {
                  found?: boolean;
                  key?: string | null;
                  rank?: number | null;
                  name?: string | null;
                };

              if (
                !locateResponse.ok ||
                !located.found ||
                !located.key ||
                typeof located.rank !==
                  "number"
              ) {
                return null;
              }

              const rank =
                Math.max(
                  1,
                  Math.floor(
                    located.rank,
                  ),
                );

              // ----------------------------------------------
              // Load one reusable centered window:
              //
              // [ 50 above ][ warrior ][ 50 below ]
              //
              // Boundary scrolling can extend either direction
              // later without making Spotlight itself expensive.
              // ----------------------------------------------

              const offset =
                Math.max(
                  0,
                  rank -
                    1 -
                    SPOTLIGHT_CONTEXT_ROWS,
                );

              const limit =
                SPOTLIGHT_INITIAL_ROWS;

              const boardParams =
                new URLSearchParams({
                  lane,
                  scope,
                  offset:
                    String(offset),
                  limit:
                    String(limit),
                });

              const boardResponse =
                await fetch(
                  `/api/lobby/leaderboard?${boardParams}`,
                  {
                    cache:
                      "no-store",
                  },
                );

              const payload =
                (await boardResponse
                  .json()
                  .catch(
                    () => ({}),
                  )) as Partial<LeaderboardResponse>;

              if (
                !boardResponse.ok ||
                !Array.isArray(
                  payload.entries,
                ) ||
                payload.lane !== lane ||
                payload.scope !== scope
              ) {
                return null;
              }

              const warm:
                SpotlightWarmWindow = {
                cacheKey,
                rank,
                key:
                  located.key,
                name:
                  located.name ||
                  located.key,
                offset,
                entries:
                  payload.entries,
                trackedPlayers:
                  typeof payload
                    .trackedPlayers ===
                  "number"
                    ? payload
                        .trackedPlayers
                    : payload.entries
                        .length,
                nextOffset:
                  typeof payload
                    .nextOffset ===
                  "number"
                    ? payload
                        .nextOffset
                    : offset +
                      payload.entries
                        .length,
                hasMore:
                  Boolean(
                    payload.hasMore,
                  ),
                warmedAt:
                  Date.now(),
              };

              if (
                warmRequest ===
                spotlightWarmRequestRef
                  .current
              ) {
                spotlightWarmRef.current =
                  warm;
              }

              return warm;
            } catch {
              // Spotlight prewarming is opportunistic.
              // Never degrade the ordinary leaderboard.
              return null;
            }
          })();

        spotlightWarmPromiseRef.current =
          {
            cacheKey,
            promise,
          };

        void promise.finally(
          () => {
            if (
              spotlightWarmPromiseRef
                .current?.promise ===
              promise
            ) {
              spotlightWarmPromiseRef.current =
                null;
            }
          },
        );

        return promise;
      },
      [
        isExtreme,
        lane,
        livingPreferencesAuthenticated,
        query,
        scope,
      ],
    );

  useEffect(() => {
    if (
      !isExtreme ||
      !livingPreferencesReady ||
      !livingPreferencesAuthenticated ||
      query
    ) {
      return;
    }

    // Begin immediately after the Living surface becomes
    // interactive. The user sees no spinner and no row change.
    void warmSpotlight();
  }, [
    isExtreme,
    livingPreferencesAuthenticated,
    livingPreferencesReady,
    query,
    warmSpotlight,
  ]);

  useEffect(() => {
    if (firstEffect.current) {
      firstEffect.current = false;
      const storedLane = readStoredLeaderboardLane();
      if (storedLane !== lane) {
        writeStoredLeaderboardLane(storedLane);
        setLane(storedLane);
      } else if (!initialLeaderboard) {
        void loadPage({ reset: true });
      }
      return;
    }

    if (
      skipNextViewModeReloadRef.current
    ) {
      skipNextViewModeReloadRef.current =
        false;
      return;
    }

    if (
      skipNextLaneReloadRef.current ||
      skipNextScopeReloadRef.current
    ) {
      skipNextLaneReloadRef.current =
        false;
      skipNextScopeReloadRef.current =
        false;
      return;
    }

    if (
      isExtreme &&
      livingPreferencesReady &&
      !query &&
      (
        livingPreferences.spotlightMode !== "off" ||
        livingPreferences.rankWindowStart !== null
      )
    ) {
      return;
    }

    void loadPage({
      reset: true,
    });
  }, [
    initialLeaderboard,
    isExtreme,
    lane,
    livingPreferences.rankWindowStart,
    livingPreferences.spotlightMode,
    livingPreferencesReady,
    query,
    loadPage,
  ]);

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
      { rootMargin: "8000px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadPage, loading, loadingMore, nextOffset]);

  const changeViewMode =
    useCallback(
      (
        nextMode:
          typeof viewMode,
      ) => {
        if (
          nextMode === viewMode
        ) {
          return;
        }

        // B/A/E are presentation modes over the same
        // leaderboard truth. Prevent the generic effect
        // from treating a visual change like data navigation.
        skipNextViewModeReloadRef.current =
          true;

        setViewMode(
          nextMode,
        );
      },
      [
        setViewMode,
        viewMode,
      ],
    );

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

      if (cached) {
        setPodiumEntries(
          cached.entries
            .filter((entry) => entry.rank <= 3)
            .sort((left, right) => left.rank - right.rank),
        );
      } else if (hasPersonalRankView) {
        setPodiumEntries([]);
      }

      // The opposite lane is normally already prefetched.
      // Apply it synchronously before React paints again,
      // except when a personal rank window owns row selection.
      if (
        !hasPersonalRankView &&
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

      if (!hasPersonalRankView) {
        // Revalidate quietly against authoritative server
        // truth. Never blank the table into skeletons.
        void loadPage({
          reset: true,
          preserveRows: true,
          laneOverride:
            nextLane,
        });
      }

      // Keep the opposite lane warm for the next flip.
      void prefetchLeaderboardLane(
        lane,
        RESET_PAGE_SIZE,
        scope,
      );
    },
    [
      lane,
      loadPage,
      hasPersonalRankView,
      query,
      scope,
    ],
  );

  const changeScope = useCallback(
    (
      nextScope:
        LeaderboardScope,
    ) => {
      if (nextScope === scope) {
        return;
      }

      const cached =
        readLeaderboardLaneCache(
          lane,
          nextScope,
        );

      // Prevent the generic effect from blanking the board
      // after this explicit scope transition.
      skipNextScopeReloadRef.current =
        true;

      // Invalidate an older in-flight page request.
      requestId.current += 1;

      setScope(nextScope);

      if (cached) {
        setPodiumEntries(
          cached.entries
            .filter((entry) => entry.rank <= 3)
            .sort((left, right) => left.rank - right.rank),
        );
      } else if (hasPersonalRankView) {
        setPodiumEntries([]);
      }

      // The opposite scope is normally already prefetched.
      // Apply it synchronously before React paints again,
      // except when a personal rank window owns row selection.
      if (
        !hasPersonalRankView &&
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

      if (!hasPersonalRankView) {
        // Revalidate quietly against authoritative server
        // truth. Never blank Warriors/Kingdom into skeletons.
        void loadPage({
          reset: true,
          preserveRows: true,
          scopeOverride:
            nextScope,
        });
      }

      // Keep the previous scope warm for the next flip.
      void prefetchLeaderboardLane(
        lane,
        RESET_PAGE_SIZE,
        scope,
      );
    },
    [
      hasPersonalRankView,
      lane,
      loadPage,
      query,
      scope,
    ],
  );

  const commandSortCacheKey =
    useCallback(
      (
        key:
          LeaderboardSortKey,
        direction:
          "asc" | "desc",
      ) =>
        `${lane}:${scope}:${key}:${direction}`,
      [
        lane,
        scope,
      ],
    );

  const warmCommandSort =
    useCallback(
      (
        key:
          LeaderboardSortKey,
        direction:
          "asc" | "desc",
      ): Promise<
        CommandSortWarmWindow | null
      > => {
        if (query) {
          return Promise.resolve(
            null,
          );
        }

        const cacheKey =
          `${lane}:${scope}:${key}:${direction}`;

        const existing =
          commandSortWarmRef.current.get(
            cacheKey,
          );

        if (
          existing &&
          Date.now() -
            existing.warmedAt <
            60_000
        ) {
          return Promise.resolve(
            existing,
          );
        }

        const inFlight =
          commandSortWarmPromiseRef.current.get(
            cacheKey,
          );

        if (inFlight) {
          return inFlight;
        }

        const promise =
          (async () => {
            try {
              const params =
                new URLSearchParams({
                  lane,
                  scope,
                  offset: "0",
                  limit:
                    String(
                      RESET_PAGE_SIZE,
                    ),
                  sort: key,
                  dir: direction,
                });

              const response =
                await fetch(
                  `/api/lobby/leaderboard?${params}`,
                  {
                    cache:
                      "no-store",
                  },
                );

              const payload =
                (await response
                  .json()
                  .catch(
                    () => ({}),
                  )) as Partial<LeaderboardResponse>;

              if (
                !response.ok ||
                !Array.isArray(
                  payload.entries,
                ) ||
                payload.lane !==
                  lane ||
                payload.scope !==
                  scope
              ) {
                return null;
              }

              const warm:
                CommandSortWarmWindow = {
                cacheKey,
                entries:
                  payload.entries,
                trackedPlayers:
                  typeof payload
                    .trackedPlayers ===
                  "number"
                    ? payload
                        .trackedPlayers
                    : payload.entries
                        .length,
                nextOffset:
                  typeof payload
                    .nextOffset ===
                  "number"
                    ? payload
                        .nextOffset
                    : payload.entries
                        .length,
                hasMore:
                  Boolean(
                    payload.hasMore,
                  ),
                warmedAt:
                  Date.now(),
              };

              commandSortWarmRef.current.set(
                cacheKey,
                warm,
              );

              return warm;
            } catch {
              // Prewarming is opportunistic.
              return null;
            } finally {
              commandSortWarmPromiseRef.current.delete(
                cacheKey,
              );
            }
          })();

        commandSortWarmPromiseRef.current.set(
          cacheKey,
          promise,
        );

        return promise;
      },
      [
        lane,
        query,
        scope,
      ],
    );

  const applyCommandSortWarm =
    useCallback(
      (
        warm:
          CommandSortWarmWindow,
      ) => {
        // Kill any older page request before swapping
        // resident sorted truth into view.
        requestId.current += 1;

        loadingMoreRef.current =
          false;

        setEntries(
          warm.entries,
        );

        setTrackedPlayers(
          warm.trackedPlayers,
        );

        setFirstOffset(0);

        setNextOffset(
          warm.nextOffset,
        );

        setHasMore(
          warm.hasMore,
        );

        setLoading(false);
        setLoadingMore(false);
        setError(null);
      },
      [],
    );

  useEffect(() => {
    if (
      loading ||
      query
    ) {
      return;
    }

    // These four command views are likely next actions.
    // Build them while the user is simply looking at
    // the leaderboard.
    void Promise.all([
      warmCommandSort(
        "rank_change_24h",
        "desc",
      ),
      warmCommandSort(
        "rank_change_24h",
        "asc",
      ),
      warmCommandSort(
        "streak",
        "desc",
      ),
      warmCommandSort(
        "streak",
        "asc",
      ),
    ]);
  }, [
    loading,
    query,
    warmCommandSort,
  ]);

  const changeSort = useCallback(
    (key: LeaderboardSortKey) => {
      if (hasPersonalRankView) {
        updateLivingPreferencesRaw({
          spotlightMode: "off",
          rankWindowStart: null,
        });

        setSpotlightTarget(
          null,
        );
      }

      const next =
        nextLeaderboardSort(
          sortRef.current,
          key,
        );

      sortRef.current =
        next;

      setSort(
        next,
      );

      // ------------------------------------------------------
      // THIRD CLICK: canonical rank order.
      //
      // The normal lane/scope cache is already resident.
      // Restore it immediately, then quietly revalidate.
      // ------------------------------------------------------

      if (
        !next.key ||
        !next.direction
      ) {
        const base =
          readLeaderboardLaneCache(
            lane,
            scope,
          );

        if (
          base &&
          !query
        ) {
          requestId.current += 1;

          loadingMoreRef.current =
            false;

          setEntries(
            base.entries,
          );

          setTrackedPlayers(
            base.trackedPlayers,
          );

          setFirstOffset(0);

          setNextOffset(
            base.entries.length,
          );

          setHasMore(
            base.entries.length <
              base.trackedPlayers,
          );

          setLoading(false);
          setLoadingMore(false);
          setError(null);
        }

        void loadPage({
          reset: true,
          preserveRows: true,
          sortOverride: next,
        });

        return;
      }

      // ------------------------------------------------------
      // COMMAND SORT FAST PATH.
      //
      // Movers and Streak should normally already exist
      // in memory from idle prewarming.
      // ------------------------------------------------------

      if (!query) {
        const cacheKey =
          commandSortCacheKey(
            next.key,
            next.direction,
          );

        const warm =
          commandSortWarmRef.current.get(
            cacheKey,
          );

        if (
          warm &&
          Date.now() -
            warm.warmedAt <
            60_000
        ) {
          applyCommandSortWarm(
            warm,
          );

          return;
        }

        // If the user beat the prewarm, reuse the in-flight
        // request instead of starting a duplicate fetch.
        void warmCommandSort(
          next.key,
          next.direction,
        ).then(
          (nextWarm) => {
            if (
              !nextWarm ||
              sortRef.current.key !==
                next.key ||
              sortRef.current.direction !==
                next.direction
            ) {
              return;
            }

            applyCommandSortWarm(
              nextWarm,
            );
          },
        );

        return;
      }

      // Search-specific sorts cannot use the generic
      // unfiltered warm cache.
      void loadPage({
        reset: true,
        preserveRows: true,
        sortOverride: next,
      });
    },
    [
      applyCommandSortWarm,
      commandSortCacheKey,
      hasPersonalRankView,
      lane,
      loadPage,
      query,
      scope,
      updateLivingPreferencesRaw,
      warmCommandSort,
    ],
  );

  const changeLivingPreferences =
    useCallback(
      (
        patch: Parameters<
          typeof updateLivingPreferencesRaw
        >[0],
      ) => {
        const activatesRankNavigation =
          patch.spotlightMode === "center" ||
          typeof patch.rankWindowStart === "number";

        const exitsSpotlight =
          patch.spotlightMode === "off" &&
          livingPreferences.spotlightMode !==
            "off";

        if (activatesRankNavigation) {
          sortRef.current = {
            key: null,
            direction: null,
          };

          setSort({
            key: null,
            direction: null,
          });

          setSearchInput("");
          setQuery("");
        }

        if (exitsSpotlight) {
          // Spotlight exit is a LOCAL UI operation.
          // Cancel ownership of any personal-view request
          // before preferences update and restore the already
          // resident canonical lane immediately.
          personalViewRequestRef.current += 1;

          personalViewWasActiveRef.current =
            false;

          requestId.current += 1;

          loadingMoreRef.current =
            false;

          setSpotlightTarget(null);
          setSpotlightLoading(false);
          setLoading(false);
          setLoadingMore(false);
          setError(null);

          const cached =
            readLeaderboardLaneCache(
              lane,
              scope,
            );

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

            setPodiumEntries(
              cached.entries
                .filter(
                  (entry) =>
                    entry.rank <= 3,
                )
                .sort(
                  (left, right) =>
                    left.rank -
                    right.rank,
                ),
            );

            setFirstOffset(0);

            setNextOffset(
              cached.entries.length,
            );

            setHasMore(
              cached.entries.length <
                cached.trackedPlayers,
            );
          } else {
            // Rare cold-cache fallback: keep current rows
            // visible and revalidate quietly. Never skeleton.
            void loadPage({
              reset: true,
              preserveRows: true,
              offset: 0,
              limitOverride:
                RESET_PAGE_SIZE,
            });
          }
        }

        updateLivingPreferencesRaw(
          patch,
        );
      },
      [
        lane,
        livingPreferences
          .spotlightMode,
        loadPage,
        query,
        scope,
        updateLivingPreferencesRaw,
      ],
    );

  const changeSearchInput =
    useCallback(
      (value: string) => {
        if (
          value.trim() &&
          hasPersonalRankView
        ) {
          updateLivingPreferencesRaw({
            spotlightMode: "off",
            rankWindowStart: null,
          });
          setSpotlightTarget(null);
        }

        setSearchInput(value);
      },
      [
        hasPersonalRankView,
        updateLivingPreferencesRaw,
      ],
    );

  useEffect(() => {
    if (
      !livingPreferencesReady ||
      query
    ) {
      return;
    }

    const request =
      ++personalViewRequestRef.current;

    let cancelled = false;

    const run = async () => {
      if (!isExtreme) {
        if (
          personalViewWasActiveRef.current
        ) {
          personalViewWasActiveRef.current =
            false;
          setSpotlightTarget(null);

          await loadPage({
            reset: true,
            preserveRows: true,
            offset: 0,
            limitOverride:
              RESET_PAGE_SIZE,
          });
        }

        return;
      }

      const spotlightMode =
        livingPreferences.spotlightMode;

      const rankWindowStart =
        livingPreferences.rankWindowStart;

      const rankWindowRows =
        livingPreferences.rankWindowRows;

      const active =
        spotlightMode !== "off" ||
        rankWindowStart !== null;

      if (!active) {
        if (
          personalViewWasActiveRef.current
        ) {
          personalViewWasActiveRef.current =
            false;
          setSpotlightTarget(null);

          await loadPage({
            reset: true,
            preserveRows: true,
            offset: 0,
            limitOverride:
              RESET_PAGE_SIZE,
          });
        }

        return;
      }

      personalViewWasActiveRef.current =
        true;

      if (
        spotlightMode === "off" &&
        rankWindowStart !== null
      ) {
        setSpotlightTarget(null);

        await loadPage({
          reset: true,
          preserveRows: true,
          offset:
            Math.max(
              0,
              rankWindowStart -
                1,
            ),
          limitOverride:
            rankWindowRows,
        });

        return;
      }

      const warmCacheKey =
        `${lane}:${scope}:spotlight:${SPOTLIGHT_INITIAL_ROWS}`;

      const warm =
        spotlightWarmRef.current;

      if (
        warm &&
        warm.cacheKey ===
          warmCacheKey
      ) {
        // Invalidate any older row request. Spotlight now owns
        // the board selection.
        requestId.current += 1;

        loadingMoreRef.current =
          false;

        setLoading(false);
        setLoadingMore(false);
        setError(null);

        setEntries(
          warm.entries,
        );

        setTrackedPlayers(
          warm.trackedPlayers,
        );

        setFirstOffset(
          warm.offset,
        );

        setNextOffset(
          warm.nextOffset,
        );

        setHasMore(
          warm.hasMore,
        );

        setSpotlightTarget({
          key:
            warm.key,
          rank:
            warm.rank,
          name:
            warm.name,
          mode:
            "center",
        });

        setSpotlightLoading(
          false,
        );

        return;
      }

      setSpotlightLoading(true);

      try {
        const params =
          new URLSearchParams({
            lane,
            scope,
          });

        const response =
          await fetch(
            `/api/lobby/leaderboard/locate?${params}`,
            {
              cache: "no-store",
            },
          );

        const payload =
          (await response
            .json()
            .catch(() => ({}))) as {
            found?: boolean;
            key?: string | null;
            rank?: number | null;
            name?: string | null;
            detail?: string;
          };

        if (
          !response.ok
        ) {
          throw new Error(
            response.status === 401
              ? "Sign in with Steam to spotlight your rank."
              : payload.detail ||
                  "Your warrior could not be located.",
          );
        }

        if (
          !payload.found ||
          !payload.key ||
          typeof payload.rank !==
            "number"
        ) {
          throw new Error(
            "Your linked warrior is not ranked in this board yet.",
          );
        }

        const rank =
          Math.max(
            1,
            Math.floor(
              payload.rank,
            ),
          );

        const contextBefore =
          SPOTLIGHT_CONTEXT_ROWS;

        const offset =
          Math.max(
            0,
            rank -
              1 -
              contextBefore,
          );

        const spotlightRows =
          SPOTLIGHT_INITIAL_ROWS;

        await loadPage({
          reset: true,
          preserveRows: true,
          offset,
          limitOverride:
            spotlightRows,
        });

        if (
          cancelled ||
          request !==
            personalViewRequestRef.current
        ) {
          return;
        }

        setSpotlightTarget({
          key:
            payload.key,
          rank,
          name:
            payload.name ||
            payload.key,
          mode:
            "center",
        });
      } catch (nextError) {
        if (
          !cancelled &&
          request ===
            personalViewRequestRef.current
        ) {
          setSpotlightTarget(null);

          setError(
            nextError instanceof Error
              ? nextError.message
              : "Your warrior could not be located.",
          );
        }
      } finally {
        if (
          !cancelled &&
          request ===
            personalViewRequestRef.current
        ) {
          setSpotlightLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    isExtreme,
    lane,
    livingPreferences.rankWindowRows,
    livingPreferences.rankWindowStart,
    livingPreferences.spotlightMode,
    livingPreferencesReady,
    loadPage,
    query,
    scope,
  ]);


  const loadEarlierRanks =
    useCallback(() => {
      if (
        firstOffset <= 0 ||
        loadingMoreRef.current
      ) {
        return;
      }

      const amount =
        Math.min(
          SCROLL_PAGE_SIZE,
          firstOffset,
        );

      const offset =
        Math.max(
          0,
          firstOffset -
            amount,
        );

      void loadPage({
        reset: false,
        offset,
        limitOverride:
          firstOffset -
          offset,
        prepend: true,
      });
    }, [
      firstOffset,
      loadPage,
    ]);

  if (isExtreme) {
    return (
      <main
        className="leaderboard-modern-shell h-full min-h-0 overflow-hidden py-0 text-white"
        data-leaderboard-view={viewMode}
      >
        <SpeedReadyMarker
          route="/leaderboard"
          ready={!loading}
        />

        <LivingLeaderboard
          viewMode={viewMode}
          onViewModeChange={
            changeViewMode
          }
          lane={lane}
          onLaneChange={changeLane}
          scope={scope}
          onScopeChange={changeScope}
          searchInput={searchInput}
          onSearchInputChange={changeSearchInput}
          query={query}
          trackedPlayers={trackedPlayers}
          entries={entries}
          podiumEntries={podiumEntries}
          sortKey={sort.key}
          sortDirection={sort.direction}
          onSort={changeSort}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          hasMore={hasMore}
          hasEarlier={
            firstOffset > 0
          }
          onRetry={() =>
            void loadPage({
              reset:
                entries.length === 0,
              offset:
                entries.length === 0
                  ? 0
                  : nextOffset,
            })
          }
          onLoadMore={() =>
            void loadPage({
              reset: false,
              offset: nextOffset,
            })
          }
          onLoadEarlier={
            loadEarlierRanks
          }
          preferences={livingPreferences}
          onPreferencesChange={changeLivingPreferences}
          spotlightTarget={spotlightTarget}
          spotlightLoading={spotlightLoading}
          spotlightAvailable={livingPreferencesAuthenticated}
          personalRankViewActive={hasPersonalRankView}
        />
      </main>
    );
  }

  return (
    <main
      className="leaderboard-modern-shell space-y-5 py-3 text-white sm:py-6"
      data-leaderboard-view={viewMode}
    >
      <SpeedReadyMarker
        route="/leaderboard"
        ready={!loading}
      />

      <section className="relative overflow-hidden rounded-[1.8rem] border border-amber-200/14 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.09),transparent_26%),linear-gradient(145deg,#101a2d,#070d18_62%,#030711)] shadow-[0_30px_100px_rgba(0,0,0,0.3)]">
        <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8 lg:right-10">
          <LeaderboardViewToggle
            value={viewMode}
            onChange={
              changeViewMode
            }
          />
        </div>

        <div className="border-b border-amber-200/18 px-5 py-6 sm:px-8 sm:py-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem] xl:items-start">
            <div>
              <div
                className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.38em] ${
                  viewMode === "advanced"
                    ? "text-blue-200/48"
                    : "text-cyan-100/42"
                }`}
              >
                <span
                  className={`h-px w-7 bg-gradient-to-r ${
                    viewMode === "advanced"
                      ? "from-blue-300/65 to-blue-500/5"
                      : "from-cyan-200/55 to-cyan-500/5"
                  }`}
                />

                AoE2WAR · HD Ranked Command
              </div>

              <div className="relative mt-3 inline-block max-w-full overflow-visible pr-6">
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute -inset-x-12 -inset-y-7 rounded-full blur-[48px] ${
                    viewMode === "advanced"
                      ? "bg-blue-500/[0.085]"
                      : "bg-cyan-400/[0.055]"
                  }`}
                />

                <h1
                  className={`relative bg-clip-text text-[clamp(2.7rem,3.8vw,4.25rem)] font-black leading-[0.92] text-transparent ${
                    viewMode === "advanced"
                      ? "font-sans uppercase tracking-[-0.065em]"
                      : "font-serif tracking-[-0.052em]"
                  }`}
                  style={
                    viewMode === "advanced"
                      ? {
                          backgroundImage:
                            "repeating-linear-gradient(180deg, rgba(255,255,255,0.08) 0px, rgba(255,255,255,0.08) 1px, transparent 1px, transparent 4px), linear-gradient(180deg, #e3f1ff 0%, #91bff4 13%, #467fc4 29%, #174d92 47%, #082b5c 57%, #2c68ae 71%, #83afe2 86%, #224f88 100%)",
                          WebkitTextStroke:
                            "0.45px rgba(191,219,254,0.22)",
                          textShadow:
                            "0 1px 0 rgba(239,246,255,0.20), 0 2px 0 rgba(69,112,166,0.45), 0 4px 0 rgba(5,25,55,0.88), 0 7px 18px rgba(0,0,0,0.42), 0 0 28px rgba(37,99,235,0.18)",
                        }
                      : {
                          backgroundImage:
                            "repeating-linear-gradient(180deg, rgba(255,255,255,0.055) 0px, rgba(255,255,255,0.055) 1px, transparent 1px, transparent 5px), linear-gradient(180deg, #e4f6fb 0%, #a8d1df 14%, #5d91a8 31%, #28536d 48%, #102d43 59%, #376c86 74%, #8db5c5 88%, #315a6f 100%)",
                          WebkitTextStroke:
                            "0.42px rgba(186,230,253,0.18)",
                          textShadow:
                            "0 1px 0 rgba(224,247,250,0.16), 0 2px 0 rgba(70,116,137,0.38), 0 4px 0 rgba(3,20,31,0.90), 0 7px 19px rgba(0,0,0,0.46), 0 0 24px rgba(34,211,238,0.10)",
                        }
                  }
                >
                  HD Leaderboard
                </h1>

                <div
                  className={`mt-3.5 h-px max-w-[28rem] bg-gradient-to-r to-transparent ${
                    viewMode === "advanced"
                      ? "from-blue-200/42 via-blue-500/17"
                      : "from-cyan-100/30 via-cyan-700/12"
                  }`}
                />
              </div>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Exact Steam accounts fold every verified historical display
                name into one current row. Name-only evidence stays separate
                until stronger identity proof exists.
              </p>
            </div>

            <div className="pt-12">
              <LeaderboardWatcherCard compact />
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-b border-white/[0.07] bg-black/15 px-5 py-5 sm:px-8 lg:grid-cols-[auto_auto_minmax(18rem,1fr)_auto] lg:items-center">
          <LeaderboardLaneToggle
            lane={lane}
            onChange={changeLane}
            loading={loading}
            variant="compact"
          />

          <LeaderboardScopeToggle
            value={scope}
            onChange={changeScope}
          />

          <label className="relative block lg:mx-auto lg:w-full lg:max-w-xl">
            <span className="sr-only">
              Search warriors
            </span>

            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-amber-200/70"
              aria-hidden="true"
            />

            <input
              type="search"
              value={searchInput}
              onChange={(event) =>
                setSearchInput(
                  event.target.value,
                )
              }
              placeholder="Search by warrior name"
              className="h-13 w-full rounded-xl border border-cyan-300/25 bg-slate-950/75 pl-12 pr-12 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/55 focus:ring-2 focus:ring-amber-200/15"
            />

            {searchInput ? (
              <button
                type="button"
                onClick={() =>
                  setSearchInput("")
                }
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center text-slate-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50"
                aria-label="Clear player search"
              >
                <X
                  className="h-4 w-4"
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </label>

          <div className="text-left lg:text-right">
            <div className="text-2xl font-semibold tabular-nums text-white">
              {trackedPlayers.toLocaleString()}
            </div>

            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {query
                ? "matching identity rows"
                : scope === "claimed"
                  ? "public claimed profiles"
                  : "identity rows on board"}
            </div>
          </div>
        </div>

        <div
          data-classic-leaderboard-table
          className="p-3 sm:p-5"
          aria-busy={
            loading ||
            loadingMore
          }
        >
          {loading ? (
            <div
              className="space-y-2"
              aria-label="Loading leaderboard"
            >
              {Array.from(
                { length: 8 },
                (_, index) => (
                  <div
                    key={index}
                    className="h-16 animate-pulse border border-white/[0.05] bg-white/[0.035]"
                  />
                ),
              )}
            </div>
          ) : entries.length ===
              0 &&
            query ? (
            <div className="border border-amber-200/14 bg-amber-300/[0.045] px-5 py-10 text-center text-slate-300">
              No ranked warrior matches “{query}”.
            </div>
          ) : entries.length ===
            0 ? (
            <div className="border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-slate-300">
              {scope === "claimed"
                ? "No public claimed AoE2WAR profiles are available in this lane yet."
                : "No ranked warriors yet. Final HD replays will raise the first names onto this board."}
            </div>
          ) : (
            <ModernLeaderboardTable
              entries={entries}
              sortKey={sort.key}
              sortDirection={
                sort.direction
              }
              onSort={changeSort}
            />
          )}

          {error ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border border-orange-300/20 bg-orange-400/[0.06] px-4 py-3 text-sm text-orange-100">
              <span>{error}</span>

              <button
                type="button"
                onClick={() =>
                  void loadPage({
                    reset:
                      entries.length ===
                      0,
                    offset:
                      entries.length ===
                      0
                        ? 0
                        : nextOffset,
                  })
                }
                className="cursor-pointer font-semibold underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          ) : null}

          {hasMore &&
          !loading ? (
            <button
              ref={sentinelRef}
              type="button"
              disabled={
                loadingMore
              }
              onClick={() =>
                void loadPage({
                  reset: false,
                  offset:
                    nextOffset,
                })
              }
              className="mt-5 w-full cursor-pointer border border-amber-200/16 bg-amber-300/[0.045] px-4 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-amber-100 transition hover:border-amber-200/35 hover:bg-amber-300/[0.08] disabled:cursor-wait disabled:opacity-65"
            >
              {loadingMore
                ? "Calling up more warriors…"
                : "Load more warriors"}
            </button>
          ) : null}
        </div>
      </section>
    </main>
  );
}
