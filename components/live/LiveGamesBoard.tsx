"use client";

import Link from "next/link";
import {
  Archive,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crown,
  Flame,
  Gamepad2,
  Radio,
  Sparkles,
  Swords,
  Trophy,
  Upload,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { UIEvent } from "react";

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import { displayName } from "@/components/lobby/utils";
import LiveStreamFrame from "@/components/streaming/LiveStreamFrame";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import { battleLoopForSeed } from "@/lib/battleLoopClips";
import {
  isBettableLiveWinnerMarket,
} from "@/lib/liveBetMarketPolicy";
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { useUserAuth } from "@/context/UserAuthContext";
import type { LiveGamesSnapshot } from "@/lib/liveGames";
import {
  liveSessionIdentity,
  reconcileLiveGamesSnapshots,
} from "@/lib/liveGamesClientReconcile";
import { getTournamentMatchStatusLabel } from "@/lib/lobby";
import {
  normalizePublicReplayText,
  normalizeResolvedWinner,
  publicReplayMapLabel,
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";
import {
  readStoredLiveGamesViewMode,
  TILE_VIEW_MODES,
  type TileViewMode,
  writeStoredLiveGamesViewMode,
} from "@/lib/tileViewPreferences";
import type { WatchStreamPayload } from "@/lib/watchStreams";

type LiveGamesBoardProps = {
  initialSnapshot: LiveGamesSnapshot;
};

type LiveSession = LiveGamesSnapshot["activeSessions"][number];
type RecentMatch = LiveGamesSnapshot["recentMatches"][number];
type ClassicLiveTone = "crimson" | "violet";

const LIVE_GAMES_POLL_INTERVAL_MS = 5_000;
const MAX_VISIBLE_OUTCOMES = 3;
const MAX_EXTREME_ARCHIVE_MATCHES = 9;

const RESOLVED_SCHEDULED_STATES = new Set([
  "completed",
  "forfeited",
  "no_show_left",
  "no_show_right",
  "double_no_show",
  "refunded",
]);

const ACCEPTED_SCHEDULED_STATES = new Set([
  "accepted",
  "terms_accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
  "checkin_open",
  "left_checked_in",
  "right_checked_in",
  "ready",
]);

function formatTime(value: string | null, mounted: boolean) {
  void mounted;
  return <TimeDisplayText value={value} emptyValue="Now" />;
}

function formatUpdatedTime(value: string | null, mounted: boolean) {
  void mounted;
  return <TimeDisplayText value={value} timeOnly emptyValue="Now" />;
}

function formatDurationCompact(value: number | null) {
  if (!value || value <= 0) return null;

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${Math.max(1, minutes)}m`;
}

function playerLabel(
  entrant:
    | {
        inGameName: string | null;
        steamPersonaName: string | null;
      }
    | null
    | undefined
) {
  if (!entrant) return "Open slot";
  return displayName(entrant.inGameName, entrant.steamPersonaName);
}

function uniqueNonEmpty(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const value of values) {
    const name = normalizePublicReplayText(value);
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(name);
  }

  return names;
}

function sessionKnownParticipantNames(session: Pick<LiveSession, "players" | "uploader" | "uploaders">) {
  return uniqueNonEmpty([
    ...session.players.map((player) => player.name),
    ...(session.uploaders ?? []).map((uploader) => uploader.displayName),
    session.uploader?.displayName,
  ]);
}

function resolvedReplayTeamTitle(session: LiveSession) {
  const resolution = session.teamResolution;
  if (
    resolution?.status !== "resolved" ||
    resolution.confidence !== "high" ||
    resolution.teams.length !== 2
  ) {
    return null;
  }
  const labels = resolution.teams.map((team) =>
    team.players.map((player) => player.name).filter(Boolean).join(" / ")
  );
  return labels.every(Boolean) ? `${labels[0]} vs ${labels[1]}` : null;
}

function sessionTitle(session: LiveSession) {
  const replayTeamTitle = resolvedReplayTeamTitle(session);
  if (replayTeamTitle) return replayTeamTitle;

  // Betting markets already preserve the authoritative team
  // presentation: teammates separated by "/" and one "vs"
  // between the two complete sides.
  const marketTitle = normalizePublicReplayText(
    session.reviewMarket?.title
  );

  if (
    marketTitle &&
    /\s+vs\s+/i.test(marketTitle)
  ) {
    return marketTitle;
  }

  const names = sessionKnownParticipantNames(session);

  if (names.length >= 2) {
    return names.join(" · ");
  }

  if (names.length === 1) {
    return `${names[0]}'s recorded battle`;
  }

  if (session.state === "live") {
    return "Battle proof assembling";
  }

  return session.originalFilename || "HD battle record";
}

// AOE2WAR_LIVE_WINNER_MARKET_PROJECTION
function liveMarketHref(session: LiveSession) {
  const market =
    session.reviewMarket;

  const marketId =
    market?.id;

  if (
    session.finalProofPending ||
    session.state === "completed" ||
    !isBettableLiveWinnerMarket(
      market
    ) ||
    marketId === null ||
    marketId === undefined
  ) {
    return null;
  }

  return `/bets/${encodeURIComponent(String(marketId))}`;
}

function hasLiveBetMarket(session: LiveSession) {
  return Boolean(liveMarketHref(session));
}

function sessionStatsHref(session: LiveSession) {
  const marketHref = liveMarketHref(session);
  if (marketHref) return marketHref;

  return (session.state === "completed" || session.finalProofPending) &&
    Number.isSafeInteger(session.id) &&
    session.id > 0
    ? `/game-stats/${session.id}`
    : `/game-stats/live/${encodeURIComponent(session.sessionKey)}`;
}

function liveSessionPrimaryActionLabel(session: LiveSession) {
  if (session.finalProofPending) return "Open final proof";
  if (hasLiveBetMarket(session)) return "Bet live";
  if (session.disposition === "saved_rehost") return "Open session evidence";
  return session.state === "completed" ? "Open final stats" : "Watch live stats";
}

// AOE2WAR_SINGLE_LIVE_BET_CTA_20260724
function liveSessionStatusLabel(session: LiveSession) {
  if (session.finalProofPending) return "Final proof pending";
  if (hasLiveBetMarket(session)) return "Betting open";
  if (session.disposition === "saved_rehost") return "Saved / rehosted";
  return session.state === "completed" ? "Final stored" : "Live parse";
}

function replayReviewHref(session: LiveSession) {
  return `/game-stats/${encodeURIComponent(String(session.id))}/review`;
}

function canReviewReplaySession(
  session: LiveSession,
  viewerUid: string | null | undefined,
  isAdmin: boolean,
  canReviewOwnReplayResults: boolean
) {
  if (
    (!session.finalProofPending && session.state !== "completed") ||
    !Number.isSafeInteger(session.id) ||
    session.id <= 0
  ) {
    return false;
  }
  if (session.disposition === "saved_rehost") return false;
  if (isAdmin) return true;
  if (!viewerUid || !canReviewOwnReplayResults) return false;

  return [
    ...(session.uploaders ?? []).map((uploader) => uploader.uid),
    session.uploader?.uid ?? null,
  ].some((uid) => uid === viewerUid);
}

function liveDisplayTitle(session: LiveSession) {
  const names = sessionKnownParticipantNames(session);

  if (session.players.length === 0 && names.length >= 2) {
    return names.join(" vs ");
  }

  if (session.players.length === 0 && names.length === 1) {
    return session.state === "live"
      ? `${names[0]}'s live battle`
      : `${names[0]}'s recorded battle`;
  }

  const title = sessionTitle(session);
  const genericProofTitle = title === "Battle proof assembling" || title === "Game in progress";
  const fileLike =
    title === session.originalFilename ||
    title === session.replayFile ||
    title.endsWith(".aoe2record") ||
    title.endsWith(".aoe2mpgame");

  if (genericProofTitle || fileLike) {
    if (session.finalProofPending) return "Final proof pending";
    return session.state === "live" ? "Live HD battle" : "HD battle record";
  }

  return title;
}

function isManualUploadedReplaySession(session: Pick<LiveSession, "uploader" | "uploaders">) {
  return Boolean(session.uploader || (session.uploaders?.length ?? 0) > 0);
}

function liveSessionEyebrowLabel(session: LiveSession) {
  if (session.finalProofPending) return "Final proof pending";
  if (session.state !== "completed") return "Watcher live";
  if (session.disposition === "saved_rehost") return "Saved session";

  const hasResolvedPlayers = session.players.some((player) => {
    const maybePlayer = player as { winner?: boolean | null; name?: string | null };
    return Boolean(String(maybePlayer.name ?? "").trim()) || maybePlayer.winner === true;
  });

  if (hasResolvedPlayers) return "Just finished";

  return isManualUploadedReplaySession(session) ? "Replay uploaded" : "Just finished";
}

function initials(value: string) {
  const parts = value
    .replace(/[\[\]_,.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
}

function recentMatchMap(match: RecentMatch) {
  return publicReplayMapLabel(match.map);
}

function recentMatchPlayers(match: RecentMatch) {
  if (!Array.isArray(match.players)) return [];

  const reliableWinner = resolveReliableReplayWinner({
    winner: match.winner,
    parseReason: match.parse_reason,
  });

  const normalizedPlayers = match.players
    .map((player) => ({
      name:
        normalizePublicReplayText(
          player?.name
        ) ?? "",
      winnerFlag:
        player?.winner === true
          ? true
          : player?.winner === false
            ? false
            : null,
    }))
    .filter((player) => player.name);

  const winnerFlagCount = normalizedPlayers.filter(
    (player) => player.winnerFlag === true
  ).length;

  const loserFlagCount = normalizedPlayers.filter(
    (player) => player.winnerFlag === false
  ).length;

  const isCompleteBalancedTeamFlagSplit =
    [4, 6, 8].includes(normalizedPlayers.length) &&
    winnerFlagCount >= 2 &&
    winnerFlagCount === loserFlagCount &&
    winnerFlagCount + loserFlagCount ===
      normalizedPlayers.length;

  // Display evidence only.
  //
  // This can visually identify the apparent winning side in
  // Recent Outcomes when every player in a 2v2/3v3/4v4 has a
  // complete balanced true/false winner split.
  //
  // It does NOT make the replay settlement-eligible and does
  // not alter resolveReliableReplayWinner().
  const showDisplayOnlyCandidate =
    !reliableWinner &&
    isCompleteBalancedTeamFlagSplit;

  return normalizedPlayers.map((player) => ({
    name: player.name,
    winner: Boolean(
      player.winnerFlag === true &&
      (
        reliableWinner ||
        showDisplayOnlyCandidate
      )
    ),
  }));
}

function recentMatchTitle(match: RecentMatch) {
  const players = recentMatchPlayers(match);
  if (players.length === 0) return "Replay-backed result";
  if (players.length === 1) return players[0].name;
  if (players.length === 2) return `${players[0].name} vs ${players[1].name}`;

  const winners = players.filter((player) => player.winner);
  const others = players.filter((player) => !player.winner);
  if (winners.length > 0 && others.length > 0) {
    const winnerLabel = winners
      .slice(0, 2)
      .map((player) => player.name)
      .join(" + ");
    const otherLabel = others
      .slice(0, 2)
      .map((player) => player.name)
      .join(" + ");
    return `${winnerLabel}${winners.length > 2 ? ` +${winners.length - 2}` : ""} vs ${otherLabel}${
      others.length > 2 ? ` +${others.length - 2}` : ""
    }`;
  }

  return `${players
    .slice(0, 3)
    .map((player) => player.name)
    .join(" · ")}${players.length > 3 ? ` +${players.length - 3}` : ""}`;
}

function recentMatchWinner(match: RecentMatch) {
  const winners = recentMatchPlayers(match)
    .filter((player) => player.winner)
    .map((player) => player.name);
  if (winners.length === 0) return null;
  return winners.length === 1 ? winners[0] : `${winners.length} winners`;
}


type DualWatcherProofUploader = {
  displayName?: string | null;
  name?: string | null;
  userName?: string | null;
  label?: string | null;
  parseRows?: number | null;
  rows?: number | null;
  replayRows?: number | null;
  uploadCount?: number | null;
};

function DualWatcherProofStack({
  uploaders,
}: {
  uploaders?: DualWatcherProofUploader[] | null;
}) {
  const proofUploaders = Array.isArray(uploaders)
    ? uploaders.filter((u) => Boolean(u.displayName || u.name || u.userName || u.label))
    : [];

  if (proofUploaders.length < 2) return null;

  return (
    <div className="mt-3 w-full rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-950/55 via-slate-950/75 to-yellow-950/25 p-3 shadow-[0_0_34px_rgba(16,185,129,0.16)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[0.58rem] font-black uppercase tracking-[0.34em] text-emerald-200/90">
          Dual watcher proof
        </div>
        <div className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[0.56rem] font-black uppercase tracking-[0.22em] text-emerald-100">
          {proofUploaders.length} live
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {proofUploaders.slice(0, 2).map((u, proofIndex) => {
          const label =
            u.displayName || u.name || u.userName || u.label || `Watcher ${proofIndex + 1}`;

          return (
            <div
              key={`${label}-${proofIndex}`}
              className="rounded-xl border border-white/10 bg-black/28 px-3 py-2 ring-1 ring-white/5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-black text-white">
                  {label}
                </div>
                <div className="h-2 w-2 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
              </div>
              <div className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.22em] text-slate-400">
                Verified
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LiveGamesBoard({ initialSnapshot }: LiveGamesBoardProps) {
  const { uid, isAdmin, canReviewOwnReplayResults } = useUserAuth();
  const { setViewMode: setSharedLiveGamesViewMode } = useTileViewPreference("live_games");
  const [viewMode, setViewMode] = useState<TileViewMode>("basic");
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [mounted, setMounted] = useState(false);
  const [actionState, setActionState] = useState<ScheduledMatchCardActionState>({
    challengeId: null,
    kind: null,
  });
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const appliedRequestSequenceRef = useRef(0);
  const activeSessionSeenAtRef = useRef(new Map<string, number>());

  useEffect(() => {
    setViewMode(readStoredLiveGamesViewMode());
  }, []);

  const handleViewModeChange = useCallback(
    (nextViewMode: TileViewMode) => {
      writeStoredLiveGamesViewMode(nextViewMode);
      setViewMode(nextViewMode);
      setSharedLiveGamesViewMode(nextViewMode);
    },
    [setSharedLiveGamesViewMode]
  );

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    const requestSequence = ++requestSequenceRef.current;
    refreshInFlightRef.current = true;
    try {
      const response = await fetch("/api/live-games", { cache: "no-store" });
      if (!response.ok) return;

      const payload = (await response.json()) as LiveGamesSnapshot;
      if (
        mountedRef.current &&
        requestSequence > appliedRequestSequenceRef.current
      ) {
        appliedRequestSequenceRef.current = requestSequence;
        setSnapshot((current) =>
          reconcileLiveGamesSnapshots(
            current,
            payload,
            activeSessionSeenAtRef.current
          )
        );
      }
    } catch (error) {
      console.warn("Failed to refresh live games:", error);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    setMounted(true);
    void refresh();

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    const interval = window.setInterval(() => {
      refreshIfVisible();
    }, LIVE_GAMES_POLL_INTERVAL_MS);

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener(
      "visibilitychange",
      refreshIfVisible
    );

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener(
        "visibilitychange",
        refreshIfVisible
      );
    };
  }, [refresh]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const liveScheduledMatches = useMemo(
    () => snapshot.scheduledMatches.filter((match) => match.displayState === "live"),
    [snapshot.scheduledMatches]
  );
  const allRecentScheduledMatches = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        RESOLVED_SCHEDULED_STATES.has(match.displayState)
      ),
    [snapshot.scheduledMatches]
  );
  const acceptedScheduledMatches = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ACCEPTED_SCHEDULED_STATES.has(match.displayState)
      ),
    [snapshot.scheduledMatches]
  );
  const pendingScheduledMatches = useMemo(
    () =>
      snapshot.scheduledMatches.filter((match) =>
        ["proposed", "pending"].includes(match.displayState)
      ),
    [snapshot.scheduledMatches]
  );
  const recentScheduledMatches = allRecentScheduledMatches.slice(
    0,
    MAX_VISIBLE_OUTCOMES
  );
  // Every preserved final stays in the public results rail. Evidence review is
  // a private action for authorized reviewers, not a public-facing quality label.
  const recentlyCompletedSessions = snapshot.recentlyCompletedSessions;
  const reviewCompletedSessions: LiveGamesSnapshot["recentlyCompletedSessions"] = [];
  const liveItemsCount =
    liveScheduledMatches.length +
    snapshot.activeSessions.length +
    snapshot.liveMatches.length;
  const visibleOutcomeCount =
    recentScheduledMatches.length + recentlyCompletedSessions.length;
  const totalOutcomeCount =
    allRecentScheduledMatches.length + snapshot.recentlyCompletedSessions.length;
  const onDeckCount =
    snapshot.readyMatches.length +
    acceptedScheduledMatches.length +
    pendingScheduledMatches.length;

  const updateChallenge = useCallback(
    async (
      challengeId: number,
      action: ScheduledMatchCardActionKind,
      extra?: {
        fundingTxHash?: string;
        fundingWalletAddress?: string;
        scheduledAt?: string;
        challengeNote?: string;
        wagerAmountWolo?: number;
        guaranteeAmountWolo?: number;
      }
    ) => {
      setActionState({ challengeId, kind: action });
      setBoardError(null);
      setBoardNotice(null);

      try {
        const response = await fetch(`/api/challenges/${challengeId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            ...extra,
          }),
        });

        const payload = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.detail || "Challenge could not be updated.");
        }

        setBoardNotice(
          action === "accept"
            ? "Challenge accepted. The match is now locked in on deck."
            : action === "decline"
              ? "Challenge declined."
              : "Challenge cancelled."
        );
        await refresh();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Challenge could not be updated.";
        setBoardError(message);
        throw new Error(message);
      } finally {
        setActionState({ challengeId: null, kind: null });
      }
    },
    [refresh]
  );

  const renderScheduledMatch = useCallback(
    (
      match: LiveGamesSnapshot["scheduledMatches"][number],
      {
        compact = false,
        detail = false,
      }: { compact?: boolean; detail?: boolean } = {}
    ) => (
      <ScheduledMatchCard
        key={`scheduled-${match.id}`}
        match={match}
        viewerUid={uid}
        defaultViewMode={compact ? "summary" : detail ? "detail" : "summary"}
        onAccept={(challengeId) => updateChallenge(challengeId, "accept")}
        onDecline={(challengeId) => updateChallenge(challengeId, "decline")}
        onCancel={(challengeId) => updateChallenge(challengeId, "cancel")}
        onReschedule={(challengeId, payload) =>
          updateChallenge(challengeId, "reschedule", payload)
        }
        onFund={(challengeId, payload) =>
          updateChallenge(challengeId, "fund", payload)
        }
        onCheckIn={(challengeId) => updateChallenge(challengeId, "check_in")}
        actionState={actionState}
        compact={compact}
      />
    ),
    [actionState, uid, updateChallenge]
  );

  const boardProps: BoardViewProps = {
    uid,
    isAdmin,
    canReviewOwnReplayResults,
    snapshot,
    mounted,
    liveItemsCount,
    onDeckCount,
    visibleOutcomeCount,
    totalOutcomeCount,
    liveScheduledMatches,
    acceptedScheduledMatches,
    pendingScheduledMatches,
    recentScheduledMatches,
    recentlyCompletedSessions,
    reviewCompletedSessions,
    renderScheduledMatch,
  };

  return (
    <main
      className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3"
      data-live-games-view={viewMode}
    >
      <SpeedReadyMarker route="/live-games" />
      <LiveBoardHeader
        snapshot={snapshot}
        mounted={mounted}
        viewMode={viewMode}
        liveItemsCount={liveItemsCount}
        onDeckCount={onDeckCount}
      />

      {boardError ? (
        <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {boardError}
        </div>
      ) : null}

      {boardNotice ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {boardNotice}
        </div>
      ) : null}

      {viewMode === "extreme" ? (
        <ExtremeBoard {...boardProps} viewMode={viewMode} onViewModeChange={handleViewModeChange} />
      ) : (
        <ClassicBoard {...boardProps} viewMode={viewMode} onViewModeChange={handleViewModeChange} />
      )}
    </main>
  );
}

function LiveBoardHeader({
  snapshot,
  mounted,
  viewMode,
  liveItemsCount,
  onDeckCount,
}: {
  snapshot: LiveGamesSnapshot;
  mounted: boolean;
  viewMode: TileViewMode;
  liveItemsCount: number;
  onDeckCount: number;
}) {
  const isExtreme = viewMode === "extreme";

  return (
    <section
      className={`relative overflow-hidden border border-white/10 ${
        isExtreme
          ? "rounded-[2.25rem] bg-[radial-gradient(circle_at_10%_15%,rgba(248,113,113,0.18),transparent_27%),radial-gradient(circle_at_88%_5%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,#111827,#07101f_52%,#020617)] px-5 py-6 shadow-[0_32px_120px_rgba(0,0,0,0.3)] sm:px-7 sm:py-7 lg:px-9"
          : "rounded-[1.9rem] bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.10),transparent_24%),linear-gradient(135deg,#101828,#0f172a_45%,#020617)] p-5 sm:rounded-[1.8rem] sm:p-6"
      }`}
    >
      {isExtreme ? (
        <>
          <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/55 to-transparent" />
          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-amber-200/10" />
          <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full border border-red-200/10" />
        </>
      ) : null}

      <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.38em] text-red-200/70">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-35" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-400" />
            </span>
            Live Games
          </div>
          <h1
            className={`mt-2 font-semibold tracking-[-0.035em] text-white ${
              isExtreme ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"
            }`}
          >
            {isExtreme ? "The battlefield, right now." : "Live board"}
          </h1>
          {isExtreme ? (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Watch the hot table, claim the next matchup, or drop an old replay
              into the living history of AoE2 HD.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 xl:items-end">
<div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone="red"
              icon={isExtreme ? <Radio className="h-3.5 w-3.5" /> : undefined}
              label={`${liveItemsCount} live`}
            />
            <StatusPill
              tone="amber"
              icon={isExtreme ? <CalendarClock className="h-3.5 w-3.5" /> : undefined}
              label={`${onDeckCount} ready`}
            />
            <StatusPill
              icon={isExtreme ? <Clock3 className="h-3.5 w-3.5" /> : undefined}
              label={formatUpdatedTime(snapshot.updatedAt, mounted)}
            />
            <Link
              href="/challenge"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 shadow-[0_10px_28px_rgba(251,191,36,0.16)] transition hover:-translate-y-0.5 hover:bg-amber-200"
            >
              {isExtreme ? <Swords className="h-4 w-4" /> : null}
              Schedule New Game
            </Link>
            {isExtreme ? (
              <Link
                href="/upload"
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sky-200/20 bg-sky-300/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:-translate-y-0.5 hover:border-sky-200/35 hover:bg-sky-300/15"
              >
                <Upload className="h-4 w-4" />
                Upload replay
              </Link>
            ) : (
              <Link
                href="/lobby"
                className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Lobby
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveGamesViewToggle({
  viewMode,
  onViewModeChange,
}: {
  viewMode: TileViewMode;
  onViewModeChange: (viewMode: TileViewMode) => void;
}) {
  return (
    <div
      className="inline-flex w-fit items-center rounded-full border border-white/[0.055] bg-slate-950/30 p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_10px_34px_rgba(2,6,23,0.18)] backdrop-blur"
      aria-label="Live Games view"
    >
      {TILE_VIEW_MODES.map((mode) => {
        const active = mode === viewMode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onViewModeChange(mode)}
            aria-pressed={active}
            className={`inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-semibold capitalize transition sm:px-3 ${
              active
                ? mode === "extreme"
                  ? "bg-amber-300/12 text-amber-100 shadow-[inset_0_1px_0_rgba(251,191,36,0.12)]"
                  : "bg-white/[0.055] text-slate-100 shadow-none"
                : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-200"
            }`}
          >
            {mode === "extreme" ? <Sparkles className="h-3 w-3" /> : null}
            {mode}
          </button>
        );
      })}
    </div>
  );
}

function StatusPill({
  label,
  icon,
  tone = "slate",
}: {
  label: ReactNode;
  icon?: ReactNode;
  tone?: "slate" | "red" | "amber" | "emerald";
}) {
  const toneClass = {
    slate: "border-white/10 bg-white/5 text-slate-300",
    red: "border-red-400/25 bg-red-500/10 text-red-100",
    amber: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    emerald: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${toneClass}`}
    >
      {icon}
      {label}
    </span>
  );
}

type BoardViewProps = {
  uid: string | null | undefined;
  isAdmin: boolean;
  canReviewOwnReplayResults: boolean;
  snapshot: LiveGamesSnapshot;
  mounted: boolean;
  liveItemsCount: number;
  onDeckCount: number;
  visibleOutcomeCount: number;
  totalOutcomeCount: number;
  liveScheduledMatches: LiveGamesSnapshot["scheduledMatches"];
  acceptedScheduledMatches: LiveGamesSnapshot["scheduledMatches"];
  pendingScheduledMatches: LiveGamesSnapshot["scheduledMatches"];
  recentScheduledMatches: LiveGamesSnapshot["scheduledMatches"];
  recentlyCompletedSessions: LiveGamesSnapshot["recentlyCompletedSessions"];
  reviewCompletedSessions: LiveGamesSnapshot["recentlyCompletedSessions"];
  renderScheduledMatch: (
    match: LiveGamesSnapshot["scheduledMatches"][number],
    options?: { compact?: boolean; detail?: boolean }
  ) => ReactNode;
};




function ClassicBoard({
  uid,
  isAdmin,
  canReviewOwnReplayResults,
  snapshot,
  mounted,
  liveScheduledMatches,
  acceptedScheduledMatches,
  pendingScheduledMatches,
  recentScheduledMatches,
  recentlyCompletedSessions,
  reviewCompletedSessions,
  liveItemsCount,
  onDeckCount,
  renderScheduledMatch,
  viewMode,
  onViewModeChange,
}: BoardViewProps & {
  viewMode: "basic" | "advanced";
  onViewModeChange: (viewMode: TileViewMode) => void;
}) {
  const advanced = viewMode === "advanced";
  const featuredCompletedSessions = recentlyCompletedSessions.slice(0, 3);
  const archivedCompletedSessions = advanced ? recentlyCompletedSessions.slice(3) : [];
  const [resolvedCardStyle, setResolvedCardStyle] = useState<ResolvedCardStyle>("crest");
  const cycleResolvedCardStyle = useCallback(() => {
    setResolvedCardStyle((current) =>
      current === "teams"
        ? "crest"
        : current === "crest"
          ? "ledger"
          : current === "ledger"
            ? "legacy"
            : "teams"
    );
  }, []);

  const [archiveMatches, setArchiveMatches] = useState<LiveGamesSnapshot["recentMatches"]>(snapshot.recentMatches);
  const [archiveOffset, setArchiveOffset] = useState(snapshot.recentMatches.length);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveHasMore, setArchiveHasMore] = useState(
    snapshot.recentMatches.length <
      snapshot.archiveTotal
  );
  const [liveTone] = useState<ClassicLiveTone>("violet");
  const [playingControlsOpen, setPlayingControlsOpen] = useState(false);

  useEffect(() => {
    setArchiveMatches(snapshot.recentMatches);
    setArchiveOffset(snapshot.recentMatches.length);
    setArchiveHasMore(
      snapshot.recentMatches.length <
        snapshot.archiveTotal
    );
  }, [
    snapshot.archiveTotal,
    snapshot.recentMatches,
  ]);

  const loadMoreArchiveMatches = useCallback(async () => {
    if (!advanced || archiveLoading || !archiveHasMore) return;

    setArchiveLoading(true);

    try {
      const response = await fetch(`/api/game_stats?archive=1&limit=12&offset=${archiveOffset}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        setArchiveHasMore(false);
        return;
      }

      const payload = await response.json();
      const nextMatches = Array.isArray(payload)
        ? (payload as LiveGamesSnapshot["recentMatches"])
        : Array.isArray(payload?.matches)
          ? (payload.matches as LiveGamesSnapshot["recentMatches"])
          : [];

      setArchiveMatches((current) => {
        const seen = new Set(current.map((match) => String(match.id)));
        const unique = nextMatches.filter((match) => !seen.has(String(match.id)));
        return [...current, ...unique];
      });

      setArchiveOffset((current) => current + nextMatches.length);

      if (nextMatches.length < 12) {
        setArchiveHasMore(false);
      }
    } catch {
      setArchiveHasMore(false);
    } finally {
      setArchiveLoading(false);
    }
  }, [advanced, archiveHasMore, archiveLoading, archiveOffset]);

  const handleArchiveScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

      if (distanceFromBottom < 1800) {
        void loadMoreArchiveMatches();
      }
    },
    [loadMoreArchiveMatches]
  );

  const archiveLoadedCount =
    archivedCompletedSessions.length +
    archiveMatches.length;

  const archiveItemCount =
    snapshot.archiveTotal;
  const recentOutcomeCount = recentScheduledMatches.length + featuredCompletedSessions.length;
  const sectionStatusLabel = liveItemsCount > 0 ? `${liveItemsCount} active` : "War room ready";
  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section
        data-playing-tone={liveTone}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            target.closest("[data-playing-content]") ||
            target.closest(
              "a,button,input,select,textarea,[role='button'],[role='link']"
            )
          ) {
            return;
          }

          setPlayingControlsOpen((current) => !current);
        }}
        className="min-w-0 rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-red-200/70">
              Now Playing
            </div>
            <h2 className="mt-2 text-3xl font-semibold text-white">Playing now</h2>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {playingControlsOpen ? (
              <LiveGamesViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
            ) : (
              <button
                type="button"
                onClick={() => setPlayingControlsOpen(true)}
                className="rounded-full border border-white/[0.055] bg-white/[0.025] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:border-white/10 hover:text-slate-300"
                title="Show Live Games view controls"
              >
                View
              </button>
            )}
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {sectionStatusLabel}
            </div>
          </div>
        </div>

        <div data-playing-content className="mt-5 space-y-4">
          {liveItemsCount === 0 ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-6 text-sm text-slate-300">
              No live games yet.
            </div>
          ) : (
            <>
              {liveScheduledMatches.map((match) => renderScheduledMatch(match, { detail: true }))}
              {snapshot.activeSessions.map((session) =>
                advanced ? (
                  <PremiumClassicLiveSessionCard
                    key={liveSessionIdentity(session)}
                    session={session}
                    liveTone={liveTone}
                    canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                  />
                ) : (
                  <ClassicLiveSessionCard
                    key={liveSessionIdentity(session)}
                    session={session}
                    mounted={mounted}
                    canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                  />
                )
              )}
              {snapshot.liveMatches.map((match) => (
                <ClassicTournamentLiveMatchCard
                  key={`match-${match.id}`}
                  match={match}
                  emphasis="live"
                  mounted={mounted}
                  premium={advanced}
                  liveTone={liveTone}
                />
              ))}
            </>
          )}
        </div>
      </section>

      <div className="min-w-0 space-y-6">
        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">On Deck</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Ready next</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              {onDeckCount} queued
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {onDeckCount === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                Nothing queued in ready.
              </div>
            ) : (
              <>
                {snapshot.readyMatches.map((match) => (
                  <ClassicTournamentLiveMatchCard
                    key={`ready-${match.id}`}
                    match={match}
                    emphasis="ready"
                    compact
                    mounted={mounted}
                  premium={advanced}
                  />
                ))}
                {acceptedScheduledMatches.map((match) => renderScheduledMatch(match, { compact: true }))}
                {pendingScheduledMatches.map((match) => renderScheduledMatch(match, { compact: true }))}
              </>
            )}
          </div>
        </section>

        <section
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("a,button,input,select,textarea")) return;
            if (target.closest("[data-resolved-outcome-card]")) return;
            if (advanced) cycleResolvedCardStyle();
          }}
          className="cursor-pointer rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 transition hover:border-emerald-200/20 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">Resolved</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recent outcomes</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              {recentOutcomeCount} resolved
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {recentOutcomeCount === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                No resolved live outcomes yet.
              </div>
            ) : (
              <>
                {recentScheduledMatches.map((match) => renderScheduledMatch(match, { compact: true }))}
                {featuredCompletedSessions.map((session) =>
                  advanced ? (
                    <PremiumClassicLiveSessionCard
                      key={`completed-${liveSessionIdentity(session)}`}
                      session={session}
                      liveTone={liveTone}
                      resolvedStyle={resolvedCardStyle}
                      canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                    />
                  ) : (
                    <ClassicLiveSessionCard
                      key={`completed-${liveSessionIdentity(session)}`}
                      session={session}
                      mounted={mounted}
                      canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                    />
                  )
                )}
              </>
            )}
          </div>
        </section>

        {reviewCompletedSessions.length > 0 ? (
          <section className="rounded-[1.8rem] border border-amber-200/12 bg-amber-300/[0.035] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-amber-100/65">
                  Parser Review
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Final proof awaiting a verdict
                </h2>
              </div>
              <div className="rounded-full border border-amber-200/15 bg-amber-300/[0.06] px-3 py-1 text-xs text-amber-100">
                {reviewCompletedSessions.length} needs review
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {reviewCompletedSessions.map((session) => (
                <ClassicLiveSessionCard
                  key={`review-${liveSessionIdentity(session)}`}
                  session={session}
                  mounted={mounted}
                  canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <Link
                href="/battle-archive"
                className="group flex min-w-0 flex-1 items-start justify-between gap-4 rounded-2xl transition hover:bg-white/[0.025]"
              >
                <div>
                  <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">
                    Archive
                  </div>

                  <h2 className="mt-2 text-2xl font-semibold text-white transition group-hover:text-sky-100">
                    Recently Played
                  </h2>

                  <div className="mt-2 text-xs text-slate-500">
                    Open the complete battle archive
                  </div>
                </div>

                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition group-hover:border-sky-300/25 group-hover:text-sky-100">
                  {archiveItemCount} filed
                </div>
              </Link>
            </div>

            <div onScroll={handleArchiveScroll} className="mt-5 max-h-[34rem] space-y-3 overflow-y-auto scroll-smooth overscroll-contain pr-1 [scrollbar-color:rgba(148,163,184,0.45)_transparent] [scrollbar-width:thin]">
              {archiveLoadedCount === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Waiting on the next completed match.
                </div>
              ) : (
                <>
                  {archivedCompletedSessions.map((session) => (
                    <Link
                      key={`archive-upload-${liveSessionIdentity(session)}`}
                      href={`/game-stats/live/${encodeURIComponent(session.sessionKey)}`}
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/7"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {session.players.length > 0
                              ? session.players.map((player) => player.name).filter(Boolean).join(" vs ")
                              : liveDisplayTitle(session)}
                          </div>
                          <div className="mt-1 text-sm text-slate-300">
                            {publicReplayMapLabel(session.mapName)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-400">
                          {formatTime(session.playedOn || session.completedAt || session.updatedAt, mounted)}
                        </div>
                      </div>
                    </Link>
                  ))}

                  {archiveMatches.map((match) => (
                    <Link
                      key={match.id}
                      href={`/game-stats/${match.id}`}
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/7"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {recentMatchTitle(match)}
                          </div>
                          <div className="mt-1 text-sm text-slate-300">
                            {recentMatchMap(match)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-400">
                          {formatTime(match.played_on || match.timestamp, mounted)}
                        </div>
                      </div>
                    </Link>
                  ))}

                  {archiveLoading ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-center text-xs uppercase tracking-[0.24em] text-slate-400">
                      Loading history…
                    </div>
                  ) : archiveHasMore ? (
                    <button
                      type="button"
                      onClick={() => void loadMoreArchiveMatches()}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-center text-xs uppercase tracking-[0.24em] text-slate-400 transition hover:border-white/20 hover:text-white"
                    >
                      Scroll for more
                    </button>
                  ) : archiveMatches.length > 0 ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-center text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      End of loaded history
                    </div>
                  ) : null}
                </>
              )}
            </div>
        </section>
      </div>
    </section>
  );
}









// AOE2WAR_RESOLVED_CARD_STYLES
type ResolvedCardStyle = "teams" | "crest" | "ledger" | "legacy";
type PremiumResolvedCardStyle = Exclude<ResolvedCardStyle, "legacy">;

function resolvedPlayerNames(session: LiveSession) {
  return session.players
    .map((player) => String(player?.name ?? "").trim())
    .filter(Boolean);
}

function resolvedWinnerName(session: LiveSession) {
  return normalizeResolvedWinner(session.winner);
}

function resolveClientWinningTeamIndex(
  resolution: LiveSession["teamResolution"]
) {
  if (resolution.status !== "resolved" || resolution.teams.length !== 2) {
    return null;
  }

  const flags = resolution.teams.map((team) =>
    team.players.map((player) => player.winner)
  );

  const winningIndexes = flags
    .map((teamFlags, index) =>
      teamFlags.length > 0 && teamFlags.every((flag) => flag === true)
        ? index
        : -1
    )
    .filter((index) => index >= 0);

  const losingIndexes = flags
    .map((teamFlags, index) =>
      teamFlags.length > 0 && teamFlags.every((flag) => flag === false)
        ? index
        : -1
    )
    .filter((index) => index >= 0);

  return winningIndexes.length === 1 &&
    losingIndexes.length === 1 &&
    winningIndexes[0] !== losingIndexes[0]
    ? winningIndexes[0]
    : null;
}

function compactResolvedNames(names: string[], max = 2) {
  if (names.length <= max) return names.join(" + ");
  return `${names.slice(0, max).join(" + ")} +${names.length - max}`;
}

function resolvedBattleSizeLabel(playerCount: number) {
  if (playerCount <= 1) return "Replay";
  if (playerCount === 2) return "1v1";
  if (playerCount % 2 === 0) return `${playerCount / 2}v${playerCount / 2}`;
  return `${playerCount}-player`;
}

function resolvedSessionDisplay(session: LiveSession) {
  const names = resolvedPlayerNames(session);
  const winnerName = resolvedWinnerName(session);
  const mapName = publicReplayMapLabel(session.mapName, "HD Battlefield");
  const battleSize = resolvedBattleSizeLabel(names.length);
  const resolution = session.teamResolution;

  const neutralDisplay = {
    names,
    winnerName: null,
    battleSize,
    mapName,
    heroTitle: `${battleSize} battle archived`,
    heroSubtitle: `${compactResolvedNames(names, 4)} · ${mapName}`,
    leftLabel: "Replay roster",
    rightLabel: "HD War Vault",
    leftNames: names,
    rightNames: [] as string[],
    teamsResolved: false,
  };

  if (names.length === 2) {
    if (
      resolution.status !== "resolved" ||
      resolution.confidence !== "high" ||
      resolution.format !== "1v1"
    ) {
      return neutralDisplay;
    }

    const winnerIndex = winnerName
      ? names.findIndex((name) => name.toLowerCase() === winnerName.toLowerCase())
      : -1;
    if (winnerIndex < 0) return neutralDisplay;

    const duelWinner = names[winnerIndex];
    const loserName = names[winnerIndex === 0 ? 1 : 0];
    return {
      names,
      winnerName: duelWinner,
      battleSize,
      mapName,
      heroTitle: `${duelWinner} wins the duel`,
      heroSubtitle: `${duelWinner} defeated ${loserName} · ${mapName}`,
      leftLabel: "Winner",
      rightLabel: "Challenger",
      leftNames: [duelWinner],
      rightNames: [loserName],
      teamsResolved: true,
    };
  }

  if (names.length < 2) return neutralDisplay;

  const winningIndex = resolveClientWinningTeamIndex(resolution);
  if (
    resolution.status !== "resolved" ||
    resolution.confidence !== "high" ||
    resolution.teams.length !== 2 ||
    winningIndex === null
  ) {
    return neutralDisplay;
  }

  const losingIndex = winningIndex === 0 ? 1 : 0;
  const leftTeam = resolution.teams[winningIndex];
  const rightTeam = resolution.teams[losingIndex];
  const winnerSide = leftTeam.players.map((player) => player.name);
  const fieldSide = rightTeam.players.map((player) => player.name);
  const leadWinner = winnerSide[0];

  const teamTitle = `Team ${leadWinner} wins ${battleSize}`;
  const teamSubtitle = `${compactResolvedNames(winnerSide, 3)} defeated ${compactResolvedNames(fieldSide, 3)} · ${mapName}`;

  return {
    names,
    winnerName: leadWinner,
    battleSize,
    mapName,
    heroTitle: teamTitle,
    heroSubtitle: teamSubtitle,
    leftLabel: "Victory side",
    rightLabel: "Defeated side",
    leftNames: winnerSide,
    rightNames: fieldSide,
    teamsResolved: true,
  };
}

function UnresolvedReplayOutcomeCard({ session }: { session: LiveSession }) {
  const unresolved = session.unresolvedResult;
  if (!unresolved) return null;
  const savedForRehost = session.disposition === "saved_rehost";

  const gameHref = sessionStatsHref(session);
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;
  const names = resolvedPlayerNames(session);
  return (
    <article
      className="relative overflow-hidden rounded-[1.75rem] border border-emerald-200/16 bg-[radial-gradient(circle_at_88%_10%,rgba(52,211,153,0.10),transparent_34%),linear-gradient(145deg,rgba(15,41,45,0.90),rgba(2,6,23,0.96))] px-5 py-5 shadow-[0_24px_80px_rgba(2,6,23,0.32)]"
      data-unresolved-result={unresolved.code}
      aria-label={savedForRehost ? "HD session saved for rehost" : "HD replay preserved"}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/35 to-transparent" />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-100/70">
              <Archive className="h-4 w-4" />
              {savedForRehost ? "Saved Session" : "HD War Vault"}
            </div>
            <h3 className="mt-3 font-serif text-[1.55rem] leading-none tracking-[-0.025em] text-white">
              {savedForRehost ? "Session saved for rehost" : "Battle record preserved"}
            </h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
              {savedForRehost
                ? "The replay and both teams were preserved. Play stopped on an intentional save event, so there is no winner to review or settle."
                : "The replay, roster, and battle tape are filed for the permanent HD record."}
            </p>
          </div>
          <span className="rounded-full border border-emerald-200/20 bg-emerald-300/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
            {liveSessionStatusLabel(session)}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {names.map((name) => (
            <span
              key={name}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-200"
            >
              {name}
            </span>
          ))}
          {normalizePublicReplayText(session.mapName) ? (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
              {publicReplayMapLabel(session.mapName)}
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
          <Link
            href={gameHref}
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-300/15"
          >
            Open battle record
          </Link>
          {session.primaryStream ? (
            <Link
              href={watchHref}
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-sky-200/18 bg-sky-300/10 px-4 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15"
            >
              Watch preserved video
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function NeutralResolvedRosterCard({
  session,
  display,
}: {
  session: LiveSession;
  display: ReturnType<typeof resolvedSessionDisplay>;
}) {
  return (
    <article className="relative overflow-hidden rounded-[1.75rem] border border-sky-200/18 bg-[linear-gradient(145deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))] px-5 py-5 shadow-[0_24px_80px_rgba(2,6,23,0.32)]">
      <div className="text-[10px] font-black uppercase tracking-[0.3em] text-sky-100/60">
        Final replay · battle archived
      </div>
      <h3 className="mt-3 font-serif text-[1.45rem] text-white">{display.heroTitle}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-300">{display.heroSubtitle}</p>
      <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        {display.names.map((name) => (
          <span
            key={name}
            className="rounded-full border border-white/10 bg-black/22 px-3 py-1.5 text-xs font-semibold text-slate-100"
          >
            {name}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Replay roster preserved in the permanent HD archive
        </span>
        <Link
          href={sessionStatsHref(session)}
          className="inline-flex h-9 items-center justify-center rounded-full border border-sky-200/18 bg-sky-300/10 px-4 text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15"
        >
          Open replay
        </Link>
      </div>
    </article>
  );
}

function PremiumResolvedOutcomeCard({
  session,
  resolvedStyle,
}: {
  session: LiveSession;
  resolvedStyle: PremiumResolvedCardStyle;
}) {
  if (session.unresolvedResult) {
    return <UnresolvedReplayOutcomeCard session={session} />;
  }

  const sessionAny = session as Record<string, unknown>;
  const display = resolvedSessionDisplay(session);
  if (!display.teamsResolved) {
    return <NeutralResolvedRosterCard session={session} display={display} />;
  }
  const gameHref = sessionStatsHref(session);
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;
  const durationLabel = formatDurationCompact(session.durationSeconds);
  const rawGameNumber =
    sessionAny["aoe2warGameId"] ??
    sessionAny["gameNumber"] ??
    sessionAny["sourceGameId"] ??
    sessionAny["gameId"] ??
    sessionAny["matchId"] ??
    sessionAny["id"];

  const gameNumber =
    typeof rawGameNumber === "number" || typeof rawGameNumber === "string"
      ? String(rawGameNumber)
      : null;

  const metaParts = [
    gameNumber ? `#${gameNumber}` : null,
    display.battleSize,
    durationLabel,
  ].filter(Boolean) as string[];

  const victoryNameSet = new Set(display.leftNames.map((name) => name.toLowerCase()));

  if (resolvedStyle === "teams") {
    return (
      <article
        onClick={(event) => event.stopPropagation()}
        className="group relative cursor-default overflow-hidden rounded-[2.15rem] border border-cyan-100/22 bg-[linear-gradient(145deg,rgba(2,6,23,0.98),rgba(15,23,42,0.92)_44%,rgba(8,47,73,0.56))] px-4 py-4 shadow-[0_28px_90px_rgba(2,6,23,0.42)] sm:px-5 sm:py-5"
        data-resolved-outcome-card="true"
        aria-label={`Resolved outcome card for ${display.heroTitle}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(34,211,238,0.14),transparent_30%),radial-gradient(circle_at_88%_14%,rgba(251,191,36,0.10),transparent_28%),linear-gradient(90deg,rgba(255,255,255,0.03),transparent_16%,transparent_84%,rgba(255,255,255,0.03))]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-100/50 to-transparent" />

        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full border border-cyan-100/20 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-cyan-50/90">
                {display.battleSize}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.34em] text-slate-200/80">
                {liveSessionEyebrowLabel(session)}
              </span>
            </div>

            <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              {metaParts.join(" · ")}
            </span>
          </div>

          <div className="mt-4 grid items-stretch gap-3 [grid-template-columns:minmax(0,1fr)_3.5rem_minmax(0,1fr)]">
            <div className="relative rounded-[1.45rem] border border-amber-200/40 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.12),transparent_34%),rgba(6,78,59,0.18)] p-3 shadow-[0_0_36px_rgba(251,191,36,0.08),inset_0_1px_0_rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-amber-100/30 bg-amber-300/12 text-amber-100 shadow-[0_0_24px_rgba(251,191,36,0.16)]">
                  <Crown className="h-3.5 w-3.5" strokeWidth={1.7} />
                </span>
                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/82">
                  {display.leftLabel}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {display.leftNames.slice(0, 4).map((name, index) => (
                  <div
                    key={`team-left-${name}-${index}`}
                    className="rounded-[1rem] border border-amber-100/22 bg-slate-950/42 px-3 py-2 font-serif text-[0.98rem] font-semibold leading-[1.05] tracking-[-0.015em] text-amber-50 [overflow-wrap:anywhere] shadow-[0_10px_28px_rgba(0,0,0,0.22)] sm:text-[1.06rem]"
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-center">
              <div className="relative grid h-12 w-12 place-items-center rounded-full border border-amber-100/22 bg-slate-950/65 font-serif text-sm italic tracking-[0.14em] text-amber-50 shadow-[0_18px_40px_rgba(0,0,0,0.28)]">
                <div className="pointer-events-none absolute -left-5 top-1/2 h-px w-5 bg-gradient-to-l from-amber-100/22 to-transparent" />
                <div className="pointer-events-none absolute -right-5 top-1/2 h-px w-5 bg-gradient-to-r from-amber-100/22 to-transparent" />
                vs
              </div>
            </div>

            <div className="rounded-[1.45rem] border border-white/12 bg-white/[0.04] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex h-7 items-center">
                <div className="text-[10px] font-black uppercase tracking-[0.32em] text-slate-300/70">
                  {display.rightLabel}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {display.rightNames.slice(0, 4).map((name, index) => (
                  <div
                    key={`team-right-${name}-${index}`}
                    className="rounded-[1rem] border border-white/10 bg-slate-950/40 px-3 py-2 font-serif text-[0.98rem] font-semibold leading-[1.05] tracking-[-0.015em] text-slate-100 [overflow-wrap:anywhere] shadow-[0_10px_28px_rgba(0,0,0,0.18)] sm:text-[1.06rem]"
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-4">
            <div className="grid items-start gap-3 [grid-template-columns:6.8rem_minmax(0,1fr)]">
              <Link
                href={watchHref}
                onClick={(event) => event.stopPropagation()}
                className="relative z-20 block overflow-hidden rounded-[1rem] border border-amber-100/18 bg-black/55 shadow-[0_16px_44px_rgba(0,0,0,0.30)] transition hover:scale-[1.02] hover:border-amber-100/32"
                aria-label={`Watch ${display.heroTitle}`}
              >
                <video
                  className="h-[4.9rem] w-full object-cover opacity-92 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
                  src={battleLoopForSeed(session.sessionKey)}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              </Link>

              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.30em] text-slate-300/68">
                  Winning team
                </div>
                <h3 className="mt-1 font-serif text-[1.42rem] font-semibold leading-[0.96] tracking-[-0.03em] text-amber-50 [overflow-wrap:anywhere] sm:text-[1.62rem]">
                  {display.leftNames[0] || display.winnerName || "Victory"}
                </h3>
                <div className="mt-1 font-serif text-[1.2rem] font-semibold leading-none tracking-[-0.02em] text-slate-50 sm:text-[1.35rem]">
                  wins {display.battleSize}
                </div>
                <p className="mt-2 line-clamp-2 text-[12px] leading-5 text-slate-300 sm:text-[13px]">
                  {display.leftNames.join(" + ")}
                </p>
              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <Link
                href={gameHref}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex h-10 min-w-[9.2rem] items-center justify-center gap-2 rounded-full border border-amber-100/28 bg-amber-300/10 px-4 text-[12px] font-semibold text-amber-50 transition hover:border-amber-100/45 hover:bg-amber-300/15"
              >
                <span className="grid h-4 w-4 place-items-center rounded-full border border-amber-100/35 text-[10px] leading-none">
                  ✓
                </span>
                Final stored
              </Link>
            </div>
          </div>
        </div>
      </article>
    );
  }

  if (resolvedStyle === "ledger") {
    return (
      <article
        data-resolved-outcome-card
        onClick={(event) => event.stopPropagation()}
        className="group relative cursor-default overflow-hidden rounded-[1.75rem] border border-amber-200/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.92),rgba(30,41,59,0.62)_48%,rgba(2,6,23,0.92))] px-4 py-4 shadow-[0_24px_80px_rgba(2,6,23,0.32)] transition duration-300 hover:-translate-y-0.5 hover:border-amber-100/35 sm:px-5"
        aria-label={`Cycle resolved outcome card style for ${display.heroTitle}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(251,191,36,0.12),transparent_34%),radial-gradient(circle_at_92%_10%,rgba(16,185,129,0.16),transparent_30%)]" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/45 to-transparent" />

        <div className="relative grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem] sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-100/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-100/80">
                {display.battleSize}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-100/55">
                {liveSessionEyebrowLabel(session)}
              </span>
            </div>

            <h3 className="mt-3 font-serif text-[1.28rem] leading-[1.04] tracking-[-0.015em] text-slate-50 sm:text-[1.5rem]">
              {display.heroTitle}
            </h3>

            <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-300">
              {display.heroSubtitle}
            </p>
          </div>

          <Link
            href={watchHref}
            onClick={(event) => event.stopPropagation()}
            className="relative z-20 block overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-[0_18px_48px_rgba(0,0,0,0.32)] transition hover:scale-[1.02] hover:border-amber-100/30"
            aria-label={`Watch ${display.heroTitle}`}
          >
            <video
              className="h-[4.7rem] w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.04] sm:h-[5.1rem]"
              src={battleLoopForSeed(session.sessionKey)}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
          </Link>

          <div className="col-span-full grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-200/15 bg-emerald-300/[0.06] px-3 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-emerald-100/55">
                {display.leftLabel}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {display.leftNames.slice(0, 6).map((name) => (
                  <span key={`left-${name}`} className="rounded-full border border-emerald-100/15 bg-emerald-300/10 px-2 py-1 text-[11px] font-semibold text-emerald-50">
                    {name}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3">
              <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-slate-400">
                {display.rightLabel}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {display.rightNames.slice(0, 8).map((name) => (
                  <span key={`right-${name}`} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold text-slate-200">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/55">
              {metaParts.join(" · ")}
            </div>
            <Link
              href={gameHref}
              onClick={(event) => event.stopPropagation()}
              className="inline-flex h-8 min-w-[8.6rem] items-center justify-center rounded-full border border-amber-100/20 bg-amber-300/10 px-4 text-[11px] font-semibold text-amber-50 transition hover:border-amber-100/40 hover:bg-amber-300/15"
            >
              Final stored
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-resolved-outcome-card
      className="group relative cursor-pointer overflow-hidden rounded-[2rem] border border-emerald-200/18 bg-[linear-gradient(145deg,rgba(6,78,59,0.55),rgba(2,6,23,0.92)_58%,rgba(15,23,42,0.94))] px-5 py-5 shadow-[0_30px_100px_rgba(16,185,129,0.13)] transition duration-300 hover:-translate-y-0.5 hover:border-emerald-100/35 sm:px-6"
      aria-label={`Cycle resolved outcome card style for ${display.heroTitle}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_8%,rgba(52,211,153,0.20),transparent_34%),radial-gradient(circle_at_6%_100%,rgba(34,211,238,0.10),transparent_32%)]" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full border border-emerald-100/10" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-emerald-100/55 to-transparent" />

      <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.42em] text-emerald-100/68">
            {liveSessionEyebrowLabel(session)}
          </div>

          <h3 className="mt-3 font-serif text-[1.55rem] leading-[0.98] tracking-[-0.028em] text-white sm:text-[1.85rem]">
            {display.heroTitle}
          </h3>

          <p className="mt-3 line-clamp-2 max-w-[28rem] text-sm leading-5 text-emerald-50/72">
            {display.heroSubtitle}
          </p>

          <div className="mt-4 flex flex-wrap gap-1.5">
            {display.names.slice(0, 8).map((name) => {
              const isWinner = victoryNameSet.has(name.toLowerCase());
              return (
                <span
                  key={name}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    isWinner
                      ? "border-emerald-100/25 bg-emerald-300/12 text-emerald-50"
                      : "border-white/10 bg-white/[0.04] text-slate-200"
                  }`}
                >
                  {name}
                </span>
              );
            })}
          </div>
        </div>

        <Link
          href={watchHref}
          onClick={(event) => event.stopPropagation()}
          className="relative z-20 block overflow-hidden rounded-2xl border border-white/10 bg-black/55 shadow-[0_18px_50px_rgba(0,0,0,0.30)] transition hover:scale-[1.02] hover:border-sky-200/30"
          aria-label={`Watch ${display.heroTitle}`}
        >
          <video
            className="h-[4.9rem] w-full object-cover opacity-92 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100 sm:h-[5.3rem]"
            src={battleLoopForSeed(session.sessionKey)}
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        </Link>

        <div className="col-span-full mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-emerald-100/58">
            {metaParts.join(" · ")}
          </div>
          <Link
            href={gameHref}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex h-8 min-w-[8.6rem] items-center justify-center rounded-full border border-emerald-100/20 bg-emerald-300/10 px-4 text-[11px] font-semibold text-emerald-50 transition hover:border-emerald-100/40 hover:bg-emerald-300/15"
          >
            Final stored
          </Link>
        </div>
      </div>
    </article>
  );
}


function PremiumClassicLiveSessionCard({
  session,
  liveTone,
  resolvedStyle,
  canReviewResult = false,
}: {
  session: LiveGamesSnapshot["activeSessions"][number];
  liveTone: ClassicLiveTone;
  resolvedStyle?: ResolvedCardStyle;
  canReviewResult?: boolean;
}) {
  const sessionAny = session as Record<string, unknown>;
  const isCompleted = session.state === "completed";
  const gameHref = sessionStatsHref(session);
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;

  if (isCompleted && session.disposition !== "saved_rehost" && resolvedStyle && resolvedStyle !== "legacy") {
    return (
      <div className="relative">
        <PremiumResolvedOutcomeCard
          session={session}
          resolvedStyle={resolvedStyle}
        />
        {canReviewResult ? (
          <Link
            href={replayReviewHref(session)}
            className="absolute right-4 top-4 z-30 inline-flex min-h-9 items-center justify-center overflow-hidden rounded-full border border-amber-200/35 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.25),transparent_58%),linear-gradient(135deg,rgba(69,26,3,0.98),rgba(120,53,15,0.90)_52%,rgba(15,23,42,0.98))] px-4 py-2 text-[11px] font-bold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(120,53,15,0.28)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_34px_rgba(180,83,9,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"
          >
            Review Result
          </Link>
        ) : null}
      </div>
    );
  }

  const title = liveDisplayTitle(session);

  const eyebrowLabel = liveSessionEyebrowLabel(session);

  {/* FORCE_VISIBLE_DUAL_WATCHER_PROOF */}
  <DualWatcherProofStack uploaders={session.uploaders} />

  const statusLabel = liveSessionStatusLabel(session);
  const durationLabel = formatDurationCompact(session.durationSeconds);

  const rawGameNumber =
    sessionAny["aoe2warGameId"] ??
    sessionAny["gameNumber"] ??
    sessionAny["sourceGameId"] ??
    sessionAny["gameId"] ??
    sessionAny["matchId"] ??
    sessionAny["id"];

  const aoe2warGameNumber =
    typeof rawGameNumber === "number" || typeof rawGameNumber === "string"
      ? String(rawGameNumber)
      : null;

  const metaParts = [
    aoe2warGameNumber ? `#${aoe2warGameNumber}` : null,
    durationLabel || null,
  ].filter(Boolean) as string[];

  const winnerName = resolvedWinnerName(session);

  const activeShellClass =
    liveTone === "violet"
      ? "border-[#8a647e]/24 bg-[#2a1629]/62 shadow-[0_26px_90px_rgba(52,24,56,0.12)]"
      : "border-red-400/20 bg-red-500/10 shadow-[0_26px_90px_rgba(127,29,29,0.13)]";
  const activeEyebrowClass =
    liveTone === "violet" ? "text-[#ead8e7]/78" : "text-red-100/78";
  const activeMetaClass =
    liveTone === "violet" ? "text-[#d8bfd5]/62" : "text-red-100/62";
  const activeStatusClass =
    liveTone === "violet"
      ? "border-[#d8bfd5]/22 bg-[#3a2038]/44 text-[#fff4fb]"
      : "border-red-300/25 bg-red-500/12 text-red-50";
  const activeWinnerClass =
    liveTone === "violet" ? "text-[#d8bfd5]/62" : "text-red-100/62";
  const activeWinnerNameClass =
    liveTone === "violet" ? "text-[#fff4fb]/90" : "text-red-50/90";
  const shellClass = isCompleted
    ? "relative overflow-hidden rounded-[1.9rem] border border-emerald-400/20 bg-emerald-500/10 px-5 py-5 shadow-[0_26px_90px_rgba(16,185,129,0.12)] sm:px-6"
    : `relative overflow-hidden rounded-[1.9rem] border px-5 py-5 transition-[border-color,background,box-shadow] duration-500 sm:px-6 ${activeShellClass}`;

  const eyebrowClass = isCompleted ? "text-emerald-100/78" : activeEyebrowClass;
  const titleClass = isCompleted
    ? "mt-3 text-[1.26rem] font-semibold leading-[1.08] tracking-[-0.018em] text-slate-50/96 [text-shadow:0_1px_12px_rgba(2,6,23,0.24)] sm:text-[1.4rem]"
    : "mt-3 text-[1.26rem] font-semibold leading-[1.08] tracking-[-0.018em] text-slate-50/96 [text-shadow:0_1px_12px_rgba(2,6,23,0.24)] sm:text-[1.4rem]";
  const metaClass = isCompleted ? "text-emerald-100/62" : activeMetaClass;
  const statusClass = isCompleted
    ? "border-emerald-300/25 bg-emerald-500/12 text-emerald-50"
    : activeStatusClass;
  const winnerClass = isCompleted ? "text-emerald-100/62" : activeWinnerClass;
  const winnerNameClass = isCompleted ? "text-emerald-50/90" : activeWinnerNameClass;

  const goToStats = () => {
    window.location.href = gameHref;
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={goToStats}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goToStats();
        }
      }}
      className={`${shellClass} cursor-pointer transition duration-200 hover:-translate-y-0.5 hover:border-white/20`}
      aria-label={`Open final stats for ${title}`}
    >
      {isCompleted ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(52,211,153,0.18),transparent_34%),linear-gradient(135deg,rgba(6,78,59,0.36),rgba(2,6,23,0)_58%)]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-8 h-44 w-44 rounded-full bg-cyan-300/6 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-emerald-200/45 to-transparent" />
        </>
      ) : liveTone === "violet" ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(126,87,121,0.16),transparent_34%),linear-gradient(135deg,rgba(54,25,58,0.38),rgba(2,6,23,0)_58%)]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[#b48aa9]/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-[#d8bfd5]/30 to-transparent" />
        </>
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(248,113,113,0.14),transparent_34%),linear-gradient(135deg,rgba(127,29,29,0.34),rgba(2,6,23,0)_58%)]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-red-300/9 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-red-200/38 to-transparent" />
        </>
      )}

      <div className="relative grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.34em] ${eyebrowClass}`}>
            {eyebrowLabel}
          </div>

          <div className={titleClass}>{title}</div>

          {metaParts.length ? (
            <div className={`mt-2 text-[11px] font-medium uppercase tracking-[0.22em] ${metaClass}`}>
              {metaParts.join(" · ")}
            </div>
          ) : null}
        </div>

        <div className="relative z-20 sm:justify-self-end" onClick={(event) => event.stopPropagation()}>
          <Link
            href={watchHref}
            className="group block overflow-hidden rounded-2xl border border-white/10 bg-black/55 shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition hover:scale-[1.02] hover:border-sky-200/30"
            aria-label={`Watch ${title}`}
          >
            <video
              className="h-[4.8rem] w-full object-cover opacity-92 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-100 sm:h-[5.2rem]"
              src={battleLoopForSeed(session.sessionKey)}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
            />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_35%_20%,rgba(125,211,252,0.12),transparent_34%),linear-gradient(180deg,transparent,rgba(2,6,23,0.22))]" />
          </Link>
        </div>

        <div className="col-span-full mt-1 flex items-end justify-between gap-4">
          <div className="min-w-0">
            {winnerName ? (
              <div className={`text-[11px] font-medium uppercase tracking-[0.22em] ${winnerClass}`}>
                Winner <span className={`ml-1 ${winnerNameClass}`}>{winnerName}</span>
              </div>
            ) : session.disposition === "saved_rehost" ? (
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-100/75">
                No result · saved for rehost
              </div>
            ) : isCompleted ? (
              <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-100/70">
                Replay preserved
              </div>
            ) : (
              <div className="h-[14px]" />
            )}
          </div>

          <div className="flex shrink-0 items-center">
            <span
              className={`inline-flex h-8 min-w-[8.8rem] items-center justify-center rounded-full border px-4 text-[11px] font-semibold leading-none ${statusClass}`}
            >
              {statusLabel}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}



