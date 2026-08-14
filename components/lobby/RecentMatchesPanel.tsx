"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import {
  outcomeBadgeLabel,
  winnerLabel,
} from "@/lib/gameStatsView";
import type { LobbyMatchRow } from "@/lib/lobby";
import { pickLobbyMatchPlayedAt } from "@/lib/lobbyMatchTime";
import { formatReplayTeamMatchup } from "@/lib/replayTeamDisplay";
import { useHomeCopy } from "@/components/i18n/useHomeCopy";
import type { HomeCopy } from "@/lib/i18n/homeCopy";
import {
  publicReplayMapLabel,
} from "@/lib/unresolvedWatcherResult";
import {
  authoritativePrefixDepthThroughTail,
  appendUniqueRowsById,
} from "@/lib/authoritativeListWindow";

const MATCH_FEED_PAGE_SIZE = 24;
const MATCH_FEED_MAX_REFRESH_SIZE = 96;
const MATCH_FEED_MAX_RECONCILE_EXTRA = 96;
const MATCH_FEED_REFRESH_MS = 5_000;

type RecentMatchesResponse = {
  generation?: string;
  ok?: boolean;
  matches?: LobbyMatchRow[];
  nextOffset?: number;
  hasMore?: boolean;
};

function sameMatchPrefix(
  current: LobbyMatchRow[],
  latest: LobbyMatchRow[],
) {
  return latest.every(
    (match, index) =>
      current[index]?.id === match.id &&
      JSON.stringify(current[index]) === JSON.stringify(match),
  );
}

type RecentMatchesPanelProps = {
  recentMatches: LobbyMatchRow[];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  surface?: "standard" | "extreme";
};

function readLobbyHumanConfirmedDesync(
  match: LobbyMatchRow
) {
  return (
    match as {
      humanConfirmedDesync?:
        unknown;
    }
  ).humanConfirmedDesync ===
    true;
}

