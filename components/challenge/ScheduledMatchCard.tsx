"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
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
  Trophy,
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
  fundChallengeEscrow,
} from "@/lib/clientChallengeFunding";
import {
  SCHEDULED_MATCH_COLOR_TAGS,
  type ScheduledMatchColorTag,
} from "@/lib/scheduledMatchPreferences";
import { formatDateTime } from "@/lib/timeDisplay";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.webp";

export type ScheduledMatchCardActionKind =
  | "accept"
  | "decline"
  | "cancel"
  | "reschedule"
  | "confirm_time"
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
  onConfirmTime?: (challengeId: number) => void | Promise<void>;
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

type ChallengeFinancialProjection =
  | string
  | {
      state?: string | null;
      label?: string | null;
      summary?: string | null;
      detail?: string | null;
      amountWolo?: number | null;
    }
  | null;

type ChallengeCardProjection = {
  scheduleMode?: string | null;
  scheduledAt?: string | null;
  acceptanceExpiresAt?: string | null;
  fundingExpiresAt?: string | null;
  playExpiresAt?: string | null;
  financialState?: ChallengeFinancialProjection;
  financialSummary?: ChallengeFinancialProjection;
  financial?: {
    state?: string | null;
    label?: string | null;
    detail?: string | null;
  } | null;
  currentHeadline?: string | null;
  currentDetail?: string | null;
  deadlineKind?: string | null;
  deadlineAt?: string | null;
  eventCount?: number | null;
  chainTxCount?: number | null;
};

function projectedMatch(match: ScheduledMatchTile) {
  return match as unknown as ChallengeCardProjection;
}

function toLocalDateTimeValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function humanizeState(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function financialProjectionLabel(match: ScheduledMatchTile) {
  const projection = projectedMatch(match);
  if (projection.financial?.label?.trim()) return projection.financial.label.trim();
  const financial = projection.financialState ?? projection.financialSummary;
  if (!financial) return null;
  if (typeof financial === "string") return humanizeState(financial);
  return (
    financial.summary?.trim() ||
    financial.label?.trim() ||
    (financial.state ? humanizeState(financial.state) : null) ||
    financial.detail?.trim() ||
    null
  );
}

function challengeDeadline(match: ScheduledMatchTile) {
  const projection = projectedMatch(match);
  if (projection.deadlineKind && projection.deadlineAt) {
    const label =
      projection.deadlineKind === "acceptance"
        ? "Accept by"
        : projection.deadlineKind === "funding"
          ? "Fund by"
          : projection.deadlineKind === "play"
            ? "Play by"
            : "Due";
    return { label, value: projection.deadlineAt };
  }
  if (["issued", "proposed", "pending", "creator_funded"].includes(match.displayState)) {
    return { label: "Accept by", value: projection.acceptanceExpiresAt ?? null };
  }
  if (["terms_accepted", "accepted", "opponent_funded"].includes(match.displayState)) {
    return { label: "Fund by", value: projection.fundingExpiresAt ?? null };
  }
  return { label: "Play by", value: projection.playExpiresAt ?? null };
}

function isExactSchedule(match: ScheduledMatchTile) {
  const projection = projectedMatch(match);
  if (projection.scheduleMode) return projection.scheduleMode === "exact";
  return Boolean(projection.scheduledAt);
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
  const projection = projectedMatch(match);
  const exactSchedule = isExactSchedule(match);

  if (match.displayState === "completed") return "Final";
  if (isResolvedState(match.displayState)) return "Resolved";

  if (!exactSchedule) {
    const deadline = challengeDeadline(match).value;
    if (deadline) {
      const deadlineMs = new Date(deadline).getTime();
      if (Number.isFinite(deadlineMs)) {
        if (deadlineMs <= nowMs) return `${challengeDeadline(match).label} passed`;
        return `${challengeDeadline(match).label} · ${formatRelativeDuration(deadlineMs - nowMs)}`;
      }
    }
    return "Play anytime";
  }

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

  const scheduledMs = projection.scheduledAt ? new Date(projection.scheduledAt).getTime() : Number.NaN;
  if (!Number.isFinite(scheduledMs)) return "Exact time pending";
  const untilStart = scheduledMs - nowMs;
  const sinceStart = nowMs - scheduledMs;

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

function accentClasses(displayState: ScheduledMatchTile["displayState"] | string) {
  switch (displayState) {
    case "issued":
    case "proposed":
    case "pending":
    case "creator_funded":
    case "opponent_funded":
    case "terms_accepted":
    case "accepted":
      return {
        shell: "border-emerald-100/38 bg-[radial-gradient(circle_at_16%_0%,rgba(167,243,208,0.30),transparent_28%),radial-gradient(circle_at_78%_18%,rgba(45,212,191,0.24),transparent_34%),radial-gradient(circle_at_50%_118%,rgba(250,204,21,0.16),transparent_44%),linear-gradient(135deg,rgba(4,120,87,0.96),rgba(6,78,59,0.90)_45%,rgba(2,6,23,0.84)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_32px_rgba(16,185,129,0.20),0_22px_70px_rgba(0,0,0,0.38)]",
        badge: "border-emerald-100/42 bg-emerald-300/14 text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,0.14),inset_0_1px_0_rgba(255,255,255,0.10)]",
        icon: "border-emerald-100/32 bg-emerald-300/14 text-emerald-50 shadow-[0_0_16px_rgba(52,211,153,0.12)]",
        eyebrow: "text-emerald-50/88 drop-shadow-[0_0_12px_rgba(110,231,183,0.18)]",
      };
    case "funded":
    case "checkin_open":
    case "left_checked_in":
    case "right_checked_in":
    case "ready":
      return {
        shell: "border-emerald-100/34 bg-[radial-gradient(circle_at_18%_0%,rgba(110,231,183,0.26),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(20,184,166,0.20),transparent_34%),radial-gradient(circle_at_48%_112%,rgba(250,204,21,0.12),transparent_42%),linear-gradient(135deg,rgba(4,120,87,0.92),rgba(6,78,59,0.86)_46%,rgba(2,6,23,0.86)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_0_28px_rgba(16,185,129,0.18),0_20px_62px_rgba(0,0,0,0.34)]",
        badge: "border-emerald-100/42 bg-emerald-300/14 text-emerald-50 shadow-[0_0_18px_rgba(52,211,153,0.14),inset_0_1px_0_rgba(255,255,255,0.10)]",
        icon: "border-emerald-100/32 bg-emerald-300/14 text-emerald-50 shadow-[0_0_16px_rgba(52,211,153,0.12)]",
        eyebrow: "text-emerald-50/88 drop-shadow-[0_0_12px_rgba(110,231,183,0.18)]",
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
    "expired",
    "funding_expired",
    "play_expired",
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
  gold: "bg-emerald-200 shadow-[0_0_12px_rgba(110,231,183,0.65)]",
  green: "bg-emerald-200 shadow-[0_0_12px_rgba(110,231,183,0.65)]",
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
      className={`min-w-0 overflow-hidden rounded-[1rem] border px-3 py-3 ${
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
    <div className="min-w-0 overflow-hidden rounded-[0.95rem] border border-emerald-100/16 bg-[linear-gradient(135deg,rgba(6,95,70,0.34),rgba(2,6,23,0.38))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
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
}: {
  match: ScheduledMatchTile;
  viewerUid?: string | null;
}) {
  const winner = match.linkedWinner || null;
  const resultLabel =
    match.displayState === "completed" && winner
      ? `${winner} won`
      : match.economy.resolution.label || match.economy.statusLabel;
  const amountLabel = financialProjectionLabel(match) || match.economy.statusLabel;
  const href = `/challenge/${match.id}`;

  return (
    <Link
      href={href}
      className="flex min-w-0 items-center justify-between gap-3 rounded-[1rem] border border-emerald-100/14 bg-[linear-gradient(135deg,rgba(6,95,70,0.28),rgba(2,6,23,0.42))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)] transition hover:border-emerald-100/26 hover:bg-emerald-300/[0.075]"
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
  onConfirmTime,
  onFund,
  onCheckIn,
  onPreferenceChange,
  actionState = null,
  preferenceBusy = false,
  compact = false,
  stacked = false,
  serverNow = null,
  viewMode,
  defaultViewMode,
  allowExpand = true,
}: ScheduledMatchCardProps) {
  const { address: connectedWalletAddress, connect: connectKeplr } = useKeplr();
  const { timeClockMode, browserTimeZone } = useLobbyAppearance();
  const projection = projectedMatch(match);
  const scheduledAtValue = projection.scheduledAt ?? null;
  const exactSchedule = isExactSchedule(match);
  const financialStateLabel = financialProjectionLabel(match);
  const projectedDeadline = challengeDeadline(match);
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(() => (serverNow ? new Date(serverNow).getTime() : 0));
  const [internalViewMode, setInternalViewMode] = useState<ScheduledMatchCardViewMode>(() =>
    defaultCardViewMode({ compact, defaultViewMode })
  );
  const activeViewMode = viewMode ?? internalViewMode;
  const canChangeView = allowExpand && !viewMode;
  const resolved = isResolvedState(match.displayState);
  const shouldTickCountdown = Boolean(
    !compact &&
      activeViewMode !== "summary" &&
      !resolved &&
      (match.economy.countdownTargetAt || scheduledAtValue || projectedDeadline.value)
  );
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [showFundingForm, setShowFundingForm] = useState(false);
  const [fundingWorkflow, setFundingWorkflow] = useState<FundingWorkflowState>("idle");
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduledAt, setRescheduledAt] = useState(() => toLocalDateTimeValue(scheduledAtValue));
  const [rescheduleNote, setRescheduleNote] = useState(match.challengeNote ?? "");
  const [wagerAmount, setWagerAmount] = useState(String(match.terms.wagerAmountWolo));
  const [guaranteeAmount, setGuaranteeAmount] = useState(String(match.terms.guaranteeAmountWolo));
  const [fundingTxHash, setFundingTxHash] = useState("");
  const [fundingWalletAddress, setFundingWalletAddress] = useState("");
  const pendingFundingRef = useRef<{
    matchId: number;
    side: "left" | "right";
    fundingTxHash: string;
    walletAddress: string;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
    const mountedAt = Date.now();
    const baseServerMs = serverNow ? new Date(serverNow).getTime() : Date.now();

    setNowMs(baseServerMs);
    if (!shouldTickCountdown) return;

    const interval = window.setInterval(() => {
      setNowMs(baseServerMs + (Date.now() - mountedAt));
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [serverNow, shouldTickCountdown]);

  useEffect(() => {
    setInternalViewMode(defaultCardViewMode({ compact, defaultViewMode }));
  }, [compact, defaultViewMode, match.id]);

  useEffect(() => {
    setShowRescheduleForm(false);
    setShowFundingForm(false);
    setFundingWorkflow("idle");
    setFundingError(null);
    setActionError(null);
    setRescheduledAt(toLocalDateTimeValue(scheduledAtValue));
    setRescheduleNote(match.challengeNote ?? "");
    setWagerAmount(String(match.terms.wagerAmountWolo));
    setGuaranteeAmount(String(match.terms.guaranteeAmountWolo));
    setFundingTxHash("");
    setFundingWalletAddress("");
  }, [
    match.id,
    scheduledAtValue,
    match.challengeNote,
    match.terms.guaranteeAmountWolo,
    match.terms.wagerAmountWolo,
  ]);

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
  const countdownLabel = mounted
    ? formatCountdownLabel(match, nowMs)
    : exactSchedule
      ? "Exact time"
      : "Play anytime";
  const watcherStatus = useMemo(() => buildWatcherStatus(match), [match]);

  const canDecline = Boolean(
    onDecline &&
      viewerIsChallenged &&
      ["issued", "proposed", "pending", "creator_funded"].includes(match.displayState)
  );
  const canAcceptAndFund = Boolean(
    onAccept &&
      viewerIsChallenged &&
      ((match.economy.hasTerms && creatorFunded && ["creator_funded"].includes(match.displayState)) ||
        (!match.economy.hasTerms && ["issued", "proposed", "pending"].includes(match.displayState)))
  );
  const canCancel = Boolean(
    onCancel &&
      viewerIsParticipant &&
      !hasCheckInOnFile &&
      match.displayState !== "live" &&
      !resolved &&
      [
        "issued",
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
        "issued",
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
  const canConfirmTime = Boolean(
    onConfirmTime &&
      viewerIsParticipant &&
      bothFunded &&
      match.proposedMatchAt &&
      match.proposedMatchByUid &&
      match.proposedMatchByUid !== viewerUid &&
      !hasCheckInOnFile &&
      !resolved
  );
  const canFund = Boolean(
    onFund &&
      viewerIsParticipant &&
      match.economy.hasTerms &&
      !viewerAlreadyFunded &&
      !resolved &&
      !["declined", "cancelled", "canceled"].includes(match.displayState) &&
      (!mounted ||
        !(
          projection.fundingExpiresAt ||
          projection.acceptanceExpiresAt ||
          scheduledAtValue
        ) ||
        new Date(
          projection.fundingExpiresAt ||
            projection.acceptanceExpiresAt ||
            scheduledAtValue ||
            0
        ).getTime() > nowMs)
  );
  const canCheckIn = Boolean(
    onCheckIn &&
      viewerIsParticipant &&
      viewerAlreadyFunded &&
      !viewerAlreadyCheckedIn &&
      match.economy.checkInWindowState === "open"
  );

  const spotlightPlayer = viewerIsChallenged ? match.challenger : match.challenged;
  const threadHref = `/challenge/${match.id}`;
  const statsHref =
    (match.displayState === "completed" || match.displayState === "live") && match.linkedSessionKey
      ? `/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}`
      : null;

  const primaryActionLabel = useMemo(() => {
    if (canAcceptAndFund) return `Accept + Fund ${formatWolo(match.terms.totalFundingWolo)}`;
    if (canFund) return fundingWorkflowLabel(fundingWorkflow, match.terms.totalFundingWolo);
    if (canConfirmTime) return "Confirm Proposed Time";
    if (canCheckIn) return "Check In";
    if (statsHref) return match.displayState === "completed" ? "View Result" : "Watch Live";
    if (viewerIsChallenger && ["issued", "proposed", "pending"].includes(match.displayState) && !creatorFunded) {
      return `Fund ${formatWolo(match.terms.totalFundingWolo)} WOLO`;
    }
    return "Open Record";
  }, [
    canAcceptAndFund,
    canCheckIn,
    canConfirmTime,
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
  const summaryStateLabel =
    projection.currentHeadline ||
    (resolved || bothFunded ? match.economy.statusLabel : counterpartFundingSummary);
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

    if (!match.fundingRail.configured || !match.fundingRail.escrowAddress) {
      setFundingWorkflow("failed");
      setFundingError("Challenge escrow is not exposed to the browser.");
      revealAdvanced();
      return;
    }

    try {
      setFundingWorkflow("awaiting_wallet");
      const walletAddress = connectedWalletAddress || (await connectKeplr());

      const side = viewerIsChallenger ? "left" : "right";
      const pending = pendingFundingRef.current;
      setFundingWorkflow("confirming_chain");
      const result =
        pending?.matchId === match.id && pending.side === side
          ? pending
          : await fundChallengeEscrow({
              challengeId: match.id,
              wagerAmountWolo: match.terms.wagerAmountWolo,
              guaranteeAmountWolo: match.terms.guaranteeAmountWolo,
              participantSide: side,
              escrowAddress: match.fundingRail.escrowAddress,
              fallbackWalletAddress: walletAddress,
            });
      pendingFundingRef.current = {
        matchId: match.id,
        side,
        fundingTxHash: result.fundingTxHash,
        walletAddress: result.walletAddress,
      };

      setFundingWorkflow("recording");
      await onFund(match.id, {
        fundingTxHash: result.fundingTxHash,
        fundingWalletAddress: result.walletAddress,
      });

      pendingFundingRef.current = null;
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

    if (!match.fundingRail.configured || !match.fundingRail.escrowAddress) {
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

      const pending = pendingFundingRef.current;
      setFundingWorkflow("confirming_chain");
      const result =
        pending?.matchId === match.id && pending.side === "right"
          ? pending
          : await fundChallengeEscrow({
              challengeId: match.id,
              wagerAmountWolo: match.terms.wagerAmountWolo,
              guaranteeAmountWolo: match.terms.guaranteeAmountWolo,
              participantSide: "right",
              escrowAddress: match.fundingRail.escrowAddress,
              fallbackWalletAddress: walletAddress,
            });
      pendingFundingRef.current = {
        matchId: match.id,
        side: "right",
        fundingTxHash: result.fundingTxHash,
        walletAddress: result.walletAddress,
      };

      setFundingWorkflow("recording");
      await onFund(match.id, {
        fundingTxHash: result.fundingTxHash,
        fundingWalletAddress: result.walletAddress,
      });
      pendingFundingRef.current = null;
      setFundingWorkflow("verified");
    } catch (error) {
      setFundingWorkflow("failed");
      setFundingError(error instanceof Error ? error.message : "Accept + fund failed.");
      revealAdvanced();
    }
  }

  function renderPrimaryAction() {
    const buttonClass =
      "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-yellow-100/36 bg-[linear-gradient(180deg,#fff1a6_0%,#e8bc4f_32%,#a66a18_100%)] px-4 py-2 text-sm font-black text-[#130d04] shadow-[inset_0_1px_0_rgba(255,255,255,0.60),0_0_22px_rgba(234,179,8,0.18)] transition hover:border-yellow-50/65 hover:text-black hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_0_30px_rgba(234,179,8,0.26)] disabled:cursor-not-allowed disabled:opacity-60";

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

    if (canConfirmTime) {
      return (
        <button
          type="button"
          onClick={() => void runAction(() => onConfirmTime?.(match.id))}
          disabled={cardBusy}
          className={buttonClass}
        >
          <CalendarClock className="h-4 w-4" />
          {currentActionKind === "confirm_time" ? "Confirming" : primaryActionLabel}
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
    const exactLocalLabel = formatDateTime(
      scheduledAtValue,
      {
        timeDisplayMode: "local",
        timeClockMode,
        timezoneOverride: browserTimeZone,
      },
      { browserTimeZone, includeZone: true }
    );
    const exactUtcLabel = formatDateTime(
      scheduledAtValue,
      { timeDisplayMode: "utc", timeClockMode, timezoneOverride: null },
      { includeZone: false }
    );
    const deadlineLocalLabel = formatDateTime(
      projectedDeadline.value,
      {
        timeDisplayMode: "local",
        timeClockMode,
        timezoneOverride: browserTimeZone,
      },
      { browserTimeZone, includeZone: true }
    );
    const deadlineUtcLabel = formatDateTime(
      projectedDeadline.value,
      { timeDisplayMode: "utc", timeClockMode, timezoneOverride: null },
      { includeZone: false }
    );
    const hasAuditCounts =
      typeof projection.eventCount === "number" || typeof projection.chainTxCount === "number";

    return (
      <div
        onClick={summaryCanExpand ? expandSummary : undefined}
        className={`relative isolate min-w-0 overflow-hidden rounded-[1.25rem] border p-4 ${accent.shell} ${
          summaryCanExpand ? "cursor-pointer" : ""
        }`}
      >
        <div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-emerald-50/70 to-transparent" />
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${accent.badge}`}>
                {exactSchedule ? <CalendarClock className="h-3 w-3" /> : <Swords className="h-3 w-3" />}
                {exactSchedule ? "Exact time" : "Play anytime"}
              </span>
              <span className="text-[11px] font-semibold text-slate-300">Challenge #{match.id}</span>
            </div>
            <h3 className="mt-2 truncate text-lg font-semibold text-white sm:text-xl">
              {match.challenger.name} <span className="text-amber-100/55">vs</span> {match.challenged.name}
            </h3>
          </div>
          <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-slate-200">
            {summaryStateLabel}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <div className="rounded-xl border border-amber-200/14 bg-amber-300/[0.07] px-3 py-2 text-xs text-slate-300">
            <span className="font-black text-amber-50">{formatWolo(match.terms.totalFundingWolo)} WOLO</span> total lock each
          </div>
          <div className="min-w-0 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs">
            {match.proposedMatchAt ? (
              <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                <span className="font-semibold text-amber-50">
                  Proposed {formatDateTime(
                    match.proposedMatchAt,
                    {
                      timeDisplayMode: "local",
                      timeClockMode,
                      timezoneOverride: browserTimeZone,
                    },
                    { browserTimeZone, includeZone: true }
                  )}
                </span>
                <span className="text-slate-500">
                  UTC {formatDateTime(
                    match.proposedMatchAt,
                    { timeDisplayMode: "utc", timeClockMode, timezoneOverride: null },
                    { includeZone: false }
                  )}
                </span>
                <span className="text-slate-400">
                  {canConfirmTime ? "Your confirmation is needed" : "Awaiting the other player"}
                </span>
              </div>
            ) : exactSchedule && scheduledAtValue ? (
              <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                <span className="font-semibold text-white">{exactLocalLabel}</span>
                <span className="text-slate-500">UTC {exactUtcLabel}</span>
              </div>
            ) : (
              <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                <span className="font-semibold text-white">Play anytime after funding</span>
                {projectedDeadline.value ? (
                  <>
                    <span className="text-slate-400">{projectedDeadline.label} {deadlineLocalLabel}</span>
                    <span className="text-slate-500">UTC {deadlineUtcLabel}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[11px] text-slate-300">
            <span>{viewerFundingSummary}</span>
            {financialStateLabel ? (
              <span className="rounded-full border border-cyan-200/14 bg-cyan-300/[0.07] px-2.5 py-1 text-cyan-50">
                {financialStateLabel}
              </span>
            ) : null}
            {typeof projection.eventCount === "number" ? <span>{projection.eventCount} events</span> : null}
            {typeof projection.chainTxCount === "number" ? <span>{projection.chainTxCount} chain tx</span> : null}
            {hasAuditCounts ? (
              <Link href={`${threadHref}#raw`} className="font-black uppercase tracking-[0.15em] text-amber-100/75 hover:text-amber-50">
                RAW
              </Link>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {renderPrimaryAction()}
            {canDecline ? (
              <button
                type="button"
                onClick={() => void runAction(() => onDecline?.(match.id))}
                disabled={cardBusy}
                className="inline-flex min-h-10 items-center rounded-full border border-rose-300/24 bg-rose-500/[0.08] px-3 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/15 disabled:opacity-60"
              >
                Decline
              </button>
            ) : null}
            {summaryCanExpand ? (
              <button
                type="button"
                title="Details"
                aria-label="Open challenge details"
                onClick={() => setCardViewMode("detail")}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition hover:border-white/25 hover:text-white"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative isolate min-w-0 w-full max-w-full overflow-hidden rounded-[1.35rem] border ${compact ? "p-3" : "p-4 sm:p-5"} ${accent.shell}`}>
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(116deg,transparent_0%,rgba(255,255,255,0.10)_42%,transparent_58%)] opacity-60" />
      <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-emerald-50/80 to-transparent" />
      <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-emerald-200/16 blur-3xl" />
      <div className="pointer-events-none absolute -right-14 bottom-0 h-44 w-44 rounded-full bg-teal-300/12 blur-3xl" />
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={`flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] ${accent.eyebrow}`}>
            <Swords className="h-3.5 w-3.5" />
            {exactSchedule ? "Exact-time challenge" : "Open challenge"}
          </div>
          <div className={`${compact ? "mt-1 text-base" : "mt-2 text-xl"} break-words font-semibold text-white`}>
            {match.challenger.name} vs {match.challenged.name}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
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
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-emerald-950/[0.16] text-slate-300 transition hover:border-white/25 hover:text-white"
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
                    ? "border-emerald-300/30 bg-emerald-300/12 text-emerald-100"
                    : "border-white/10 bg-emerald-950/[0.16] text-slate-300 hover:border-white/25 hover:text-white"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} grid ${stacked ? "grid-cols-1 min-[430px]:grid-cols-3" : compact ? "grid-cols-1 sm:grid-cols-3" : "sm:grid-cols-3"}`}>
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

      {financialStateLabel || typeof projection.eventCount === "number" || typeof projection.chainTxCount === "number" ? (
        <div className={`${compact ? "mt-3" : "mt-4"} flex min-w-0 flex-wrap items-center gap-2 rounded-[0.95rem] border border-cyan-200/12 bg-cyan-300/[0.055] px-3 py-2.5 text-[11px] text-slate-300`}>
          {financialStateLabel ? <span className="font-semibold text-cyan-50">{financialStateLabel}</span> : null}
          {typeof projection.eventCount === "number" ? <span>{projection.eventCount} events</span> : null}
          {typeof projection.chainTxCount === "number" ? <span>{projection.chainTxCount} chain tx</span> : null}
          <Link href={`${threadHref}#raw`} className="ml-auto font-black uppercase tracking-[0.15em] text-amber-100/75 hover:text-amber-50">
            RAW
          </Link>
        </div>
      ) : null}

      {match.titleStakes.length > 0 ? (
        <div className={`${compact ? "mt-3" : "mt-4"} rounded-[1rem] border border-emerald-200/18 bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(6,78,59,0.05))] p-3`}>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-emerald-100/70">
            <Trophy className="h-3.5 w-3.5" />
            Automatic title stakes
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {match.titleStakes.map((titleStake) => (
              <div
                key={titleStake.challengeId}
                className="inline-flex min-w-0 items-center gap-2 rounded-full border border-emerald-100/15 bg-black/20 py-1.5 pl-1.5 pr-3"
              >
                {titleStake.imageUrl ? (
                  <span className="relative h-7 w-9 shrink-0 overflow-hidden rounded-full bg-black/25">
                    <Image
                      src={titleStake.imageUrl}
                      alt=""
                      fill
                      unoptimized
                      sizes="36px"
                      className="object-contain"
                    />
                  </span>
                ) : (
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-300/10 text-emerald-100">
                    <Trophy className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="max-w-52 truncate text-xs font-semibold text-emerald-50">
                  {titleStake.displayName}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] leading-5 text-emerald-100/60">
            Belts move automatically after verified match proof. Artifact records still require their metric proof.
          </div>
        </div>
      ) : null}

      <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} grid ${stacked ? "grid-cols-1 min-[430px]:grid-cols-2" : "sm:grid-cols-2"}`}>
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

      <div className={`${compact ? "mt-3 gap-2" : "mt-4 gap-3"} grid ${stacked ? "grid-cols-2" : "sm:grid-cols-4"}`}>
        <StatusDot
          icon={<Wallet className="h-4 w-4" />}
          label="Wallets"
          value={bothFunded ? "Locked" : "Open"}
          active={bothFunded}
        />
        <StatusDot
          icon={<CalendarClock className="h-4 w-4" />}
          label={exactSchedule ? "Check-in" : "Timing"}
          value={
            !exactSchedule
              ? "Play anytime"
              : match.economy.checkInWindowState === "open"
              ? "Open"
              : match.economy.checkInWindowState === "upcoming"
                ? "Soon"
                : match.economy.checkInWindowState === "closed"
                  ? "Closed"
                  : "Later"
          }
          active={!exactSchedule || match.economy.checkInWindowState === "open" || match.displayState === "ready"}
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

      <div className={`${compact ? "mt-3" : "mt-4"} flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3`}>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-medium ${accent.badge}`}>
              {countdownLabel}
            </span>
            {exactSchedule && scheduledAtValue ? (
              <>
                <span className="text-xs font-semibold text-slate-200">
                  {formatDateTime(
                    scheduledAtValue,
                    {
                      timeDisplayMode: "local",
                      timeClockMode,
                      timezoneOverride: browserTimeZone,
                    },
                    { browserTimeZone, includeZone: true }
                  )}
                </span>
                <span className="text-xs text-slate-500">
                  UTC {formatDateTime(
                    scheduledAtValue,
                    { timeDisplayMode: "utc", timeClockMode, timezoneOverride: null },
                    { includeZone: false }
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold text-slate-200">Play anytime after funding</span>
                {projectedDeadline.value ? (
                  <>
                    <span className="text-xs text-slate-400">
                      {projectedDeadline.label} {formatDateTime(
                        projectedDeadline.value,
                        {
                          timeDisplayMode: "local",
                          timeClockMode,
                          timezoneOverride: browserTimeZone,
                        },
                        { browserTimeZone, includeZone: true }
                      )}
                    </span>
                    <span className="text-xs text-slate-500">
                      UTC {formatDateTime(
                        projectedDeadline.value,
                        { timeDisplayMode: "utc", timeClockMode, timezoneOverride: null },
                        { includeZone: false }
                      )}
                    </span>
                  </>
                ) : null}
              </>
            )}
          </div>
          {actionError || fundingError ? (
            <div className="mt-2 max-w-xl text-xs leading-5 text-emerald-100">
              {actionError || fundingError}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {renderPrimaryAction()}
          {primaryActionLabel !== "Open Record" ? (
            <Link
              href={threadHref}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-emerald-950/[0.16] px-3 py-2 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white"
            >
              <ExternalLink className="h-4 w-4" />
              Record
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
              {showRescheduleForm
                ? "Close Time"
                : bothFunded
                  ? "Propose Time"
                  : exactSchedule
                    ? "Edit Time"
                    : "Set Time"}
            </button>
          ) : null}
          {canCancel ? (
            <button
              type="button"
              onClick={() => void cancelMatch()}
              disabled={cardBusy}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-white/15 bg-emerald-950/[0.16] px-3 py-2 text-sm font-semibold text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
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
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
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
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Shift the lock."
              />
            </label>
          </div>

          {hasFundingOnFile ? (
            <div className="rounded-[0.95rem] border border-emerald-300/18 bg-emerald-300/10 px-3 py-3 text-xs font-medium text-emerald-50">
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
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div className="rounded-full border border-white/10 bg-emerald-950/[0.16] px-3 py-1 text-[11px] text-slate-300">
              Fee 2% · 50/50 split
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
              {exactSchedule ? (
                <>
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
                </>
              ) : (
                <>
                  <AdvancedRow label="Timing" value="Play anytime after funding" />
                  <AdvancedRow label="Accept by" value={<TimeDisplayText value={projection.acceptanceExpiresAt} includeZone={false} />} />
                  <AdvancedRow label="Fund by" value={<TimeDisplayText value={projection.fundingExpiresAt} includeZone={false} />} />
                  <AdvancedRow label="Play by" value={<TimeDisplayText value={projection.playExpiresAt} includeZone={false} />} />
                </>
              )}
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
              Record
            </Link>
            <Link
              href={`${threadHref}#raw`}
              className="rounded-full border border-amber-200/18 bg-amber-300/[0.06] px-4 py-2 text-sm font-semibold text-amber-100/80 transition hover:border-amber-200/30 hover:text-amber-50"
            >
              RAW proof
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
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                    placeholder="Optional"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={cardBusy}
                className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
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
