"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import {
  Bookmark,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Coins,
  ExternalLink,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Swords,
  Wallet,
  Wrench,
  XCircle,
} from "lucide-react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { useKeplr } from "@/hooks/use-keplr";
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
import type { ScheduledMatchTile } from "@/lib/challenges";
import {
  challengeFundingEscrowAddress,
  fundChallengeEscrow,
} from "@/lib/clientChallengeFunding";
import {
  SCHEDULED_MATCH_COLOR_TAGS,
  type ScheduledMatchColorTag,
} from "@/lib/scheduledMatchPreferences";
import { formatDateTime } from "@/lib/timeDisplay";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";

export type ScheduledMatchCardActionKind =
  | "accept"
  | "decline"
  | "cancel"
  | "reschedule"
  | "fund"
  | "check_in";

export type ScheduledMatchCardActionState = {
  challengeId: number | null;
  kind: ScheduledMatchCardActionKind | null;
};

type FundingWorkflowState =
  | "idle"
  | "awaiting_wallet"
  | "confirming_chain"
  | "recording"
  | "verified"
  | "failed";

export type ScheduledMatchCardViewMode = "summary" | "detail" | "advanced";

type ScheduledMatchCardProps = {
  match: ScheduledMatchTile;
  viewerUid?: string | null;
  onAccept?: (challengeId: number) => void | Promise<void>;
  onDecline?: (challengeId: number) => void | Promise<void>;
  onCancel?: (challengeId: number) => void | Promise<void>;
  onReschedule?: (
    challengeId: number,
    payload: {
      scheduledAt: string;
      challengeNote: string;
      wagerAmountWolo: number;
      guaranteeAmountWolo: number;
    }
  ) => void | Promise<void>;
  onFund?: (
    challengeId: number,
    payload: {
      fundingTxHash: string;
      fundingWalletAddress: string;
    }
  ) => void | Promise<void>;
  onCheckIn?: (challengeId: number) => void | Promise<void>;
  onPreferenceChange?: (
    challengeId: number,
    payload: {
      favorite: boolean;
      bookmarked: boolean;
      colorTag: ScheduledMatchColorTag | null;
    }
  ) => void | Promise<void>;
  actionState?: ScheduledMatchCardActionState | null;
  preferenceBusy?: boolean;
  compact?: boolean;
  stacked?: boolean;
  localTimePrimary?: boolean;
  serverNow?: string | null;
  viewMode?: ScheduledMatchCardViewMode;
  defaultViewMode?: ScheduledMatchCardViewMode;
  allowExpand?: boolean;
};

function toLocalDateTimeValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRelativeDuration(diffMs: number) {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(diffMs) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCountdownLabel(match: ScheduledMatchTile, nowMs: number) {
  if (match.economy.countdownTargetAt) {
    const targetMs = new Date(match.economy.countdownTargetAt).getTime();
    const diff = targetMs - nowMs;
    if (match.economy.countdownMode === "opens_in") {
      return `Check-in ${formatRelativeDuration(diff)}`;
    }
    if (match.economy.countdownMode === "closes_in") {
      return `Closes ${formatRelativeDuration(diff)}`;
    }
  }

  const scheduledMs = new Date(match.scheduledAt).getTime();
  const untilStart = scheduledMs - nowMs;
  const sinceStart = nowMs - scheduledMs;

  if (match.displayState === "completed") {
    return "Final";
  }

  if (
    match.displayState === "no_show_left" ||
    match.displayState === "no_show_right" ||
    match.displayState === "double_no_show" ||
    match.displayState === "refunded" ||
    match.displayState === "forfeited"
  ) {
    return "Resolved";
  }

  if (match.displayState === "live") {
    return `Live ${formatRelativeDuration(sinceStart)}`;
  }

  return untilStart >= 0 ? `Starts ${formatRelativeDuration(untilStart)}` : "Start locked";
}

function fundingWorkflowLabel(state: FundingWorkflowState, totalFundingWolo: number) {
  switch (state) {
    case "awaiting_wallet":
      return "Open wallet";
    case "confirming_chain":
      return "Signing";
    case "recording":
      return "Recording";
    case "verified":
      return "Funded";
    case "failed":
      return "Retry";
    default:
      return `Fund ${formatWolo(totalFundingWolo)} WOLO`;
  }
}

function accentClasses(displayState: ScheduledMatchTile["displayState"]) {
  switch (displayState) {
    case "proposed":
    case "pending":
    case "creator_funded":
    case "opponent_funded":
    case "terms_accepted":
    case "accepted":
      return {
        shell: "border-amber-300/18 bg-[linear-gradient(180deg,rgba(251,191,36,0.09),rgba(15,23,42,0.48))]",
        badge: "border-amber-300/25 bg-amber-300/12 text-amber-50",
        icon: "border-amber-300/20 bg-amber-300/12 text-amber-100",
        eyebrow: "text-amber-100/75",
      };
    case "funded":
    case "checkin_open":
    case "left_checked_in":
    case "right_checked_in":
    case "ready":
      return {
        shell: "border-emerald-300/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(15,23,42,0.48))]",
        badge: "border-emerald-300/25 bg-emerald-300/12 text-emerald-50",
        icon: "border-emerald-300/20 bg-emerald-300/12 text-emerald-100",
        eyebrow: "text-emerald-100/75",
      };
    case "live":
      return {
        shell: "border-cyan-300/20 bg-[linear-gradient(180deg,rgba(34,211,238,0.08),rgba(15,23,42,0.48))]",
        badge: "border-cyan-300/25 bg-cyan-300/12 text-cyan-50",
        icon: "border-cyan-300/20 bg-cyan-300/12 text-cyan-100",
        eyebrow: "text-cyan-100/75",
      };
    case "completed":
      return {
        shell: "border-sky-300/18 bg-[linear-gradient(180deg,rgba(125,211,252,0.08),rgba(15,23,42,0.48))]",
        badge: "border-sky-300/25 bg-sky-300/12 text-sky-50",
        icon: "border-sky-300/20 bg-sky-300/12 text-sky-100",
        eyebrow: "text-sky-100/75",
      };
    case "no_show_left":
    case "no_show_right":
    case "double_no_show":
    case "forfeited":
    case "declined":
      return {
        shell: "border-rose-300/20 bg-[linear-gradient(180deg,rgba(251,113,133,0.08),rgba(15,23,42,0.48))]",
        badge: "border-rose-300/25 bg-rose-300/12 text-rose-50",
        icon: "border-rose-300/20 bg-rose-300/12 text-rose-100",
        eyebrow: "text-rose-100/75",
      };
    case "cancelled":
    case "canceled":
    case "refunded":
    default:
      return {
        shell: "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(15,23,42,0.48))]",
        badge: "border-white/15 bg-white/[0.08] text-slate-100",
        icon: "border-white/15 bg-white/[0.08] text-slate-200",
        eyebrow: "text-slate-300/75",
      };
  }
}

function isResolvedState(displayState: ScheduledMatchTile["displayState"]) {
  return [
    "completed",
    "no_show_left",
    "no_show_right",
    "double_no_show",
    "forfeited",
    "declined",
    "cancelled",
    "canceled",
    "refunded",
  ].includes(displayState);
}

function shortHash(value: string | null) {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function statusIcon(done: boolean) {
  return done ? <CheckCircle2 className="h-4 w-4" /> : <CircleDashed className="h-4 w-4" />;
}

function playerFundingLabel({
  funded,
  viewer,
}: {
  funded: boolean;
  viewer: boolean;
}) {
  if (funded) return viewer ? "You funded" : "Funded";
  return viewer ? "You wait" : "Waiting";
}

function defaultCardViewMode({
  compact,
  defaultViewMode,
}: {
  compact: boolean;
  defaultViewMode?: ScheduledMatchCardViewMode;
}) {
  return defaultViewMode ?? (compact ? "summary" : "detail");
}

function buildWatcherStatus(match: ScheduledMatchTile) {
  if (match.linkedSessionKey || match.displayState === "live" || match.displayState === "completed") {
    return {
      label: match.displayState === "completed" ? "Result linked" : "Game detected",
      ready: true,
    };
  }

  if (
    ["funded", "checkin_open", "left_checked_in", "right_checked_in", "ready"].includes(
      match.displayState
    )
  ) {
    return {
      label: "Watcher needed",
      ready: false,
    };
  }

  return {
    label: "Watcher later",
    ready: false,
  };
}

const COLOR_TAG_CLASSES: Record<ScheduledMatchColorTag, string> = {
  gold: "bg-amber-300",
  green: "bg-emerald-300",
  blue: "bg-sky-300",
  red: "bg-rose-300",
};

function PreferenceControls({
  preference,
  busy,
  onChange,
}: {
  preference: ScheduledMatchTile["viewerPreference"];
  busy: boolean;
  onChange?: (payload: {
    favorite: boolean;
    bookmarked: boolean;
    colorTag: ScheduledMatchColorTag | null;
  }) => void;
}) {
  if (!onChange) return null;

  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-slate-950/35 px-1.5 py-1">
      <button
        type="button"
        title={preference.favorite ? "Remove favorite" : "Favorite"}
        disabled={busy}
        onClick={() =>
          onChange({
            favorite: !preference.favorite,
            bookmarked: preference.bookmarked,
            colorTag: preference.colorTag,
          })
        }
        className={`rounded-full p-1.5 transition ${
          preference.favorite ? "text-amber-200" : "text-slate-500 hover:text-amber-100"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Star className={`h-3.5 w-3.5 ${preference.favorite ? "fill-current" : ""}`} />
      </button>
      <button
        type="button"
        title={preference.bookmarked ? "Remove save" : "Save"}
        disabled={busy}
        onClick={() =>
          onChange({
            favorite: preference.favorite,
            bookmarked: !preference.bookmarked,
            colorTag: preference.colorTag,
          })
        }
        className={`rounded-full p-1.5 transition ${
          preference.bookmarked ? "text-sky-200" : "text-slate-500 hover:text-sky-100"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Bookmark className={`h-3.5 w-3.5 ${preference.bookmarked ? "fill-current" : ""}`} />
      </button>
      {SCHEDULED_MATCH_COLOR_TAGS.map((colorTag) => {
        const selected = preference.colorTag === colorTag;
        return (
          <button
            key={colorTag}
            type="button"
            title={selected ? `Clear ${colorTag} tag` : `Tag ${colorTag}`}
            disabled={busy}
            onClick={() =>
              onChange({
                favorite: preference.favorite,
                bookmarked: preference.bookmarked,
                colorTag: selected ? null : colorTag,
              })
            }
            className={`h-3.5 w-3.5 rounded-full border transition ${
              selected ? "border-white/80 p-[2px]" : "border-white/15 p-[3px] opacity-60 hover:opacity-100"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            <span className={`block h-full w-full rounded-full ${COLOR_TAG_CLASSES[colorTag]}`} />
          </button>
        );
      })}
    </div>
  );
}

function MoneyPill({
  icon,
  label,
  value,
  strong = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-[1rem] border px-3 py-3 ${
        strong ? "border-amber-300/20 bg-amber-300/10" : "border-white/10 bg-white/[0.045]"
      }`}
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <span className={strong ? "text-amber-100" : "text-slate-400"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-2 truncate whitespace-nowrap text-sm font-semibold tabular-nums text-white">
        {value}
      </div>
    </div>
  );
}

function StatusDot({
  icon,
  label,
  value,
  active,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[0.95rem] border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500">
        <span className={active ? "text-emerald-200" : "text-slate-500"}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-xs font-medium text-white">{value}</div>
    </div>
  );
}

function AdvancedRow({
  label,
  value,
  href,
}: {
  label: string;
  value: ReactNode;
  href?: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/8 py-2 last:border-b-0">
      <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {href ? (
        <Link
          href={href}
          className="min-w-0 truncate text-right text-xs font-medium text-sky-100 hover:text-white"
        >
          {value}
        </Link>
      ) : (
        <span className="min-w-0 truncate text-right text-xs font-medium text-slate-200">{value}</span>
      )}
    </div>
  );
}

export function CompactScheduledMatchHistoryRow({
  match,
  viewerUid,
}: {
  match: ScheduledMatchTile;
  viewerUid?: string | null;
}) {
  const winner = match.linkedWinner || null;
  const viewerWon = Boolean(
    winner &&
      viewerUid &&
      (winner.toLowerCase() === match.challenger.name.toLowerCase() ||
        winner.toLowerCase() === match.challenged.name.toLowerCase()) &&
      ((viewerUid === match.challenger.uid && winner.toLowerCase() === match.challenger.name.toLowerCase()) ||
        (viewerUid === match.challenged.uid && winner.toLowerCase() === match.challenged.name.toLowerCase()))
  );
  const resultLabel =
    match.displayState === "completed" && winner
      ? `${winner} won`
      : match.economy.resolution.label || match.economy.statusLabel;
  const amountLabel =
    match.displayState === "completed" && winner
      ? `${viewerWon ? "+" : ""}${formatWolo(match.terms.wagerAmountWolo * 2)} WOLO`
      : match.displayState.includes("no_show")
        ? "Guarantee"
        : match.economy.statusLabel;
  const href =
    (match.displayState === "completed" || match.displayState === "live") && match.linkedSessionKey
      ? `/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}`
      : `/contact-emaren?user=${encodeURIComponent(
          viewerUid === match.challenger.uid ? match.challenged.uid : match.challenger.uid
        )}`;

  return (
    <Link
      href={href}
      className="flex min-w-0 items-center justify-between gap-3 rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3 transition hover:border-white/20 hover:bg-white/[0.065]"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">
          {match.challenger.name} vs {match.challenged.name}
        </div>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <TimeDisplayText value={match.activityAt} includeZone={false} className="text-slate-400" />
          <span className="text-slate-600">/</span>
          <span className="truncate">{resultLabel}</span>
        </div>
      </div>
      <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-medium text-slate-200">
        {amountLabel}
      </div>
    </Link>
  );
}

export default function ScheduledMatchCard({
  match,
  viewerUid,
  onAccept,
  onDecline,
  onCancel,
  onReschedule,
  onFund,
  onCheckIn,
  onPreferenceChange,
  actionState = null,
  preferenceBusy = false,
  compact = false,
  stacked = false,
  localTimePrimary = false,
  serverNow = null,
  viewMode,
  defaultViewMode,
  allowExpand = true,
}: ScheduledMatchCardProps) {
  const { address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const { timeClockMode, browserTimeZone } = useLobbyAppearance();
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => (serverNow ? new Date(serverNow).getTime() : 0));
  const [internalViewMode, setInternalViewMode] = useState<ScheduledMatchCardViewMode>(() =>
    defaultCardViewMode({ compact, defaultViewMode })
  );
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [showFundingForm, setShowFundingForm] = useState(false);
  const [fundingWorkflow, setFundingWorkflow] = useState<FundingWorkflowState>("idle");
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduledAt, setRescheduledAt] = useState(() => toLocalDateTimeValue(match.scheduledAt));
  const [rescheduleNote, setRescheduleNote] = useState(match.challengeNote ?? "");
  const [wagerAmount, setWagerAmount] = useState(String(match.terms.wagerAmountWolo));
  const [guaranteeAmount, setGuaranteeAmount] = useState(String(match.terms.guaranteeAmountWolo));
  const [fundingTxHash, setFundingTxHash] = useState("");
  const [fundingWalletAddress, setFundingWalletAddress] = useState("");

  useEffect(() => {
    setMounted(true);
    const mountedAt = Date.now();
    const baseServerMs = serverNow ? new Date(serverNow).getTime() : Date.now();

    setNowMs(baseServerMs);
    const interval = window.setInterval(() => {
      setNowMs(baseServerMs + (Date.now() - mountedAt));
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [serverNow]);

  useEffect(() => {
    setInternalViewMode(defaultCardViewMode({ compact, defaultViewMode }));
  }, [compact, defaultViewMode, match.id]);

  useEffect(() => {
    setShowRescheduleForm(false);
    setShowFundingForm(false);
    setFundingWorkflow("idle");
    setFundingError(null);
    setActionError(null);
    setRescheduledAt(toLocalDateTimeValue(match.scheduledAt));
    setRescheduleNote(match.challengeNote ?? "");
    setWagerAmount(String(match.terms.wagerAmountWolo));
    setGuaranteeAmount(String(match.terms.guaranteeAmountWolo));
    setFundingTxHash("");
    setFundingWalletAddress("");
  }, [
    match.id,
    match.scheduledAt,
    match.challengeNote,
    match.terms.guaranteeAmountWolo,
    match.terms.wagerAmountWolo,
  ]);

  const activeViewMode = viewMode ?? internalViewMode;
  const canChangeView = allowExpand && !viewMode;

  function setCardViewMode(nextViewMode: ScheduledMatchCardViewMode) {
    if (!canChangeView) return;
    setInternalViewMode(nextViewMode);
  }

  function revealAdvanced() {
    if (viewMode) return;
    if (!allowExpand && defaultViewMode !== "advanced") return;
    setInternalViewMode("advanced");
  }

  const accent = accentClasses(match.displayState);
  const viewerIsChallenger = Boolean(viewerUid && viewerUid === match.challenger.uid);
  const viewerIsChallenged = Boolean(viewerUid && viewerUid === match.challenged.uid);
  const viewerIsParticipant = viewerIsChallenger || viewerIsChallenged;
  const creatorFunded = Boolean(match.economy.creatorFundedAt);
  const opponentFunded = Boolean(match.economy.opponentFundedAt);
  const bothFunded = creatorFunded && opponentFunded;
  const viewerAlreadyFunded = viewerIsChallenger
    ? creatorFunded
    : viewerIsChallenged
      ? opponentFunded
      : false;
  const viewerAlreadyCheckedIn = viewerIsChallenger
    ? Boolean(match.economy.leftCheckedInAt)
    : viewerIsChallenged
      ? Boolean(match.economy.rightCheckedInAt)
      : false;
  const hasFundingOnFile = creatorFunded || opponentFunded;
  const hasCheckInOnFile = Boolean(match.economy.leftCheckedInAt || match.economy.rightCheckedInAt);
  const currentActionKind = actionState?.challengeId === match.id ? actionState.kind : null;
  const cardBusy = Boolean(currentActionKind) || fundingWorkflow === "confirming_chain" || fundingWorkflow === "recording";
  const countdownLabel = mounted ? formatCountdownLabel(match, nowMs) : "Scheduled";
  const watcherStatus = useMemo(() => buildWatcherStatus(match), [match]);
  const resolved = isResolvedState(match.displayState);

  const canDecline = Boolean(
    onDecline &&
      viewerIsChallenged &&
      ["proposed", "pending", "creator_funded"].includes(match.displayState)
  );
  const canAcceptAndFund = Boolean(
    onAccept &&
      viewerIsChallenged &&
      ((match.economy.hasTerms && creatorFunded && ["creator_funded"].includes(match.displayState)) ||
        (!match.economy.hasTerms && ["proposed", "pending"].includes(match.displayState)))
  );
  const canCancel = Boolean(
    onCancel &&
      viewerIsParticipant &&
      !hasCheckInOnFile &&
      match.displayState !== "live" &&
      !resolved &&
      [
        "proposed",
        "pending",
        "terms_accepted",
        "accepted",
        "creator_funded",
        "opponent_funded",
        "funded",
        "checkin_open",
      ].includes(match.displayState)
  );
  const canReschedule = Boolean(
    onReschedule &&
      viewerIsParticipant &&
      !hasCheckInOnFile &&
      match.displayState !== "live" &&
      !resolved &&
      [
        "proposed",
        "pending",
        "terms_accepted",
        "accepted",
        "creator_funded",
        "opponent_funded",
        "funded",
        "checkin_open",
      ].includes(match.displayState)
  );
  const canFund = Boolean(
    onFund &&
      viewerIsParticipant &&
      match.economy.hasTerms &&
      !viewerAlreadyFunded &&
      !resolved &&
      !["declined", "cancelled", "canceled"].includes(match.displayState) &&
      (!mounted || new Date(match.scheduledAt).getTime() > nowMs)
  );
  const canCheckIn = Boolean(
    onCheckIn &&
      viewerIsParticipant &&
      viewerAlreadyFunded &&
      !viewerAlreadyCheckedIn &&
      match.economy.checkInWindowState === "open"
  );

  const spotlightPlayer = viewerIsChallenged ? match.challenger : match.challenged;
  const threadHref = `/contact-emaren?user=${encodeURIComponent(spotlightPlayer.uid)}`;
  const statsHref =
    (match.displayState === "completed" || match.displayState === "live") && match.linkedSessionKey
      ? `/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}`
      : null;

  const primaryActionLabel = useMemo(() => {
    if (canAcceptAndFund) return `Accept + Fund ${formatWolo(match.terms.totalFundingWolo)}`;
    if (canFund) return fundingWorkflowLabel(fundingWorkflow, match.terms.totalFundingWolo);
    if (canCheckIn) return "Check In";
    if (statsHref) return match.displayState === "completed" ? "View Result" : "Watch Live";
    if (viewerIsChallenger && ["proposed", "pending"].includes(match.displayState) && !creatorFunded) {
      return `Fund ${formatWolo(match.terms.totalFundingWolo)} WOLO`;
    }
    return "Open Thread";
  }, [
    canAcceptAndFund,
    canCheckIn,
    canFund,
    creatorFunded,
    fundingWorkflow,
    match.displayState,
    match.terms.totalFundingWolo,
    statsHref,
    viewerIsChallenger,
  ]);
  const viewerFundingSummary = viewerIsParticipant
    ? viewerAlreadyFunded
      ? "You funded"
      : canAcceptAndFund
        ? "Accept + fund"
        : canFund
          ? "You pending"
          : "You waiting"
    : bothFunded
      ? "Funded"
      : "Funding open";
  const counterpartFundingSummary = viewerIsChallenger
    ? opponentFunded
      ? `${match.challenged.name} funded`
      : "Awaiting opponent"
    : viewerIsChallenged
      ? creatorFunded
        ? `${match.challenger.name} funded`
        : "Awaiting creator"
      : bothFunded
        ? "Locked"
        : match.economy.statusLabel;
  const summaryStateLabel = resolved || bothFunded ? match.economy.statusLabel : counterpartFundingSummary;
  const summaryCanExpand = canChangeView && activeViewMode === "summary";

  async function runAction(action: () => void | Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Challenge action failed.");
      throw error;
    }
  }

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onReschedule || !rescheduledAt.trim()) return;

    const nextWagerAmount = Number.parseInt(wagerAmount, 10);
    const nextGuaranteeAmount = Number.parseInt(guaranteeAmount, 10);
    if (!Number.isFinite(nextWagerAmount) || !Number.isFinite(nextGuaranteeAmount)) return;

    await runAction(async () => {
      await onReschedule(match.id, {
        scheduledAt: new Date(rescheduledAt).toISOString(),
        challengeNote: rescheduleNote,
        wagerAmountWolo: nextWagerAmount,
        guaranteeAmountWolo: nextGuaranteeAmount,
      });
    });
    setShowRescheduleForm(false);
  }

  async function handleFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onFund || !fundingTxHash.trim()) return;

    await runAction(async () => {
      await onFund(match.id, {
        fundingTxHash: fundingTxHash.trim(),
        fundingWalletAddress: fundingWalletAddress.trim(),
      });
    });
    setShowFundingForm(false);
  }

  async function cancelMatch() {
    if (!onCancel) return;

    if (hasFundingOnFile) {
      const confirmed = window.confirm(
        "Cancel this funded match? Funding proof stays on the rail and any refund must be handled by settlement/operator review."
      );
      if (!confirmed) return;
    }

    await runAction(() => onCancel(match.id));
  }

  async function fundNow() {
    if (!onFund) return;

    setFundingError(null);
    setActionError(null);

    if (!challengeFundingEscrowAddress()) {
      setFundingWorkflow("failed");
      setFundingError("Challenge escrow is not exposed to the browser.");
      revealAdvanced();
      return;
    }

    try {
      setFundingWorkflow("awaiting_wallet");
      const walletAddress = connectedWalletAddress || (await connectKeplr());

      setFundingWorkflow("confirming_chain");
      const result = await fundChallengeEscrow({
        challengeId: match.id,
        amountWolo: match.terms.totalFundingWolo,
        fallbackWalletAddress: walletAddress,
      });

      setFundingWorkflow("recording");
      await onFund(match.id, {
        fundingTxHash: result.fundingTxHash,
        fundingWalletAddress: result.walletAddress,
      });

      setFundingWorkflow("verified");
      setShowFundingForm(false);
    } catch (error) {
      setFundingWorkflow("failed");
      setFundingError(error instanceof Error ? error.message : "Challenge funding failed.");
      revealAdvanced();
    }
  }

  async function acceptAndFund() {
    if (!onAccept) return;

    if (!match.economy.hasTerms) {
      await runAction(() => onAccept(match.id));
      return;
    }

    if (!onFund) {
      setActionError("Funding rail is not available here.");
      return;
    }

    if (!challengeFundingEscrowAddress()) {
      setFundingError("Challenge escrow is not exposed to the browser.");
      revealAdvanced();
      return;
    }

    try {
      setFundingError(null);
      setActionError(null);
      setFundingWorkflow("awaiting_wallet");
      const walletAddress = connectedWalletAddress || (await connectKeplr());

      await onAccept(match.id);

      setFundingWorkflow("confirming_chain");
      const result = await fundChallengeEscrow({
        challengeId: match.id,
        amountWolo: match.terms.totalFundingWolo,
        fallbackWalletAddress: walletAddress,
      });

      setFundingWorkflow("recording");
      await onFund(match.id, {
        fundingTxHash: result.fundingTxHash,
        fundingWalletAddress: result.walletAddress,
      });
      setFundingWorkflow("verified");
    } catch (error) {
      setFundingWorkflow("failed");
      setFundingError(error instanceof Error ? error.message : "Accept + fund failed.");
      revealAdvanced();
    }
  }

  function renderPrimaryAction() {
    const buttonClass =
      "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60";

    if (canAcceptAndFund) {
      return (
        <button type="button" onClick={() => void acceptAndFund()} disabled={cardBusy} className={buttonClass}>
          <Wallet className="h-4 w-4" />
          {currentActionKind === "accept" ? "Accepting" : primaryActionLabel}
        </button>
      );
    }

    if (canFund) {
      return (
        <button type="button" onClick={() => void fundNow()} disabled={cardBusy} className={buttonClass}>
          <Wallet className="h-4 w-4" />
          {currentActionKind === "fund" ? "Recording" : primaryActionLabel}
        </button>
      );
    }

    if (canCheckIn) {
      return (
        <button
          type="button"
          onClick={() => void runAction(() => onCheckIn?.(match.id))}
          disabled={cardBusy}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          {currentActionKind === "check_in" ? "Checking in" : primaryActionLabel}
        </button>
      );
    }

    if (statsHref) {
      return (
        <Link href={statsHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">
          <ExternalLink className="h-4 w-4" />
          {primaryActionLabel}
        </Link>
      );
    }

    return (
      <Link href={threadHref} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/[0.08]">
        <ExternalLink className="h-4 w-4" />
        {primaryActionLabel}
      </Link>
    );
  }

  if (compact && resolved && activeViewMode === "summary") {
    return <CompactScheduledMatchHistoryRow match={match} viewerUid={viewerUid} />;
  }

  if (activeViewMode === "summary") {
    const expandSummary = (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("a, button, [role='button']")) return;
      setCardViewMode("detail");
    };
    const summaryContent = (
      <div
        onClick={summaryCanExpand ? expandSummary : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap text-[11px] text-slate-200 sm:text-xs ${
          summaryCanExpand ? "cursor-pointer" : ""
        }`}
      >
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 ${accent.badge}`}>
          <CalendarClock className="h-3 w-3" />
          Scheduled
        </span>
        <span className="truncate font-semibold text-white">
          {match.challenger.name} vs {match.challenged.name}
        </span>
        <span className="shrink-0 text-slate-600">·</span>
        <span className="shrink-0 text-slate-300">
          {formatWolo(match.terms.totalFundingWolo)} WOLO each
        </span>
        <span className="shrink-0 text-slate-600">·</span>
        <TimeDisplayText
          value={match.scheduledAt}
          includeZone={false}
          className="shrink-0 text-slate-300"
          bubbleClassName="max-w-[14rem] text-center"
        />
        <span className="shrink-0 text-slate-600">·</span>
        <span className="shrink-0 text-slate-300">{viewerFundingSummary}</span>
        <span className="shrink-0 text-slate-600">·</span>
        <span className="truncate text-slate-300">{summaryStateLabel}</span>
      </div>
    );

    return (
      <div className={`min-w-0 rounded-full border px-3 py-2 ${accent.shell}`}>
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">{summaryContent}</div>

          {summaryCanExpand ? (
            <button
              type="button"
              title="Details"
              aria-label="Open scheduled match details"
              onClick={() => setCardViewMode("detail")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-white/25 hover:text-white"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <Link
            href={threadHref}
            title="Open thread"
            className="hidden shrink-0 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-white transition hover:border-white/25 hover:bg-white/[0.08] sm:inline-flex"
          >
            Open
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 rounded-[1.35rem] border ${compact ? "p-3" : "p-4 sm:p-5"} ${accent.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] ${accent.eyebrow}`}>
            <Swords className="h-3.5 w-3.5" />
            Scheduled match
          </div>
          <div className={`${compact ? "mt-1 text-base" : "mt-2 text-xl"} break-words font-semibold text-white`}>
            {match.challenger.name} vs {match.challenged.name}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <PreferenceControls
            preference={match.viewerPreference}
            busy={preferenceBusy}
            onChange={
              onPreferenceChange
                ? (payload) => {
                    void onPreferenceChange(match.id, payload);
                  }
                : undefined
            }
          />
          {canChangeView ? (
            <>
              <button
                type="button"
                title="Collapse to summary"
                aria-label="Collapse scheduled match to summary"
                onClick={() => setCardViewMode("summary")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/25 hover:text-white"
              >
                <CircleDashed className="h-4 w-4" />
              </button>
              <button
                type="button"
                title={activeViewMode === "advanced" ? "Show basic details" : "Advanced details"}
                aria-label={activeViewMode === "advanced" ? "Show basic scheduled match details" : "Open advanced scheduled match details"}
                onClick={() => setCardViewMode(activeViewMode === "advanced" ? "detail" : "advanced")}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
                  activeViewMode === "advanced"
                    ? "border-amber-300/30 bg-amber-300/12 text-amber-100"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:text-white"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} grid ${stacked || compact ? "sm:grid-cols-3" : "sm:grid-cols-3"}`}>
        <MoneyPill
          icon={<Coins className="h-3.5 w-3.5" />}
          label="Wager"
          value={`${formatWolo(match.terms.wagerAmountWolo)} WOLO`}
        />
        <MoneyPill
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          label="Guarantee"
          value={`${formatWolo(match.terms.guaranteeAmountWolo)} WOLO`}
        />
        <MoneyPill
          icon={
            <Image src={WOLO_LOGO_SRC} alt="WOLO" width={15} height={15} className="h-[15px] w-[15px]" />
          }
          label="Total each"
          value={`${formatWolo(match.terms.totalFundingWolo)} WOLO`}
          strong
        />
      </div>

      <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} grid sm:grid-cols-2`}>
        <StatusDot
          icon={statusIcon(creatorFunded)}
          label={viewerIsChallenger ? "You" : "Creator"}
          value={playerFundingLabel({ funded: creatorFunded, viewer: viewerIsChallenger })}
          active={creatorFunded}
        />
        <StatusDot
          icon={statusIcon(opponentFunded)}
          label={viewerIsChallenged ? "You" : "Opponent"}
          value={playerFundingLabel({ funded: opponentFunded, viewer: viewerIsChallenged })}
          active={opponentFunded}
        />
      </div>

      <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} grid sm:grid-cols-4`}>
        <StatusDot
          icon={<Wallet className="h-4 w-4" />}
          label="Wallets"
          value={bothFunded ? "Locked" : "Open"}
          active={bothFunded}
        />
        <StatusDot
          icon={<CalendarClock className="h-4 w-4" />}
          label="Check-in"
          value={
            match.economy.checkInWindowState === "open"
              ? "Open"
              : match.economy.checkInWindowState === "upcoming"
                ? "Soon"
                : match.economy.checkInWindowState === "closed"
                  ? "Closed"
                  : "Later"
          }
          active={match.economy.checkInWindowState === "open" || match.displayState === "ready"}
        />
        <StatusDot
          icon={<Radio className="h-4 w-4" />}
          label="Watcher"
          value={watcherStatus.label}
          active={watcherStatus.ready}
        />
        <StatusDot
          icon={<Swords className="h-4 w-4" />}
          label="State"
          value={match.economy.statusLabel}
          active={["ready", "live", "completed"].includes(match.displayState)}
        />
      </div>

      <div className={`${compact ? "mt-3" : "mt-4"} flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-medium ${accent.badge}`}>
              {countdownLabel}
            </span>
            <span className="text-xs text-slate-400">
              {localTimePrimary ? (
                formatDateTime(
                  match.scheduledAt,
                  {
                    timeDisplayMode: "local",
                    timeClockMode,
                    timezoneOverride: browserTimeZone,
                  },
                  {
                    browserTimeZone,
                    includeZone: true,
                  }
                )
              ) : (
                <TimeDisplayText value={match.scheduledAt} includeZone className="text-slate-300" />
              )}
            </span>
          </div>
          {actionError || fundingError ? (
            <div className="mt-2 max-w-xl text-xs leading-5 text-amber-100">
              {actionError || fundingError}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {renderPrimaryAction()}
          {primaryActionLabel !== "Open Thread" ? (
            <Link
              href={threadHref}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Thread
            </Link>
          ) : null}
          {canDecline ? (
            <button
              type="button"
              onClick={() => void runAction(() => onDecline?.(match.id))}
              disabled={cardBusy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-rose-300/28 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              Decline
            </button>
          ) : null}
          {canReschedule ? (
            <button
              type="button"
              onClick={() => {
                setShowRescheduleForm((current) => !current);
                setShowFundingForm(false);
              }}
              disabled={cardBusy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-sky-300/28 bg-sky-400/10 px-3 py-2 text-sm font-semibold text-sky-100 transition hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarClock className="h-4 w-4" />
              {showRescheduleForm ? "Close Time" : "Edit Time"}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              onClick={() => void cancelMatch()}
              disabled={cardBusy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircle className="h-4 w-4" />
              {currentActionKind === "cancel"
                ? "Cancelling"
                : hasFundingOnFile
                  ? "Cancel + Refund Pending"
                  : "Cancel"}
            </button>
          ) : null}
        </div>
      </div>

      {canReschedule && showRescheduleForm ? (
        <form
          onSubmit={handleReschedule}
          className="mt-3 space-y-3 rounded-[0.95rem] border border-white/10 bg-slate-950/35 p-3"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr]">
            <label className="block space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">New start</span>
              <input
                type="datetime-local"
                value={rescheduledAt}
                onChange={(event) => setRescheduledAt(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Note</span>
              <AutoGrowTextarea
                value={rescheduleNote}
                onChange={(event) =>
                  setRescheduleNote(event.target.value.slice(0, CHALLENGE_NOTE_MAX_CHARS))
                }
                maxRows={compact ? 3 : 4}
                maxLength={CHALLENGE_NOTE_MAX_CHARS}
                disabled={cardBusy}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Shift the lock."
              />
            </label>
          </div>

          {hasFundingOnFile ? (
            <div className="rounded-[0.95rem] border border-amber-300/18 bg-amber-300/10 px-3 py-3 text-xs font-medium text-amber-50">
              Funding preserved · {formatWolo(match.terms.totalFundingWolo)} WOLO each
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1.5">
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Wager</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={wagerAmount}
                  onChange={(event) => setWagerAmount(event.target.value)}
                  disabled={cardBusy}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Guarantee</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={guaranteeAmount}
                  onChange={(event) => setGuaranteeAmount(event.target.value)}
                  disabled={cardBusy}
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </label>
              <MoneyPill
                icon={<Wallet className="h-3.5 w-3.5" />}
                label="Total each"
                value={`${formatWolo((Number.parseInt(wagerAmount, 10) || 0) + (Number.parseInt(guaranteeAmount, 10) || 0))} WOLO`}
                strong
              />
            </div>
          )}

          <button
            type="submit"
            disabled={cardBusy}
            className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionKind === "reschedule" ? "Saving" : hasFundingOnFile ? "Save Time" : "Send Terms"}
          </button>
        </form>
      ) : null}

      {activeViewMode === "advanced" ? (
        <div className="mt-4 rounded-[1.1rem] border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-slate-400">
              <Wrench className="h-3.5 w-3.5" />
              Details
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-300">
              Fee 0% beta
            </div>
          </div>

          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="rounded-[0.95rem] border border-white/10 bg-white/[0.035] px-3 py-2">
              <AdvancedRow label="Creator tx" value={shortHash(match.economy.creatorFundingTxHash)} />
              <AdvancedRow label="Opponent tx" value={shortHash(match.economy.opponentFundingTxHash)} />
              <AdvancedRow
                label="Creator wallet"
                value={shortHash(match.economy.creatorFundingWalletAddress)}
              />
              <AdvancedRow
                label="Opponent wallet"
                value={shortHash(match.economy.opponentFundingWalletAddress)}
              />
            </div>

            <div className="rounded-[0.95rem] border border-white/10 bg-white/[0.035] px-3 py-2">
              <AdvancedRow
                label="Check-in open"
                value={<TimeDisplayText value={match.economy.checkInOpensAt} includeZone={false} />}
              />
              <AdvancedRow
                label="Start lock"
                value={<TimeDisplayText value={match.economy.checkInClosesAt} includeZone={false} />}
              />
              <AdvancedRow
                label="Creator in"
                value={
                  match.economy.leftCheckedInAt ? (
                    <TimeDisplayText value={match.economy.leftCheckedInAt} includeZone={false} />
                  ) : (
                    "-"
                  )
                }
              />
              <AdvancedRow
                label="Opponent in"
                value={
                  match.economy.rightCheckedInAt ? (
                    <TimeDisplayText value={match.economy.rightCheckedInAt} includeZone={false} />
                  ) : (
                    "-"
                  )
                }
              />
            </div>
          </div>

          <div className="mt-3 rounded-[0.95rem] border border-white/10 bg-white/[0.035] px-3 py-2">
            <AdvancedRow
              label="Watcher"
              value={match.linkedSessionKey ? shortHash(match.linkedSessionKey) : watcherStatus.label}
              href={match.linkedSessionKey ? `/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}` : null}
            />
            <AdvancedRow label="Map" value={match.linkedMapName || "-"} />
            <AdvancedRow label="Winner" value={match.linkedWinner || "-"} />
            <AdvancedRow label="Resolution" value={match.economy.resolution.label || match.economy.statusLabel} />
          </div>

          {match.challengeNote ? (
            <div className="mt-3 rounded-[0.95rem] border border-white/10 bg-white/[0.035] px-3 py-3 text-sm leading-6 text-slate-300">
              {match.challengeNote}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            {canFund ? (
              <button
                type="button"
                onClick={() => {
                  setShowFundingForm((current) => !current);
                  setShowRescheduleForm(false);
                }}
                disabled={cardBusy}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {showFundingForm ? "Close Rescue" : "Manual Rescue"}
              </button>
            ) : null}
            <Link
              href={threadHref}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Thread
            </Link>
            <Link
              href={spotlightPlayer.href}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Player
            </Link>
          </div>

          {canFund && showFundingForm ? (
            <form
              onSubmit={handleFunding}
              className="mt-3 space-y-3 rounded-[0.95rem] border border-white/10 bg-slate-950/35 p-3"
            >
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Manual rescue</div>
                <div className="mt-1 text-xs leading-5 text-slate-300">
                  Admin fallback only. Normal funding signs in wallet.
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block space-y-1.5">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Funding tx hash</span>
                  <input
                    type="text"
                    value={fundingTxHash}
                    onChange={(event) => setFundingTxHash(event.target.value)}
                    disabled={cardBusy}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Signed escrow tx hash"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Wallet address</span>
                  <input
                    type="text"
                    value={fundingWalletAddress}
                    onChange={(event) => setFundingWalletAddress(event.target.value)}
                    disabled={cardBusy}
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Optional"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={cardBusy}
                className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {currentActionKind === "fund" ? "Recording" : "Record Proof"}
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