export function RecentMatchesPanel({
  recentMatches,
  themeKey,
  viewMode,
  surface = "standard",
}: RecentMatchesPanelProps) {
  const h = useHomeCopy();
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";

  const [matches, setMatches] = useState(recentMatches);
  const [hasMoreMatches, setHasMoreMatches] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const matchesRef = useRef(matches);
  const replayGenerationRef = useRef<string | null>(null);
  const nextOffsetRef = useRef(recentMatches.length);
  const loadingRef = useRef(false);
  const refreshingLatestRef = useRef(false);
  const hasMoreRef = useRef(true);
  const matchFeedScrollRef = useRef<HTMLDivElement | null>(null);
  const matchFeedSentinelRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollAdjustmentRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    hasMoreRef.current = hasMoreMatches;
  }, [hasMoreMatches]);

  useLayoutEffect(() => {
    const pending = pendingScrollAdjustmentRef.current;
    const viewport = matchFeedScrollRef.current;
    pendingScrollAdjustmentRef.current = null;

    if (!pending || !viewport) return;

    viewport.scrollTop =
      pending.scrollTop +
      viewport.scrollHeight -
      pending.scrollHeight;
  }, [matches]);

  const refreshLatestMatches = useCallback(async () => {
    if (refreshingLatestRef.current || loadingRef.current) return;

    refreshingLatestRef.current = true;

    try {
      const loadedBeforeRefresh = matchesRef.current;
      const loadedBeforeRefreshCount = loadedBeforeRefresh.length;
      const refreshLimit = Math.max(
        MATCH_FEED_PAGE_SIZE,
        Math.min(
          MATCH_FEED_MAX_REFRESH_SIZE,
          loadedBeforeRefreshCount,
        ),
      );

      const loadPage = async (offset: number, limit: number) => {
        const response = await fetch(
          `/api/lobby/recent-matches?offset=${offset}&limit=${limit}&refresh=${Date.now()}`,
          {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          },
        );

        if (!response.ok) return null;

        return (await response.json()) as RecentMatchesResponse;
      };

      const payload = await loadPage(0, refreshLimit);

      if (!payload) return;

      const generation =
        typeof payload.generation === "string" &&
        payload.generation.length > 0
          ? payload.generation
          : null;
      const generationChanged =
        generation !== null &&
        generation !== replayGenerationRef.current;

      if (generation !== null) {
        replayGenerationRef.current = generation;
      }

      let authoritativePrefix = Array.isArray(payload.matches)
        ? payload.matches
        : [];
      let nextOffset =
        typeof payload.nextOffset === "number" &&
        Number.isFinite(payload.nextOffset)
          ? Math.max(0, payload.nextOffset)
          : authoritativePrefix.length;
      let pageHasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : authoritativePrefix.length >= refreshLimit;
      const fullFirstWindowReceived =
        authoritativePrefix.length >=
        Math.min(loadedBeforeRefreshCount, refreshLimit);
      const firstWindowUnchanged =
        fullFirstWindowReceived &&
        sameMatchPrefix(
          loadedBeforeRefresh,
          authoritativePrefix,
        );

      if (!generationChanged && firstWindowUnchanged) {
        if (refreshLimit >= loadedBeforeRefreshCount) {
          nextOffsetRef.current = nextOffset;
          hasMoreRef.current = pageHasMore;
          setHasMoreMatches(pageHasMore);
        }

        return;
      }

      const minimumDepth = Math.max(
        MATCH_FEED_PAGE_SIZE,
        loadedBeforeRefreshCount,
      );
      const maximumDepth =
        minimumDepth + MATCH_FEED_MAX_RECONCILE_EXTRA;
      const previousTailId = loadedBeforeRefresh.at(-1)?.id;

      while (
        pageHasMore &&
        authoritativePrefix.length < maximumDepth &&
        (
          authoritativePrefix.length < minimumDepth ||
          (
            previousTailId !== undefined &&
            !authoritativePrefix.some(
              (match) => match.id === previousTailId,
            )
          )
        )
      ) {
        const batchLimit = Math.min(
          MATCH_FEED_MAX_REFRESH_SIZE,
          maximumDepth - authoritativePrefix.length,
        );
        const previousOffset = nextOffset;
        const nextPayload = await loadPage(nextOffset, batchLimit);

        if (!nextPayload) return;

        const nextGeneration =
          typeof nextPayload.generation === "string" &&
          nextPayload.generation.length > 0
            ? nextPayload.generation
            : null;

        if (
          generation !== null &&
          nextGeneration !== null &&
          nextGeneration !== generation
        ) {
          return;
        }

        const nextMatches = Array.isArray(nextPayload.matches)
          ? nextPayload.matches
          : [];

        authoritativePrefix = appendUniqueRowsById(
          authoritativePrefix,
          nextMatches,
        );
        nextOffset =
          typeof nextPayload.nextOffset === "number" &&
          Number.isFinite(nextPayload.nextOffset)
            ? Math.max(previousOffset, nextPayload.nextOffset)
            : previousOffset + nextMatches.length;
        pageHasMore =
          typeof nextPayload.hasMore === "boolean"
            ? nextPayload.hasMore
            : nextMatches.length >= batchLimit;

        if (
          nextMatches.length === 0 ||
          nextOffset <= previousOffset
        ) {
          pageHasMore = false;
        }
      }

      const authoritativeDepth =
        authoritativePrefixDepthThroughTail(
          loadedBeforeRefresh,
          authoritativePrefix,
          minimumDepth,
        );
      const nextMatches = authoritativePrefix.slice(
        0,
        authoritativeDepth,
      );
      const nextHasMore =
        authoritativeDepth < authoritativePrefix.length ||
        pageHasMore;
      const viewport = matchFeedScrollRef.current;

      if (viewport && viewport.scrollTop > 0) {
        pendingScrollAdjustmentRef.current = {
          scrollHeight: viewport.scrollHeight,
          scrollTop: viewport.scrollTop,
        };
      }

      matchesRef.current = nextMatches;
      setMatches(nextMatches);
      nextOffsetRef.current = authoritativeDepth;
      hasMoreRef.current = nextHasMore;
      setHasMoreMatches(nextHasMore);
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
    if (
      loadingRef.current ||
      refreshingLatestRef.current ||
      !hasMoreRef.current
    ) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const offset = nextOffsetRef.current;
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

      setMatches((current) => appendUniqueRowsById(current, nextMatches));

      nextOffsetRef.current =
        typeof payload.nextOffset === "number" &&
        Number.isFinite(payload.nextOffset)
          ? Math.max(offset, payload.nextOffset)
          : offset + nextMatches.length;

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
    const nearBottom = distanceFromBottom <= 2200;

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
        rootMargin: "2200px 0px",
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
            {h("Match Feed")}
          </div>
          <h3 className="mt-2 text-2xl font-semibold text-white">
            {h("Recent Parsed Games")}
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
              {h("Parsed matches will show here as soon as the watcher uploads them.")}
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

function readLobbyRecord(value: unknown): Record<string, unknown> | null {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function readLobbyResultReview(
  match: LobbyMatchRow
) {
  const candidate =
    match as LobbyMatchRow & {
      replayResultAdjudication?:
        unknown;

      key_events?:
        unknown;

      keyEvents?:
        unknown;

      parseReason?:
        unknown;

      humanSuppliedEvidence?:
        unknown;

      humanSuppliedEvidenceCount?:
        unknown;
    };

  const keyEvents =
    readLobbyRecord(
      candidate.key_events ??
        candidate.keyEvents
    );

  const directEvidence =
    readLobbyRecord(
      candidate
        .replayResultAdjudication
    );

  const replayEvidence =
    readLobbyRecord(
      keyEvents
        ?.replay_result_adjudication
    );

  const commissionerEvidence =
    readLobbyRecord(
      keyEvents
        ?.commissioner_adjudication
    );

  const adjudicationEvidence =
    directEvidence ||
    replayEvidence ||
    commissionerEvidence;

  const reviewedBy =
    normalizeLobbyWinnerName(
      adjudicationEvidence
        ?.adjudicated_by
    );

  const parseReason =
    normalizeLobbyWinnerName(
      candidate.parse_reason ||
        candidate.parseReason
    ).toLowerCase();

  const hasHumanVerdict =
    Boolean(
      adjudicationEvidence
    ) ||
    parseReason ===
      "manual_result_adjudication" ||
    parseReason ===
      "manual_recovery";

  const evidenceCount =
    typeof candidate
      .humanSuppliedEvidenceCount ===
      "number" &&
    Number.isFinite(
      candidate
        .humanSuppliedEvidenceCount
    )
      ? candidate
          .humanSuppliedEvidenceCount
      : 0;

  const hasHumanSuppliedEvidence =
    candidate
      .humanSuppliedEvidence ===
      true ||
    evidenceCount > 0;

  const reviewLabel =
    hasHumanVerdict &&
    hasHumanSuppliedEvidence
      ? "Human verdict and human-supplied evidence"
      : hasHumanVerdict
        ? "Human verdict"
        : hasHumanSuppliedEvidence
          ? "Human-supplied evidence"
          : "";

  return {
    reviewed:
      hasHumanVerdict ||
      hasHumanSuppliedEvidence,

    reviewedBy,

    reviewLabel,
  };
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

function isSavedReplayCheckpoint(match: LobbyMatchRow) {
  const candidate = match as LobbyMatchRow & {
    original_filename?: unknown;
    replay_file?: unknown;
  };

  return [
    candidate.original_filename,
    candidate.replay_file,
  ].some((value) =>
    normalizeLobbyWinnerName(value)
      .toLowerCase()
      .endsWith(".aoe2mpgame")
  );
}

function getLobbyMatchResultDisplay(match: LobbyMatchRow, h: HomeCopy) {
  if (
    readLobbyHumanConfirmedDesync(
      match
    )
  ) {
    return {
      headline:
        h("DESYNCED"),

      pill:
        null,
    };
  }

  const rawWinner = normalizeLobbyWinnerName(match.winner);
  const markedPlayerWinner = readMarkedPlayerWinner(match);
  const truthResult = readReplayTruthResult(match);
  const reviewNeeded = readReplayTruthReviewNeeded(match, truthResult);

  const winnerProof = normalizeLobbyWinnerName(
    (match as { winnerProof?: unknown }).winnerProof
  );

  const acceptedPublicFallback =
    winnerProof === "historical_inferred_fallback";

  const parseReason =
    normalizeLobbyWinnerName(
      match.parse_reason
    ).toLowerCase();

  const rejectedLegacyInference =
    parseReason ===
      "watcher_inferred_opponent_win_on_incomplete_1v1" ||
    parseReason ===
      "watcher_inferred_opponent_win_on_incomplete";

  const resolvedWinner =
    rejectedLegacyInference &&
    winnerProof !==
      "replay_result_adjudication"
      ? ""
      : rawWinner || markedPlayerWinner;

  const acceptedAdjudicatedWinner =
    winnerProof ===
      "replay_result_adjudication" ||
    parseReason ===
      "manual_result_adjudication";

  if (resolvedWinner) {
    /*
     * These rows have already crossed an authoritative product-level
     * truth boundary.
     *
     * Do not run them back through resolveReliableReplayWinner(),
     * whose job is to judge raw replay/parser evidence.
     *
     * - historical_inferred_fallback was explicitly accepted by the
     *   public replay sanitizer.
     * - replay_result_adjudication was explicitly accepted by the
     *   durable result-review ledger.
     */
    if (
      acceptedPublicFallback ||
      acceptedAdjudicatedWinner
    ) {
      return {
        headline:
          resolvedWinner,
        pill:
          acceptedAdjudicatedWinner
            ? h("Reviewed result")
            : h("Replay result"),
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
      headline:
        truthResult?.label ||
        (isSavedReplayCheckpoint(match)
          ? h("Saved checkpoint")
          : h("Result unproven")),
      pill: null,
    };
  }

  return {
    headline:
      isSavedReplayCheckpoint(match)
        ? h("Saved checkpoint")
        : h("Result under review"),
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
  const h = useHomeCopy();
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const playersLabel =
    formatReplayTeamMatchup(
      match,
      h("HD battle record")
    );

  const matchupSides =
    playersLabel.split(
      " vs "
    );

  const leftMatchupSide =
    matchupSides[0] ??
    playersLabel;

  const rightMatchupSide =
    matchupSides[1] ??
    "";

  const hasTwoMatchupSides =
    matchupSides.length === 2 &&
    Boolean(
      leftMatchupSide &&
      rightMatchupSide
    );

  const leftMatchupPlayers =
    leftMatchupSide
      .split(" / ")
      .filter(Boolean);

  const rightMatchupPlayers =
    rightMatchupSide
      .split(" / ")
      .filter(Boolean);

  const isOneVOne =
    hasTwoMatchupSides &&
    leftMatchupPlayers.length === 1 &&
    rightMatchupPlayers.length === 1;

  const playedAt = pickLobbyMatchPlayedAt(match);
  const resultDisplay = getLobbyMatchResultDisplay(match, h);
  const resultReview = readLobbyResultReview(match);
  const humanConfirmedDesync =
    readLobbyHumanConfirmedDesync(
      match
    );

  return (
    <Link
      href={`/game-stats/${match.id}`}
      className={`relative block rounded-2xl border px-4 py-4 transition-colors duration-150 [content-visibility:auto] [contain-intrinsic-size:auto_8rem] ${
        isOneVOne
          ? ""
          : "min-h-[112px]"
      } ${tone.card} ${tone.cardHover}`}
    >
      {isOneVOne ? (
        /*
         * Exact legacy 1v1 presentation:
         *
         * MAP                          WINNER
         * Player vs Player
         */
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="font-medium text-white">
              {publicReplayMapLabel(
                match.map
              )}
            </div>

            <div className="mt-1 truncate text-sm text-slate-300">
              {playersLabel}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <div
              className={`text-xs uppercase tracking-[0.25em] ${
                humanConfirmedDesync
                  ? "font-black text-amber-200 drop-shadow-[0_0_12px_rgba(217,119,6,0.2)]"
                  : "text-slate-400"
              }`}
            >
              {h(resultDisplay.headline)}
            </div>
          </div>
        </div>
      ) : (
        /*
         * Premium team presentation:
         *
         * MAP                          WINNER
         *
         * TEAM / TEAM       VS       TEAM / TEAM
         */
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 font-medium text-white">
              {publicReplayMapLabel(
                match.map
              )}
            </div>

            <div className="max-w-[48%] shrink-0 text-right">
              <div
                className={`text-xs uppercase tracking-[0.25em] ${
                  humanConfirmedDesync
                    ? "font-black text-amber-200 drop-shadow-[0_0_12px_rgba(217,119,6,0.2)]"
                    : "text-slate-400"
                }`}
              >
                {h(resultDisplay.headline)}
              </div>
            </div>
          </div>

          {hasTwoMatchupSides ? (
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-[11px] leading-[1.45] text-slate-300 sm:text-xs">
              <div className="min-w-0 [overflow-wrap:anywhere]">
                {leftMatchupSide}
              </div>

              <div className="pt-px text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                {h("vs")}
              </div>

              <div className="min-w-0 text-right [overflow-wrap:anywhere]">
                {rightMatchupSide}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-[11px] leading-[1.45] text-slate-300 [overflow-wrap:anywhere] sm:text-xs">
              {playersLabel}
            </div>
          )}
        </>
      )}

      {playedAt ? (
        <div className="mt-3 text-xs text-slate-400">
          <TimeDisplayText value={playedAt} />
        </div>
      ) : null}

      {resultReview.reviewed ? (
        <span
          className="absolute bottom-4 right-4 inline-flex text-slate-400/35"
          aria-label={
            h(resultReview.reviewLabel || "Human reviewed")
          }
        >
          <UserRound
            aria-hidden="true"
            className="h-[9px] w-[9px]"
            strokeWidth={1.5}
          />
        </span>
      ) : null}
    </Link>
  );
});
