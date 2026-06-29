"use client";

import Link from "next/link";
import {
  Archive,
  CalendarClock,
  ChevronRight,
  Clock3,
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

import ScheduledMatchCard, {
  type ScheduledMatchCardActionKind,
  type ScheduledMatchCardActionState,
} from "@/components/challenge/ScheduledMatchCard";
import { displayName } from "@/components/lobby/utils";
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { useUserAuth } from "@/context/UserAuthContext";
import type { LiveGamesSnapshot } from "@/lib/liveGames";
import { getTournamentMatchStatusLabel } from "@/lib/lobby";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";
import type { WatchStreamPayload } from "@/lib/watchStreams";

type LiveGamesBoardProps = {
  initialSnapshot: LiveGamesSnapshot;
};

type LiveSession = LiveGamesSnapshot["activeSessions"][number];
type RecentMatch = LiveGamesSnapshot["recentMatches"][number];

const LIVE_GAMES_POLL_INTERVAL_MS = 5_000;
const MAX_VISIBLE_OUTCOMES = 3;
const MAX_EXTREME_ARCHIVE_MATCHES = 9;
const ADVANCED_SESSION_LOOP_VIDEO_URL = "/watch-loops/live-hero-loop.mp4";

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

function formatStableIso(value: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatTime(value: string | null, mounted: boolean) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  if (!mounted) return formatStableIso(value);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatUpdatedTime(value: string | null, mounted: boolean) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  if (!mounted) return formatStableIso(value);
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
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

function sessionTitle(session: LiveSession) {
  return session.players.length > 0
    ? session.players.map((player) => player.name).join(" vs ")
    : session.originalFilename || "Game in progress";
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
  if (typeof match.map === "string") return match.map;
  if (match.map && typeof match.map === "object" && "name" in match.map) {
    return String(match.map.name || "Unknown map");
  }
  return "Unknown map";
}

function recentMatchPlayers(match: RecentMatch) {
  if (!Array.isArray(match.players)) return [];
  return match.players
    .map((player) => ({
      name: typeof player?.name === "string" ? player.name.trim() : "",
      winner: player?.winner === true,
    }))
    .filter((player) => player.name);
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

export default function LiveGamesBoard({ initialSnapshot }: LiveGamesBoardProps) {
  const { uid } = useUserAuth();
  const liveGamesTile = useTileViewPreference("live_games");
  const viewMode = liveGamesTile.viewMode;
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

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return;

    refreshInFlightRef.current = true;
    try {
      const response = await fetch("/api/live-games", { cache: "no-store" });
      if (!response.ok) return;

      const payload = (await response.json()) as LiveGamesSnapshot;
      if (mountedRef.current) setSnapshot(payload);
    } catch (error) {
      console.warn("Failed to refresh live games:", error);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, LIVE_GAMES_POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
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
  const recentlyCompletedSessions = snapshot.recentlyCompletedSessions.slice(
    0,
    Math.max(0, MAX_VISIBLE_OUTCOMES - recentScheduledMatches.length)
  );
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
        defaultViewMode={detail ? "detail" : "summary"}
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
    renderScheduledMatch,
  };

  return (
    <main
      className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3"
      data-live-games-view={viewMode}
    >
      <LiveBoardHeader
        snapshot={snapshot}
        mounted={mounted}
        viewMode={viewMode}
        liveItemsCount={liveItemsCount}
        onDeckCount={onDeckCount}
        onViewModeChange={liveGamesTile.setViewMode}
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
        <ExtremeBoard {...boardProps} />
      ) : (
        <ClassicBoard {...boardProps} viewMode={viewMode} />
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
  onViewModeChange,
}: {
  snapshot: LiveGamesSnapshot;
  mounted: boolean;
  viewMode: TileViewMode;
  liveItemsCount: number;
  onDeckCount: number;
  onViewModeChange: (viewMode: TileViewMode) => void;
}) {
  const isExtreme = viewMode === "extreme";

  return (
    <section
      className={`relative overflow-hidden border border-white/10 ${
        isExtreme
          ? "rounded-[2.25rem] bg-[radial-gradient(circle_at_10%_15%,rgba(248,113,113,0.18),transparent_27%),radial-gradient(circle_at_88%_5%,rgba(251,191,36,0.13),transparent_30%),linear-gradient(135deg,#111827,#07101f_52%,#020617)] px-5 py-6 shadow-[0_32px_120px_rgba(0,0,0,0.3)] sm:px-7 sm:py-7 lg:px-9"
          : "rounded-[1.9rem] bg-[radial-gradient(circle_at_top_left,rgba(248,113,113,0.12),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.10),transparent_24%),linear-gradient(135deg,#101828,#0f172a_45%,#020617)] p-5 sm:rounded-[2rem] sm:p-6"
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
          <LiveGamesViewToggle
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
          />

          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              tone="red"
              icon={<Radio className="h-3.5 w-3.5" />}
              label={`${liveItemsCount} live`}
            />
            <StatusPill
              tone="amber"
              icon={<CalendarClock className="h-3.5 w-3.5" />}
              label={`${onDeckCount} on deck`}
            />
            <StatusPill
              icon={<Clock3 className="h-3.5 w-3.5" />}
              label={formatUpdatedTime(snapshot.updatedAt, mounted)}
            />
            <Link
              href="/challenge"
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 shadow-[0_10px_28px_rgba(251,191,36,0.16)] transition hover:-translate-y-0.5 hover:bg-amber-200"
            >
              <Swords className="h-4 w-4" />
              Schedule
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
      className="inline-flex w-fit items-center rounded-full border border-white/10 bg-black/20 p-1 shadow-inner shadow-black/20 backdrop-blur"
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
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold capitalize transition sm:px-4 ${
              active
                ? mode === "extreme"
                  ? "bg-gradient-to-r from-amber-300 to-orange-300 text-slate-950 shadow-[0_8px_24px_rgba(251,191,36,0.18)]"
                  : "bg-white text-slate-950 shadow-[0_8px_22px_rgba(255,255,255,0.10)]"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
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
  label: string;
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
  renderScheduledMatch: (
    match: LiveGamesSnapshot["scheduledMatches"][number],
    options?: { compact?: boolean; detail?: boolean }
  ) => ReactNode;
};


function ClassicBoard({
  snapshot,
  mounted,
  liveScheduledMatches,
  acceptedScheduledMatches,
  pendingScheduledMatches,
  recentScheduledMatches,
  recentlyCompletedSessions,
  liveItemsCount,
  onDeckCount,
  renderScheduledMatch,
  viewMode,
}: BoardViewProps & { viewMode: "basic" | "advanced" }) {
  const advanced = viewMode === "advanced";
  const featuredCompletedSessions = recentlyCompletedSessions.slice(0, 3);
  const archivedCompletedSessions = advanced ? recentlyCompletedSessions.slice(3) : [];
  const archiveItemCount = archivedCompletedSessions.length + snapshot.recentMatches.length;
  const recentOutcomeCount = recentScheduledMatches.length + featuredCompletedSessions.length;
  const sectionStatusLabel = liveItemsCount > 0 ? `${liveItemsCount} active` : "Awaiting battle";

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="min-w-0 rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-red-200/70">Now Playing</div>
            <h2 className="mt-2 text-3xl font-semibold text-white">Playing now</h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {sectionStatusLabel}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {liveItemsCount === 0 ? (
            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-6 text-sm text-slate-300">
              No live games yet.
            </div>
          ) : (
            <>
              {liveScheduledMatches.map((match) => renderScheduledMatch(match, { detail: true }))}
              {snapshot.activeSessions.map((session) =>
                advanced ? (
                  <PremiumClassicLiveSessionCard key={`session-${session.id}`} session={session} />
                ) : (
                  <ClassicLiveSessionCard key={`session-${session.id}`} session={session} mounted={mounted} />
                )
              )}
              {snapshot.liveMatches.map((match) => (
                <ClassicTournamentLiveMatchCard
                  key={`match-${match.id}`}
                  match={match}
                  emphasis="live"
                  mounted={mounted}
                  premium={advanced}
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

        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
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
                    <PremiumClassicLiveSessionCard key={`completed-${session.id}`} session={session} />
                  ) : (
                    <ClassicLiveSessionCard key={`completed-${session.id}`} session={session} mounted={mounted} />
                  )
                )}
              </>
            )}
          </div>
        </section>

        {advanced ? (
          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Archive</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recently Played</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {archiveItemCount} filed
              </div>
            </div>

            <div className="mt-5 max-h-[34rem] space-y-3 overflow-y-auto pr-1 [scrollbar-color:rgba(148,163,184,0.45)_transparent] [scrollbar-width:thin]">
              {archiveItemCount === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Waiting on the next completed match.
                </div>
              ) : (
                <>
                  {archivedCompletedSessions.map((session) => (
                    <Link
                      key={`archive-upload-${session.id}`}
                      href={`/game-stats/live/${encodeURIComponent(session.sessionKey)}`}
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/7"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {session.players.length > 0
                              ? session.players.map((player) => player.name).filter(Boolean).join(" vs ")
                              : session.originalFilename || "Uploaded replay"}
                          </div>
                          <div className="mt-1 text-sm text-slate-300">
                            {session.mapName || "Uploaded replay"}
                          </div>
                          <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-emerald-200/75">
                            Newly uploaded
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-400">
                          {formatUpdatedTime(session.completedAt || session.updatedAt, mounted)}
                        </div>
                      </div>
                    </Link>
                  ))}

                  {snapshot.recentMatches.map((match) => (
                    <Link
                      key={match.id}
                      href={`/game-stats/${match.id}`}
                      className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/7"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white">
                            {Array.isArray(match.players)
                              ? match.players.map((player) => player.name).filter(Boolean).join(" vs ")
                              : "Replay-backed result"}
                          </div>
                          <div className="mt-1 text-sm text-slate-300">
                            {typeof match.map === "string"
                              ? match.map
                              : match.map && typeof match.map === "object" && "name" in match.map
                                ? String(match.map.name || "Unknown map")
                                : "Unknown map"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-400">
                          {formatTime(match.played_on || match.timestamp, mounted)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}








function PremiumClassicLiveSessionCard({
  session,
}: {
  session: LiveGamesSnapshot["activeSessions"][number];
}) {
  const sessionAny = session as Record<string, unknown>;
  const isCompleted = session.state === "completed";
  const gameHref = `/game-stats/live/${encodeURIComponent(session.sessionKey)}`;
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;
  const isUploadedReplay = Boolean(
    session.originalFilename || session.uploader || session.uploaders?.length
  );

  const title =
    session.players.length > 0
      ? session.players.map((player) => player.name).join(" vs ")
      : session.originalFilename || "Game in progress";

  const eyebrowLabel = isCompleted
    ? isUploadedReplay
      ? "Just uploaded"
      : "Just finished"
    : "Watcher live";

  const statusLabel = isCompleted ? "Final stored" : "Live parse";
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
    aoe2warGameNumber ? `Game #${aoe2warGameNumber}` : null,
    durationLabel || null,
  ].filter(Boolean) as string[];

  const winnerName =
    typeof session.winner === "string" && session.winner.trim().length > 0
      ? session.winner.trim()
      : null;

  const shellClass = isCompleted
    ? "relative overflow-hidden rounded-[1.9rem] border border-emerald-400/20 bg-emerald-500/10 px-5 py-5 shadow-[0_26px_90px_rgba(16,185,129,0.12)] sm:px-6"
    : "relative overflow-hidden rounded-[1.9rem] border border-fuchsia-400/20 bg-fuchsia-500/10 px-5 py-5 shadow-[0_26px_90px_rgba(168,85,247,0.12)] sm:px-6";

  const eyebrowClass = isCompleted ? "text-emerald-100/78" : "text-fuchsia-100/78";
  const titleClass = isCompleted
    ? "mt-3 text-[1.26rem] font-semibold leading-[1.08] tracking-[-0.018em] text-slate-50/96 [text-shadow:0_1px_12px_rgba(2,6,23,0.24)] sm:text-[1.4rem]"
    : "mt-3 text-[1.26rem] font-semibold leading-[1.08] tracking-[-0.018em] text-slate-50/96 [text-shadow:0_1px_12px_rgba(2,6,23,0.24)] sm:text-[1.4rem]";
  const metaClass = isCompleted ? "text-emerald-100/62" : "text-fuchsia-100/62";
  const statusClass = isCompleted
    ? "border-emerald-300/25 bg-emerald-500/12 text-emerald-50"
    : "border-fuchsia-300/25 bg-fuchsia-500/12 text-fuchsia-50";
  const winnerClass = isCompleted ? "text-emerald-100/62" : "text-fuchsia-100/62";
  const winnerNameClass = isCompleted ? "text-emerald-50/90" : "text-fuchsia-50/90";

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
      ) : (
        <>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_86%_10%,rgba(217,70,239,0.16),transparent_34%),linear-gradient(135deg,rgba(88,28,135,0.34),rgba(2,6,23,0)_58%)]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-fuchsia-300/10 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-200/40 to-transparent" />
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
              src={ADVANCED_SESSION_LOOP_VIDEO_URL}
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
  premium = false,
}: {
  session: LiveGamesSnapshot["activeSessions"][number];
  mounted: boolean;
  premium?: boolean;
}) {
  const isCompleted = session.state === "completed";
  const gameHref = `/game-stats/live/${encodeURIComponent(session.sessionKey)}`;
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
          ? "Single watcher source"
          : "Watcher source pending";

  const title =
    session.players.length > 0
      ? session.players.map((player) => player.name).join(" vs ")
      : session.originalFilename || "Game in progress";

  const isUploadedReplay = Boolean(
    session.originalFilename || session.uploader || session.uploaders?.length
  );
  const eyebrowLabel = isCompleted
    ? isUploadedReplay
      ? "Just uploaded"
      : "Just finished"
    : "Watcher live";
  const badgeLabel = isCompleted ? "Final stored" : "Live parse";
  const compactDuration = formatDurationCompact(session.durationSeconds);

  const chips = (
    <>
      {session.mapName ? (
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
          {session.mapName}
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

      <span
        className={`rounded-full border px-3 py-1 text-xs ${
          isCompleted
            ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
            : "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100"
        }`}
      >
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

      {isCompleted && session.winner && session.winner !== "Unknown" ? (
        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
          Winner {session.winner}
        </span>
      ) : null}

      {primaryStream ? (
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {isCompleted ? "Video saved" : "Video live"}
        </span>
      ) : null}
    </>
  );

  const actions = (
    <>
      <Link
        href={watchHref}
        className="rounded-full bg-sky-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
      >
        Watch Theatre
      </Link>

      <Link
        href={gameHref}
        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
      >
        {isCompleted ? "Open Final Stats" : "Watch Live Stats"}
      </Link>

      <Link
        href="/lobby"
        className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
      >
        Open Lobby
      </Link>

      <Link
        href="/bets"
        className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15"
      >
        Bet Rail
      </Link>
    </>
  );

  if (premium) {
    const premiumShellClass = isCompleted
      ? "relative overflow-hidden rounded-[1.9rem] border border-emerald-300/25 bg-[radial-gradient(circle_at_88%_8%,rgba(52,211,153,0.20),transparent_34%),radial-gradient(circle_at_8%_100%,rgba(45,212,191,0.10),transparent_38%),linear-gradient(135deg,rgba(6,78,59,0.56),rgba(2,6,23,0.92)_62%)] px-5 py-5 shadow-[0_26px_90px_rgba(16,185,129,0.13)]"
      : "relative overflow-hidden rounded-[1.9rem] border border-fuchsia-300/25 bg-[radial-gradient(circle_at_86%_8%,rgba(217,70,239,0.22),transparent_34%),radial-gradient(circle_at_10%_100%,rgba(129,140,248,0.12),transparent_40%),linear-gradient(135deg,rgba(88,28,135,0.52),rgba(2,6,23,0.92)_62%)] px-5 py-5 shadow-[0_26px_90px_rgba(168,85,247,0.13)]";

    const premiumEyebrowClass = isCompleted ? "text-emerald-100/80" : "text-fuchsia-100/80";
    const premiumBadgeClass = isCompleted
      ? "border-emerald-200/25 bg-emerald-300/12 text-emerald-50"
      : "border-fuchsia-200/25 bg-fuchsia-300/12 text-fuchsia-50";

    return (
      <div className={premiumShellClass}>
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/45 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-8 h-44 w-44 rounded-full bg-cyan-300/8 blur-3xl" />

        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className={`text-xs uppercase tracking-[0.34em] ${premiumEyebrowClass}`}>
                {eyebrowLabel}
              </div>
              <div className="mt-2 text-[1.35rem] font-semibold leading-tight text-white">
                {title}
              </div>
            </div>

            <div className="shrink-0 space-y-2 text-right">
              <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${premiumBadgeClass}`}>
                {badgeLabel}
              </div>
              {compactDuration ? (
                <div className="text-xs text-slate-200">{compactDuration}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {chips}
          </div>

          <div className="mt-5 flex flex-wrap gap-3 border-t border-white/10 pt-4">
            {actions}
          </div>
        </div>
      </div>
    );
  }

  const shellClass = isCompleted
    ? "border-emerald-400/20 bg-emerald-500/10"
    : "border-fuchsia-400/20 bg-fuchsia-500/10";

  const eyebrowClass = isCompleted ? "text-emerald-100/75" : "text-fuchsia-100/75";

  const badgeClass = isCompleted
    ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
    : "border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-100";

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${shellClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={`text-xs uppercase tracking-[0.3em] ${eyebrowClass}`}>{eyebrowLabel}</div>

          <div className="mt-2 text-xl font-semibold text-white">
            {title}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {chips}
          </div>
        </div>

        <div className="shrink-0 space-y-2 text-right">
          <div className={`rounded-full border px-3 py-1 text-xs ${badgeClass}`}>
            {badgeLabel}
          </div>
          {compactDuration ? (
            <div className="text-xs text-slate-300">{compactDuration}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {actions}
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
}: {
  match: LiveGamesSnapshot["liveMatches"][number];
  emphasis: "live" | "ready";
  mounted: boolean;
  compact?: boolean;
  premium?: boolean;
}) {
  const actionHref = match.proof ? `/game-stats/${match.proof.gameStatsId}` : "/lobby";
  const isLive = emphasis === "live";
  const statusLabel = getTournamentMatchStatusLabel(match.status as never);
  const title = `${playerLabel(match.playerOne)} vs ${playerLabel(match.playerTwo)}`;

  if (premium) {
    const shellClass = isLive
      ? "relative overflow-hidden rounded-[1.75rem] border border-fuchsia-300/25 bg-[radial-gradient(circle_at_85%_10%,rgba(217,70,239,0.22),transparent_32%),linear-gradient(135deg,rgba(88,28,135,0.46),rgba(2,6,23,0.92)_64%)] px-5 py-5 shadow-[0_24px_80px_rgba(168,85,247,0.12)]"
      : "relative overflow-hidden rounded-[1.75rem] border border-amber-300/25 bg-[radial-gradient(circle_at_85%_10%,rgba(251,191,36,0.18),transparent_32%),linear-gradient(135deg,rgba(120,53,15,0.42),rgba(2,6,23,0.92)_64%)] px-5 py-5 shadow-[0_24px_80px_rgba(245,158,11,0.10)]";

    const eyebrowClass = isLive ? "text-fuchsia-100/80" : "text-amber-100/80";
    const badgeClass = isLive
      ? "border-fuchsia-200/25 bg-fuchsia-300/12 text-fuchsia-50"
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
      ? "border-fuchsia-400/20 bg-fuchsia-500/10"
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
  renderScheduledMatch,
}: BoardViewProps) {
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.15rem] border border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(239,68,68,0.10),transparent_30%),linear-gradient(145deg,rgba(2,6,23,0.96),rgba(9,17,32,0.94))] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.26)] sm:p-6">
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
                      key={`session-${session.id}`}
                      session={session}
                      mounted={mounted}
                      variant="extreme"
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
                  key={`completed-${session.id}`}
                  session={session}
                  mounted={mounted}
                  variant="extreme"
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.15rem] border border-violet-200/10 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.11),transparent_29%),linear-gradient(145deg,rgba(15,12,30,0.96),rgba(2,6,23,0.95))] p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <RailHeader
            icon={<Archive className="h-4 w-4" />}
            eyebrow="Archive"
            title="Recently played"
            count={`${snapshot.recentMatches.length} loaded`}
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
              href="/game-stats"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/10"
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
            Schedule
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
}: {
  session: LiveSession;
  mounted: boolean;
  variant: TileViewMode;
}) {
  const isCompleted = session.state === "completed";
  const gameHref = `/game-stats/live/${encodeURIComponent(session.sessionKey)}`;
  const watchHref = `/watch/${encodeURIComponent(session.sessionKey)}`;
  const primaryStream = session.primaryStream;
  const title = sessionTitle(session);
  const compactDuration = formatDurationCompact(session.durationSeconds);
  const mapName = session.mapName || "Map pending";
  const winner =
    isCompleted && session.winner && session.winner !== "Unknown"
      ? session.winner
      : null;
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
              {isCompleted ? "Final" : "Live now"}
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
                isCompleted
                  ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
                  : "border-red-300/20 bg-red-400/10 text-red-100"
              }`}
            >
              {isCompleted ? "Replay verified" : "Watcher live"}
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
            <MetaChip>{mapName}</MetaChip>
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
        <Link
          href={gameHref}
          className={`inline-flex min-h-9 flex-1 items-center justify-center rounded-full px-4 py-2 text-center text-xs font-bold transition ${
            isCompleted
              ? "bg-emerald-200 text-emerald-950 hover:bg-emerald-100"
              : "bg-red-200 text-red-950 hover:bg-red-100"
          }`}
        >
          {isCompleted ? "Open final stats" : "Watch live stats"}
        </Link>
        {primaryStream ? (
          <Link
            href={watchHref}
            className="inline-flex min-h-9 flex-1 items-center justify-center rounded-full border border-sky-200/18 bg-sky-300/10 px-4 py-2 text-center text-xs font-semibold text-sky-100 transition hover:bg-sky-300/15"
          >
            Watch video
          </Link>
        ) : null}
        {!isBasic && !isExtreme ? (
          <Link
            href="/bets"
            className="inline-flex min-h-9 items-center justify-center rounded-full border border-amber-200/18 bg-amber-300/8 px-4 py-2 text-center text-xs font-semibold text-amber-100 transition hover:bg-amber-300/14"
          >
            Bet rail
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
      aria-label={`${stream ? "Watch" : "Open"} ${sessionTitle(session)}`}
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
