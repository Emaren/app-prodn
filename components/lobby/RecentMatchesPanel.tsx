"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
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
    humanConfirmedDesync?: unknown;
    parseReason?: unknown;
  };

  return JSON.stringify({
    map: candidate.map,
    players: candidate.players,
    winner: candidate.winner,
    winnerProof: candidate.winnerProof,
    reviewNeeded: candidate.reviewNeeded,
    unresolvedResult: candidate.unresolvedResult,
    humanConfirmedDesync:
      candidate.humanConfirmedDesync,
    parseReason:
      candidate.parse_reason ||
      candidate.parseReason ||
      "",
    reviewedResult: readLobbyResultReview(match),
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

    /*
     * The first list is the authoritative/fresher page in every
     * same-ID merge path. Never let an older cached row restore
     * or erase a desync marker merely because its winner score
     * happens to be stronger.
     */
    const currentDesyncMarker =
      (
        current as {
          humanConfirmedDesync?:
            unknown;
        }
      ).humanConfirmedDesync;

    const incomingDesyncMarker =
      (
        match as {
          humanConfirmedDesync?:
            unknown;
        }
      ).humanConfirmedDesync;

    if (
      typeof currentDesyncMarker ===
        "boolean" &&
      typeof incomingDesyncMarker ===
        "boolean" &&
      currentDesyncMarker !==
        incomingDesyncMarker
    ) {
      continue;
    }

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
  const h = useHomeCopy();
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
      className={`relative block rounded-2xl border px-4 py-4 transition-colors duration-150 ${
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