function ClassicLiveSessionCard({
  session,
  mounted,
  canReviewResult = false,
}: {
  session: LiveGamesSnapshot["activeSessions"][number];
  mounted: boolean;
  canReviewResult?: boolean;
}) {
  const isCompleted = session.state === "completed";
  const gameHref = sessionStatsHref(session);
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;
  const primaryStream = session.primaryStream ?? session.streams?.[0] ?? null;
  const uploaders =
    session.uploaders?.length > 0
      ? session.uploaders
      : session.uploader
        ? [
            {
              uid: session.uploader.uid,
              displayName: session.uploader.displayName,
              parseRows: session.parseRows || 1,
              lastSeenAt: session.updatedAt,
            },
          ]
        : [];
  const watcherCount = session.watcherCount || uploaders.length;
  const visibleUploaders = uploaders.slice(0, 3);
  const hiddenUploaderCount = Math.max(0, uploaders.length - visibleUploaders.length);
  const coverageLabel =
    watcherCount >= 3
      ? `${watcherCount} watcher stack`
      : watcherCount === 2
        ? "Dual watcher coverage"
        : watcherCount === 1
          ? "Single watcher"
          : "Replay source";
  const coverageClass =
    watcherCount >= 3
      ? "border-sky-300/25 bg-sky-400/10 text-sky-100"
      : watcherCount === 2
        ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
        : "border-white/10 bg-white/5 text-slate-300";
  const title = liveDisplayTitle(session);
  const shellClass = isCompleted
    ? "border-emerald-400/20 bg-emerald-500/10"
    : "border-red-400/20 bg-red-500/10";
  const badgeClass = isCompleted
    ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-50"
    : "border-red-400/25 bg-red-500/12 text-red-50";
  const eyebrowClass = isCompleted ? "text-emerald-100/80" : "text-red-100/80";
  const eyebrowLabel = liveSessionEyebrowLabel(session);
  const badgeLabel = liveSessionStatusLabel(session);
  const compactDuration = formatDurationCompact(session.durationSeconds);

  return (
    <div className={`overflow-hidden rounded-[1.5rem] border px-4 py-4 ${shellClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={`text-xs uppercase tracking-[0.3em] ${eyebrowClass}`}>{eyebrowLabel}</div>
          <div className="mt-2 text-xl font-semibold text-white">{title}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {normalizePublicReplayText(session.mapName) ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {publicReplayMapLabel(session.mapName)}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              Parse #{session.parseIteration}
            </span>
            {session.parseRows > 1 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {session.parseRows} stored rows
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              Updated {formatUpdatedTime(session.completedAt || session.updatedAt, mounted)}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs ${coverageClass}`}>
              {coverageLabel}
            </span>
            {visibleUploaders.map((uploader) => (
              <span key={uploader.uid} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {uploader.displayName}
              </span>
            ))}
            {hiddenUploaderCount > 0 ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                +{hiddenUploaderCount} more
              </span>
            ) : null}
            {isCompleted && normalizeResolvedWinner(session.winner) ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                Winner {normalizeResolvedWinner(session.winner)}
              </span>
            ) : null}
            {primaryStream ? (
              <span className="rounded-full border border-red-300/25 bg-red-400/10 px-3 py-1 text-xs text-red-100">
                {isCompleted ? "Video saved" : "Video live"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 text-left sm:w-52 sm:text-right">
          {primaryStream ? (
            <Link
              href={watchHref}
              className="block overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition hover:scale-[1.02] hover:border-sky-200/30"
            >
              <LiveStreamFrame
                stream={primaryStream}
                title={title}
                compact
                fallbackLabel={isCompleted ? "Replay" : "Battle Cam"}
                className="!min-h-[6.6rem] rounded-2xl sm:!min-h-[7.2rem]"
              />
            </Link>
          ) : null}
          <div className={`rounded-full border px-3 py-1 text-xs ${badgeClass}`}>
            {badgeLabel}
          </div>
          {compactDuration ? (
            <div className="text-xs text-slate-300">{compactDuration}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {isCompleted && canReviewResult ? (
          <Link
            href={replayReviewHref(session)}
            className="relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-full border border-amber-200/35 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.26),transparent_58%),linear-gradient(135deg,rgba(69,26,3,0.98),rgba(120,53,15,0.88)_52%,rgba(15,23,42,0.98))] px-5 py-2 text-sm font-bold tracking-[-0.01em] text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_12px_28px_rgba(120,53,15,0.28)] transition-all duration-200 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-100/80 before:to-transparent hover:-translate-y-0.5 hover:border-amber-100/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_16px_36px_rgba(180,83,9,0.34)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"
          >
            Review Result
          </Link>
        ) : null}
        <Link
          href={watchHref}
          className="relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-full border border-sky-200/30 bg-[radial-gradient(circle_at_50%_0%,rgba(125,211,252,0.24),transparent_58%),linear-gradient(135deg,rgba(3,18,36,0.98),rgba(8,47,73,0.94)_48%,rgba(15,23,42,0.98))] px-5 py-2 text-sm font-bold tracking-[-0.01em] text-sky-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_12px_28px_rgba(2,132,199,0.22)] transition-all duration-200 before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-sky-100/75 before:to-transparent hover:-translate-y-0.5 hover:border-sky-100/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_16px_36px_rgba(14,165,233,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/55"
        >
          Watch Theatre
        </Link>
        <Link
          href={gameHref}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {liveSessionPrimaryActionLabel(session)}
        </Link>
        <Link
          href="/lobby"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Open Lobby
        </Link>
      </div>
    </div>
  );
}


function ClassicTournamentLiveMatchCard({
  match,
  emphasis,
  mounted,
  compact = false,
  premium = false,
  liveTone = "crimson",
}: {
  match: LiveGamesSnapshot["liveMatches"][number];
  emphasis: "live" | "ready";
  mounted: boolean;
  compact?: boolean;
  premium?: boolean;
  liveTone?: ClassicLiveTone;
}) {
  const actionHref = match.proof ? `/game-stats/${match.proof.gameStatsId}` : "/lobby";
  const isLive = emphasis === "live";
  const statusLabel = getTournamentMatchStatusLabel(match.status as never);
  const title = `${playerLabel(match.playerOne)} vs ${playerLabel(match.playerTwo)}`;

  if (premium) {
    const shellClass = isLive
      ? liveTone === "violet"
        ? "relative overflow-hidden rounded-[1.75rem] border border-[#8a647e]/24 bg-[radial-gradient(circle_at_85%_10%,rgba(126,87,121,0.18),transparent_32%),linear-gradient(135deg,rgba(54,25,58,0.42),rgba(2,6,23,0.92)_64%)] px-5 py-5 shadow-[0_24px_80px_rgba(52,24,56,0.12)]"
        : "relative overflow-hidden rounded-[1.75rem] border border-red-300/25 bg-[radial-gradient(circle_at_85%_10%,rgba(248,113,113,0.18),transparent_32%),linear-gradient(135deg,rgba(127,29,29,0.42),rgba(2,6,23,0.92)_64%)] px-5 py-5 shadow-[0_24px_80px_rgba(127,29,29,0.12)]"
      : "relative overflow-hidden rounded-[1.75rem] border border-amber-300/25 bg-[radial-gradient(circle_at_85%_10%,rgba(251,191,36,0.18),transparent_32%),linear-gradient(135deg,rgba(120,53,15,0.42),rgba(2,6,23,0.92)_64%)] px-5 py-5 shadow-[0_24px_80px_rgba(245,158,11,0.10)]";

    const eyebrowClass = isLive
      ? liveTone === "violet"
        ? "text-[#ead8e7]/80"
        : "text-red-100/80"
      : "text-amber-100/80";
    const badgeClass = isLive
      ? liveTone === "violet"
        ? "border-[#d8bfd5]/22 bg-[#3a2038]/40 text-[#fff4fb]"
        : "border-red-200/25 bg-red-300/12 text-red-50"
      : "border-amber-200/25 bg-amber-300/12 text-amber-50";

    return (
      <div className={shellClass}>
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-52 w-52 rounded-full bg-white/10 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className={`text-xs uppercase tracking-[0.32em] ${eyebrowClass}`}>
                {match.label || `Round ${match.round} Match ${match.position}`}
              </div>
              <div className="mt-2 text-xl font-semibold leading-tight text-white">
                {title}
              </div>
              <div className="mt-2 text-sm text-slate-300">
                {match.proof?.mapName || "Map lock incoming"} · {formatTime(match.proof?.playedOn || match.scheduledAt, mounted)}
              </div>
            </div>

            <div className="space-y-2 text-right">
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                {statusLabel}
              </div>
              {match.proof?.winner ? (
                <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">
                  Winner {match.proof.winner}
                </div>
              ) : null}
            </div>
          </div>

          <div className={`mt-4 flex flex-wrap gap-3 ${compact ? "" : "pt-1"}`}>
            <Link
              href={actionHref}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              {match.proof ? "Watch Proof" : "Open Lobby"}
            </Link>
            <Link
              href="/bets"
              className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15"
            >
              Bet Rail
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const accentClass =
    emphasis === "live"
      ? liveTone === "violet"
        ? "border-[#8a647e]/22 bg-[#2a1629]/58"
        : "border-red-400/20 bg-red-500/10"
      : "border-amber-300/20 bg-amber-400/10";

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${accentClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-300/75">
            {match.label || `Round ${match.round} Match ${match.position}`}
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {title}
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {match.proof?.mapName || "Map lock incoming"} · {formatTime(match.proof?.playedOn || match.scheduledAt, mounted)}
          </div>
        </div>

        <div className="space-y-2 text-right">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white">
            {statusLabel}
          </div>
          {match.proof?.winner ? (
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">
              Winner {match.proof.winner}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap gap-3 ${compact ? "" : "pt-1"}`}>
        <Link
          href={actionHref}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {match.proof ? "Watch Proof" : "Open Lobby"}
        </Link>
        <Link
          href="/bets"
          className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15"
        >
          Bet Rail
        </Link>
      </div>
    </div>
  );
}

function ExtremeBoard({
  uid,
  isAdmin,
  canReviewOwnReplayResults,
  snapshot,
  mounted,
  liveItemsCount,
  onDeckCount,
  visibleOutcomeCount,
  totalOutcomeCount,
  liveScheduledMatches,
  acceptedScheduledMatches,
  pendingScheduledMatches,
  recentScheduledMatches,
  recentlyCompletedSessions,
  reviewCompletedSessions,
  renderScheduledMatch,
  viewMode,
  onViewModeChange,
}: BoardViewProps & {
  viewMode: TileViewMode;
  onViewModeChange: (viewMode: TileViewMode) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.15rem] border border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(239,68,68,0.10),transparent_30%),linear-gradient(145deg,rgba(2,6,23,0.96),rgba(9,17,32,0.94))] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.26)] sm:p-6">

      <div className="mb-4 flex justify-center sm:justify-end">
        <LiveGamesViewToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-red-200/35 to-transparent" />
        <div className="relative grid gap-5 xl:grid-cols-12">
          <div className="min-w-0 xl:col-span-8">
            <RailHeader
              icon={<Flame className="h-4 w-4" />}
              eyebrow="Now Playing"
              title="The hot table"
              count={`${liveItemsCount} live`}
              tone="red"
            />

            <div className="mt-5">
              {liveItemsCount === 0 ? (
                <QuietBattlefield />
              ) : (
                <div className="grid gap-4 2xl:grid-cols-2">
                  {liveScheduledMatches.map((match) =>
                    renderScheduledMatch(match, { detail: true })
                  )}
                  {snapshot.activeSessions.map((session) => (
                    <LiveSessionCard
                      key={liveSessionIdentity(session)}
                      session={session}
                      mounted={mounted}
                      variant="extreme"
                      canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                    />
                  ))}
                  {snapshot.liveMatches.map((match) => (
                    <TournamentLiveMatchCard
                      key={`match-${match.id}`}
                      match={match}
                      emphasis="live"
                      mounted={mounted}
                      variant="extreme"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="min-w-0 rounded-[1.65rem] border border-amber-200/10 bg-amber-300/[0.035] p-4 sm:p-5 xl:col-span-4">
            <RailHeader
              icon={<CalendarClock className="h-4 w-4" />}
              eyebrow="On Deck"
              title="Next into battle"
              count={`${onDeckCount}`}
              tone="amber"
              compact
            />

            <div className="mt-4 space-y-3">
              {onDeckCount === 0 ? (
                <EmptyRail
                  icon={<Swords className="h-5 w-5" />}
                  title="The next slot is yours"
                  body="Set a time, name the rival, and let the lobby gather."
                  href="/challenge"
                  action="Issue a challenge"
                />
              ) : (
                <>
                  {snapshot.readyMatches.map((match) => (
                    <TournamentLiveMatchCard
                      key={`ready-${match.id}`}
                      match={match}
                      emphasis="ready"
                      mounted={mounted}
                      variant="extreme"
                      compact
                    />
                  ))}
                  {acceptedScheduledMatches.map((match) =>
                    renderScheduledMatch(match, { compact: true })
                  )}
                  {pendingScheduledMatches.map((match) =>
                    renderScheduledMatch(match, { compact: true })
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.15rem] border border-emerald-200/10 bg-[radial-gradient(circle_at_85%_0%,rgba(52,211,153,0.11),transparent_28%),linear-gradient(145deg,rgba(3,18,24,0.96),rgba(2,6,23,0.94))] p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <RailHeader
            icon={<Trophy className="h-4 w-4" />}
            eyebrow="Just Finished"
            title="Fresh from the battlefield"
            count={
              totalOutcomeCount > visibleOutcomeCount
                ? `Latest ${visibleOutcomeCount}`
                : `${visibleOutcomeCount} finals`
            }
            tone="emerald"
          />
          <p className="max-w-md text-sm leading-6 text-slate-400">
            Three fresh results stay in the spotlight. Then they move into the
            archive instead of camping here for days.
          </p>
        </div>

        <div className="mt-5">
          {visibleOutcomeCount === 0 ? (
            <EmptyRail
              icon={<Gamepad2 className="h-5 w-5" />}
              title="Waiting for the next final"
              body="Finished games appear here automatically."
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              {recentScheduledMatches.map((match) =>
                renderScheduledMatch(match, { compact: true })
              )}
              {recentlyCompletedSessions.map((session) => (
                <LiveSessionCard
                  key={`completed-${liveSessionIdentity(session)}`}
                  session={session}
                  mounted={mounted}
                  variant="extreme"
                  canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {reviewCompletedSessions.length > 0 ? (
        <section className="overflow-hidden rounded-[2.15rem] border border-amber-200/10 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.09),transparent_28%),linear-gradient(145deg,rgba(28,20,8,0.92),rgba(2,6,23,0.95))] p-4 sm:p-6">
          <RailHeader
            icon={<CircleAlert className="h-4 w-4" />}
            eyebrow="Parser Review"
            title="Final proof awaiting a verdict"
            count={`${reviewCompletedSessions.length} review`}
            tone="amber"
          />
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {reviewCompletedSessions.map((session) => (
              <LiveSessionCard
                key={`review-${liveSessionIdentity(session)}`}
                session={session}
                mounted={mounted}
                variant="extreme"
                canReviewResult={canReviewReplaySession(session, uid, isAdmin, canReviewOwnReplayResults)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[2.15rem] border border-violet-200/10 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.11),transparent_29%),linear-gradient(145deg,rgba(15,12,30,0.96),rgba(2,6,23,0.95))] p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <RailHeader
            icon={<Archive className="h-4 w-4" />}
            eyebrow="Archive"
            title="Recently played"
            count={`${snapshot.archiveTotal} filed`}
            tone="violet"
          />
          <div className="flex flex-wrap gap-2">
            <Link
              href="/upload"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-violet-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:-translate-y-0.5 hover:bg-violet-200"
            >
              <Upload className="h-4 w-4" />
              Add your classic
            </Link>
            <Link
              href="/battle-archive"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-violet-200/30 hover:bg-white/10"
            >
              Full archive
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {snapshot.recentMatches.length === 0 ? (
          <div className="mt-5">
            <EmptyRail
              icon={<Archive className="h-5 w-5" />}
              title="Make the first deposit"
              body="Old replays become permanent, browsable match history."
              href="/upload"
              action="Upload replay"
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.recentMatches
              .slice(0, MAX_EXTREME_ARCHIVE_MATCHES)
              .map((match) => (
                <ArchiveMatchCard
                  key={match.id}
                  match={match}
                  mounted={mounted}
                  variant="extreme"
                />
              ))}
          </div>
        )}
      </section>
    </div>
  );
}


function RailHeader({
  icon,
  eyebrow,
  title,
  count,
  tone,
  compact = false,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  count: string;
  tone: "red" | "amber" | "emerald" | "violet";
  compact?: boolean;
}) {
  const toneClass = {
    red: "border-red-300/20 bg-red-400/10 text-red-100",
    amber: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    emerald: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    violet: "border-violet-300/20 bg-violet-400/10 text-violet-100",
  }[tone];

  return (
    <div className="flex min-w-0 items-center justify-between gap-4">
      <div className="min-w-0">
        <div
          className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.34em] ${toneClass
            .split(" ")
            .find((item) => item.startsWith("text-"))}`}
        >
          {icon}
          {eyebrow}
        </div>
        <h2
          className={`mt-2 truncate font-semibold tracking-[-0.025em] text-white ${
            compact ? "text-xl" : "text-2xl sm:text-3xl"
          }`}
        >
          {title}
        </h2>
      </div>
      <span
        className={`shrink-0 rounded-full border px-3 py-1 text-xs ${toneClass}`}
      >
        {count}
      </span>
    </div>
  );
}

function QuietBattlefield({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.65rem] border border-dashed border-white/12 bg-[radial-gradient(circle_at_25%_20%,rgba(248,113,113,0.08),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015))] ${
        compact ? "px-5 py-7" : "px-5 py-8 sm:px-7 sm:py-10"
      }`}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full border border-white/5" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-red-300/15 bg-red-400/10 text-red-100">
            <Swords className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-xl font-semibold text-white">
            Quiet field. Open invitation.
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Start a scheduled battle, or upload a replay and turn an old war
            story into fresh stats.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href="/challenge"
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-red-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-red-200"
          >
            <Swords className="h-4 w-4" />
            Schedule New Game
          </Link>
          <Link
            href="/upload"
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
          >
            <Upload className="h-4 w-4" />
            Upload replay
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyRail({
  icon,
  title,
  body,
  href,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="rounded-[1.35rem] border border-white/8 bg-white/[0.035] px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-300">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-sm leading-5 text-slate-400">{body}</div>
          {href && action ? (
            <Link
              href={href}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-200 transition hover:text-amber-100"
            >
              {action}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LiveSessionCard({
  session,
  mounted,
  variant,
  canReviewResult = false,
}: {
  session: LiveSession;
  mounted: boolean;
  variant: TileViewMode;
  canReviewResult?: boolean;
}) {
  const isCompleted = session.state === "completed";
  const gameHref = sessionStatsHref(session);
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;
  const primaryStream = session.primaryStream;
  const title = liveDisplayTitle(session);
  const compactDuration = formatDurationCompact(session.durationSeconds);
  const mapName = normalizePublicReplayText(session.mapName);
  const winner = isCompleted ? resolvedWinnerName(session) : null;
  const sourceCount = Math.max(
    session.watcherCount || 0,
    session.uploaders?.length || 0,
    1
  );
  const isBasic = variant === "basic";
  const isExtreme = variant === "extreme";
  const shellClass = isCompleted
    ? "border-emerald-300/18 bg-[radial-gradient(circle_at_88%_8%,rgba(52,211,153,0.12),transparent_31%),linear-gradient(145deg,rgba(6,78,59,0.30),rgba(4,18,27,0.92))]"
    : "border-red-300/18 bg-[radial-gradient(circle_at_88%_8%,rgba(248,113,113,0.13),transparent_31%),linear-gradient(145deg,rgba(69,10,10,0.28),rgba(8,15,28,0.94))]";

  return (
    <article
      className={`group relative min-w-0 overflow-hidden rounded-[1.55rem] border transition duration-300 hover:-translate-y-0.5 hover:border-white/20 ${
        isExtreme ? "p-4 sm:p-5" : "p-4"
      } ${shellClass}`}
    >
      <div
        className={`relative ${
          isBasic
            ? ""
            : `grid gap-4 ${
                isExtreme
                  ? "sm:grid-cols-[minmax(0,1fr)_10rem]"
                  : "sm:grid-cols-[minmax(0,1fr)_8.5rem]"
              }`
        }`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] ${
                isCompleted ? "text-emerald-100/75" : "text-red-100/80"
              }`}
            >
              {isCompleted ? (
                <Trophy className="h-3.5 w-3.5" />
              ) : (
                <Radio className="h-3.5 w-3.5" />
              )}
              {isCompleted ? liveSessionEyebrowLabel(session) : "Live now"}
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                isCompleted
                  ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                  : "border-red-300/20 bg-red-400/10 text-red-100"
              }`}
            >
              {/* COMPLETED_DUAL_WATCHER_PROOF */}
              <DualWatcherProofStack uploaders={(session as { uploaders?: DualWatcherProofUploader[] | null }).uploaders} />

              {isCompleted || session.finalProofPending || hasLiveBetMarket(session)
                ? liveSessionStatusLabel(session)
                : "Watcher live"}
            </span>
          </div>

          <h3
            className={`mt-3 break-words font-semibold leading-tight tracking-[-0.02em] text-white ${
              isExtreme ? "text-xl" : "text-lg"
            }`}
          >
            {title}
          </h3>

          {winner ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-100">
              <Trophy className="h-4 w-4 text-amber-300" />
              <span className="text-slate-400">Winner</span>
              <span className="font-semibold">{winner}</span>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {mapName ? <MetaChip>{mapName}</MetaChip> : null}
            {compactDuration ? <MetaChip>{compactDuration}</MetaChip> : null}
            <MetaChip>
              {sourceCount} {sourceCount === 1 ? "replay source" : "replay sources"}
            </MetaChip>
            {!isBasic ? (
              <MetaChip>
                Updated{" "}
                {formatUpdatedTime(
                  session.completedAt || session.updatedAt,
                  mounted
                )}
              </MetaChip>
            ) : null}
            {primaryStream ? (
              <MetaChip accent>{isCompleted ? "Video attached" : "Live video"}</MetaChip>
            ) : null}
          </div>
        </div>

        {!isBasic ? (
          <BattleThumbnail
            session={session}
            stream={primaryStream}
            href={primaryStream ? watchHref : gameHref}
            large={isExtreme}
          />
        ) : null}
      </div>

      <div
        className={`relative mt-4 flex flex-wrap gap-2 border-t pt-3 ${
          isCompleted ? "border-emerald-100/10" : "border-red-100/10"
        }`}
      >
        {isCompleted && canReviewResult ? (
          <Link
            href={replayReviewHref(session)}
            className="relative inline-flex min-h-9 flex-1 items-center justify-center overflow-hidden rounded-full border border-amber-200/35 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.24),transparent_58%),linear-gradient(135deg,rgba(69,26,3,0.98),rgba(120,53,15,0.88)_52%,rgba(15,23,42,0.98))] px-4 py-2 text-center text-xs font-bold text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_10px_24px_rgba(120,53,15,0.24)] transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-100/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_14px_30px_rgba(180,83,9,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"
          >
            Review Result
          </Link>
        ) : null}
        <Link
          href={gameHref}
          className={`inline-flex min-h-9 flex-1 items-center justify-center rounded-full px-4 py-2 text-center text-xs font-bold transition ${
            isCompleted
              ? "bg-emerald-200 text-emerald-950 hover:bg-emerald-100"
              : "bg-red-200 text-red-950 hover:bg-red-100"
          }`}
        >
          {liveSessionPrimaryActionLabel(session)}
        </Link>
        {primaryStream ? (
          <Link
            href={watchHref}
            className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full border border-sky-200/18 bg-sky-300/10 px-4 py-2 text-center text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15"
          >
            Watch video
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function MetaChip({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`inline-flex min-h-7 max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] leading-4 ${
        accent
          ? "border-sky-200/20 bg-sky-300/10 text-sky-100"
          : "border-white/9 bg-white/[0.045] text-slate-300"
      }`}
    >
      {children}
    </span>
  );
}

function BattleThumbnail({
  session,
  stream,
  href,
  large,
}: {
  session: LiveSession;
  stream: WatchStreamPayload | null;
  href: string;
  large: boolean;
}) {
  const players = session.players.slice(0, 2);
  const isCompleted = session.state === "completed";

  return (
    <Link
      href={href}
      aria-label={`${stream ? "Watch" : "Open"} ${liveDisplayTitle(session)}`}
      className={`relative isolate block overflow-hidden rounded-[1.2rem] border border-white/10 bg-[radial-gradient(circle_at_30%_20%,rgba(125,211,252,0.20),transparent_30%),radial-gradient(circle_at_75%_76%,rgba(251,191,36,0.16),transparent_31%),linear-gradient(145deg,#111827,#020617)] shadow-[0_18px_45px_rgba(0,0,0,0.24)] transition group-hover:border-white/20 ${
        large ? "min-h-[8.5rem]" : "min-h-[7.25rem]"
      }`}
    >
      {stream?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stream.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-70"
        />
      ) : null}
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.05),transparent_38%,rgba(255,255,255,0.025))]" />
      <div className="absolute inset-0 opacity-35 [background-image:repeating-linear-gradient(0deg,rgba(255,255,255,0.04)_0px,rgba(255,255,255,0.04)_1px,transparent_1px,transparent_10px)]" />
      <div className="absolute inset-0 flex items-center justify-center gap-2">
        {players.length > 0 ? (
          players.map((player, index) => (
            <div
              key={`${player.name}-${index}`}
              className={`grid h-11 w-11 place-items-center rounded-2xl border text-xs font-black text-white shadow-lg ${
                player.winner
                  ? "border-amber-200/35 bg-amber-300/22"
                  : index === 0
                    ? "border-sky-200/25 bg-sky-300/15"
                    : "border-red-200/25 bg-red-300/15"
              }`}
            >
              {initials(player.name)}
            </div>
          ))
        ) : (
          <Swords className="h-9 w-9 text-white/65" />
        )}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8">
        <span className="truncate text-[9px] font-bold uppercase tracking-[0.18em] text-white/75">
          {session.mapName || "Battle replay"}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em] ${
            isCompleted
              ? "border-emerald-200/20 bg-emerald-300/12 text-emerald-100"
              : "border-red-200/25 bg-red-300/15 text-red-100"
          }`}
        >
          {stream ? "Video" : isCompleted ? "Final" : "Live"}
        </span>
      </div>
    </Link>
  );
}

function ArchiveMatchCard({
  match,
  mounted,
  variant,
}: {
  match: RecentMatch;
  mounted: boolean;
  variant: TileViewMode;
}) {
  const winner = recentMatchWinner(match);
  const players = recentMatchPlayers(match);
  const isExtreme = variant === "extreme";

  return (
    <Link
      href={`/game-stats/${match.id}`}
      className={`group block min-w-0 rounded-[1.35rem] border border-violet-200/12 bg-[radial-gradient(circle_at_90%_10%,rgba(167,139,250,0.10),transparent_32%),linear-gradient(145deg,rgba(46,16,101,0.18),rgba(8,12,25,0.88))] transition duration-200 hover:-translate-y-0.5 hover:border-violet-200/25 hover:bg-violet-300/[0.07] ${
        isExtreme ? "px-4 py-4" : "px-4 py-3.5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.24em] text-violet-200/65">
            <Archive className="h-3.5 w-3.5" />
            Match #{match.id}
          </div>
          <h3
            className={`mt-2 break-words font-semibold leading-snug text-white ${
              isExtreme ? "text-[15px]" : "text-sm"
            }`}
          >
            {recentMatchTitle(match)}
          </h3>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-violet-200/35 transition group-hover:translate-x-0.5 group-hover:text-violet-100" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <MetaChip>{recentMatchMap(match)}</MetaChip>
        <MetaChip>{players.length || 2} players</MetaChip>
        {winner ? <MetaChip accent>Winner {winner}</MetaChip> : null}
      </div>

      <div className="mt-3 border-t border-violet-100/8 pt-2.5 text-[11px] text-slate-400">
        {formatTime(match.played_on || match.timestamp, mounted)}
      </div>
    </Link>
  );
}

function TournamentLiveMatchCard({
  match,
  emphasis,
  mounted,
  variant,
  compact = false,
}: {
  match: LiveGamesSnapshot["liveMatches"][number];
  emphasis: "live" | "ready";
  mounted: boolean;
  variant: TileViewMode;
  compact?: boolean;
}) {
  const accentClass =
    emphasis === "live"
      ? "border-red-300/18 bg-[linear-gradient(145deg,rgba(127,29,29,0.22),rgba(8,15,28,0.92))]"
      : "border-amber-300/18 bg-[linear-gradient(145deg,rgba(120,53,15,0.20),rgba(8,15,28,0.92))]";
  const actionHref = match.proof
    ? `/game-stats/${match.proof.gameStatsId}`
    : "/lobby";

  return (
    <article
      className={`rounded-[1.5rem] border px-4 py-4 ${accentClass} ${
        variant === "extreme" ? "shadow-[0_18px_55px_rgba(0,0,0,0.18)]" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-300/70">
            {match.label || `Round ${match.round} Match ${match.position}`}
          </div>
          <div className="mt-2 break-words text-lg font-semibold text-white">
            {playerLabel(match.playerOne)} vs {playerLabel(match.playerTwo)}
          </div>
          <div className="mt-2 text-sm leading-5 text-slate-300">
            {match.proof?.mapName || "Map lock incoming"} ·{" "}
            {formatTime(match.proof?.playedOn || match.scheduledAt, mounted)}
          </div>
        </div>

        <div className="space-y-2 text-right">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white">
            {getTournamentMatchStatusLabel(match.status as never)}
          </div>
          {match.proof?.winner ? (
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-200/80">
              Winner {match.proof.winner}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap gap-2 ${compact ? "" : "pt-1"}`}>
        <Link
          href={actionHref}
          className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-slate-200"
        >
          {match.proof ? "Open proof" : "Open lobby"}
        </Link>
        <Link
          href="/bets"
          className="inline-flex min-h-9 items-center justify-center rounded-full border border-amber-300/25 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/15"
        >
          Bet rail
        </Link>
      </div>
    </article>
  );
}
