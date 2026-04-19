"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
import type { ScheduledMatchTile } from "@/lib/challenges";
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
  actionState?: ScheduledMatchCardActionState | null;
  compact?: boolean;
  localTimePrimary?: boolean;
  serverNow?: string | null;
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

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCountdownLabel(match: ScheduledMatchTile, nowMs: number) {
  if (match.economy.countdownTargetAt) {
    const targetMs = new Date(match.economy.countdownTargetAt).getTime();
    const diff = targetMs - nowMs;
    if (match.economy.countdownMode === "opens_in") {
      return `Check-in opens in ${formatRelativeDuration(diff)}`;
    }
    if (match.economy.countdownMode === "closes_in") {
      return `Check-in closes in ${formatRelativeDuration(diff)}`;
    }
  }

  const scheduledMs = new Date(match.scheduledAt).getTime();
  const untilStart = scheduledMs - nowMs;
  const sinceStart = nowMs - scheduledMs;

  switch (match.displayState) {
    case "proposed":
    case "pending":
      return untilStart >= 0
        ? `Starts in ${formatRelativeDuration(untilStart)}`
        : `Window passed ${formatRelativeDuration(untilStart)} ago`;
    case "terms_accepted":
    case "accepted":
    case "creator_funded":
    case "opponent_funded":
    case "funded":
      return untilStart >= 0
        ? `Start in ${formatRelativeDuration(untilStart)}`
        : "Start lock passed";
    case "ready":
    case "live":
      return sinceStart >= 0
        ? `Started ${formatRelativeDuration(sinceStart)} ago`
        : `Start in ${formatRelativeDuration(untilStart)}`;
    case "completed":
      return `Wrapped ${formatRelativeDuration(nowMs - new Date(match.activityAt).getTime())} ago`;
    default:
      return match.economy.statusDetail;
  }
}

function accentClasses(displayState: ScheduledMatchTile["displayState"]) {
  switch (displayState) {
    case "proposed":
    case "pending":
      return {
        shell: "border-amber-300/20 bg-[linear-gradient(180deg,rgba(251,191,36,0.09),rgba(15,23,42,0.42))]",
        badge: "border-amber-300/25 bg-amber-300/12 text-amber-50",
        eyebrow: "text-amber-100/75",
      };
    case "terms_accepted":
    case "accepted":
    case "creator_funded":
    case "opponent_funded":
    case "funded":
    case "checkin_open":
    case "left_checked_in":
    case "right_checked_in":
    case "ready":
      return {
        shell: "border-emerald-300/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(15,23,42,0.42))]",
        badge: "border-emerald-300/25 bg-emerald-300/12 text-emerald-50",
        eyebrow: "text-emerald-100/75",
      };
    case "live":
      return {
        shell: "border-cyan-300/20 bg-[linear-gradient(180deg,rgba(34,211,238,0.08),rgba(15,23,42,0.42))]",
        badge: "border-cyan-300/25 bg-cyan-300/12 text-cyan-50",
        eyebrow: "text-cyan-100/75",
      };
    case "completed":
      return {
        shell: "border-sky-300/18 bg-[linear-gradient(180deg,rgba(125,211,252,0.08),rgba(15,23,42,0.42))]",
        badge: "border-sky-300/25 bg-sky-300/12 text-sky-50",
        eyebrow: "text-sky-100/75",
      };
    case "no_show_left":
    case "no_show_right":
    case "double_no_show":
    case "forfeited":
    case "declined":
      return {
        shell: "border-rose-300/20 bg-[linear-gradient(180deg,rgba(251,113,133,0.08),rgba(15,23,42,0.42))]",
        badge: "border-rose-300/25 bg-rose-300/12 text-rose-50",
        eyebrow: "text-rose-100/75",
      };
    case "cancelled":
    case "canceled":
    case "refunded":
    default:
      return {
        shell: "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(15,23,42,0.42))]",
        badge: "border-white/15 bg-white/8 text-slate-100",
        eyebrow: "text-slate-300/75",
      };
  }
}

function FundingRow({
  label,
  fundedAt,
  isViewer,
}: {
  label: string;
  fundedAt: string | null;
  isViewer: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
        <div className="mt-1 text-sm font-medium text-white">
          {fundedAt ? "Locked" : "Awaiting"}
          {isViewer ? " · you" : ""}
        </div>
      </div>
      <div className="text-[11px] text-slate-400">
        {fundedAt ? <TimeDisplayText value={fundedAt} includeZone={false} className="text-slate-300" /> : "—"}
      </div>
    </div>
  );
}

function MoneyCell({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={`rounded-[1rem] border px-3 py-3 ${
        emphasize
          ? "border-amber-300/18 bg-amber-400/10"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-white sm:text-base">{value}</div>
    </div>
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
  actionState = null,
  compact = false,
  localTimePrimary = false,
  serverNow = null,
}: ScheduledMatchCardProps) {
  const [nowMs, setNowMs] = useState(() =>
    serverNow ? new Date(serverNow).getTime() : Date.now()
  );
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [showFundingForm, setShowFundingForm] = useState(false);
  const [rescheduledAt, setRescheduledAt] = useState(() => toLocalDateTimeValue(match.scheduledAt));
  const [rescheduleNote, setRescheduleNote] = useState(match.challengeNote ?? "");
  const [wagerAmount, setWagerAmount] = useState(String(match.terms.wagerAmountWolo));
  const [guaranteeAmount, setGuaranteeAmount] = useState(String(match.terms.guaranteeAmountWolo));
  const [fundingTxHash, setFundingTxHash] = useState("");
  const [fundingWalletAddress, setFundingWalletAddress] = useState("");

  useEffect(() => {
    const mountedAt = Date.now();
    const baseServerMs = serverNow ? new Date(serverNow).getTime() : Date.now();

    setNowMs(baseServerMs);
    const interval = window.setInterval(() => {
      setNowMs(baseServerMs + (Date.now() - mountedAt));
    }, 1_000);

    return () => window.clearInterval(interval);
  }, [serverNow]);

  useEffect(() => {
    setShowRescheduleForm(false);
    setShowFundingForm(false);
    setRescheduledAt(toLocalDateTimeValue(match.scheduledAt));
    setRescheduleNote(match.challengeNote ?? "");
    setWagerAmount(String(match.terms.wagerAmountWolo));
    setGuaranteeAmount(String(match.terms.guaranteeAmountWolo));
    setFundingTxHash("");
    setFundingWalletAddress("");
  }, [match.id, match.scheduledAt, match.challengeNote, match.terms.guaranteeAmountWolo, match.terms.wagerAmountWolo]);

  const accent = accentClasses(match.displayState);
  const viewerIsChallenger = Boolean(viewerUid && viewerUid === match.challenger.uid);
  const viewerIsChallenged = Boolean(viewerUid && viewerUid === match.challenged.uid);
  const viewerIsParticipant = viewerIsChallenger || viewerIsChallenged;
  const viewerAlreadyFunded = viewerIsChallenger
    ? Boolean(match.economy.creatorFundedAt)
    : viewerIsChallenged
      ? Boolean(match.economy.opponentFundedAt)
      : false;
  const viewerAlreadyCheckedIn = viewerIsChallenger
    ? Boolean(match.economy.leftCheckedInAt)
    : viewerIsChallenged
      ? Boolean(match.economy.rightCheckedInAt)
      : false;
  const hasFundingOnFile = Boolean(match.economy.creatorFundedAt || match.economy.opponentFundedAt);
  const hasCheckInOnFile = Boolean(match.economy.leftCheckedInAt || match.economy.rightCheckedInAt);
  const currentActionKind = actionState?.challengeId === match.id ? actionState.kind : null;
  const cardBusy = Boolean(currentActionKind);
  const countdownLabel = formatCountdownLabel(match, nowMs);

  const canAccept = Boolean(
    onAccept && viewerIsChallenged && ["proposed", "pending"].includes(match.displayState)
  );
  const canDecline = Boolean(
    onDecline && viewerIsChallenged && ["proposed", "pending"].includes(match.displayState)
  );
  const canCancel = Boolean(
    onCancel &&
      viewerIsParticipant &&
      !hasFundingOnFile &&
      !hasCheckInOnFile &&
      match.displayState !== "live" &&
      !["completed", "no_show_left", "no_show_right", "double_no_show", "forfeited", "refunded"].includes(
        match.displayState
      ) &&
      ((viewerIsChallenger && ["proposed", "pending"].includes(match.displayState)) ||
        ["terms_accepted", "accepted", "declined", "cancelled", "canceled"].includes(
          match.displayState
        ))
  );
  const canReschedule = Boolean(
    onReschedule &&
      viewerIsParticipant &&
      !hasFundingOnFile &&
      !hasCheckInOnFile &&
      match.displayState !== "live" &&
      !["completed", "no_show_left", "no_show_right", "double_no_show", "forfeited", "refunded"].includes(
        match.displayState
      )
  );
  const canFund = Boolean(
    onFund &&
      viewerIsParticipant &&
      match.economy.hasTerms &&
      !viewerAlreadyFunded &&
      !["completed", "no_show_left", "no_show_right", "double_no_show", "forfeited", "refunded", "declined", "cancelled", "canceled"].includes(
        match.displayState
      ) &&
      new Date(match.scheduledAt).getTime() > nowMs
  );
  const canCheckIn = Boolean(
    onCheckIn &&
      viewerIsParticipant &&
      viewerAlreadyFunded &&
      !viewerAlreadyCheckedIn &&
      match.economy.checkInWindowState === "open"
  );

  const hasManagementAction =
    canAccept || canDecline || canCancel || canReschedule || canFund || canCheckIn;
  const spotlightPlayer = viewerIsChallenged ? match.challenger : match.challenged;
  const primaryHref =
    (match.displayState === "completed" || match.displayState === "live") && match.linkedSessionKey
      ? `/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}`
      : `/contact-emaren?user=${encodeURIComponent(spotlightPlayer.uid)}`;
  const primaryLabel =
    match.displayState === "completed"
      ? "Open Final Stats"
      : match.displayState === "live" && match.linkedSessionKey
        ? "Watch Live Stats"
        : "Open Challenge Thread";

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onReschedule || !rescheduledAt.trim()) {
      return;
    }

    const nextWagerAmount = Number.parseInt(wagerAmount, 10);
    const nextGuaranteeAmount = Number.parseInt(guaranteeAmount, 10);
    if (!Number.isFinite(nextWagerAmount) || !Number.isFinite(nextGuaranteeAmount)) {
      return;
    }

    await onReschedule(match.id, {
      scheduledAt: new Date(rescheduledAt).toISOString(),
      challengeNote: rescheduleNote,
      wagerAmountWolo: nextWagerAmount,
      guaranteeAmountWolo: nextGuaranteeAmount,
    });
    setShowRescheduleForm(false);
  }

  async function handleFunding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onFund || !fundingTxHash.trim()) {
      return;
    }

    await onFund(match.id, {
      fundingTxHash: fundingTxHash.trim(),
      fundingWalletAddress: fundingWalletAddress.trim(),
    });
    setShowFundingForm(false);
  }

  return (
    <div className={`min-w-0 rounded-[1.55rem] border p-4 sm:p-5 ${accent.shell}`}>
      <div className={`grid gap-4 ${compact ? "" : "xl:grid-cols-[minmax(0,1.2fr)_minmax(14rem,0.8fr)]"}`}>
        <div className="min-w-0">
          <div className={`text-[11px] uppercase tracking-[0.28em] ${accent.eyebrow}`}>
            Scheduled match
          </div>
          <div className="mt-2 break-words text-xl font-semibold text-white">
            {match.challenger.name} vs {match.challenged.name}
          </div>
          {match.challengeNote ? (
            <div className="mt-2 break-words text-sm leading-6 text-slate-300">{match.challengeNote}</div>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr]">
            <div className="flex items-start gap-3 rounded-[1.15rem] border border-white/10 bg-slate-950/30 px-3 py-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-300/15 bg-amber-300/10">
                <Image src={WOLO_LOGO_SRC} alt="WOLO" width={22} height={22} className="h-5 w-5 object-contain" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Match economy</div>
                <div className="mt-1 text-sm font-semibold text-white">Wolo Wager + Match Guarantee</div>
                <div className="mt-1 text-xs text-slate-400">One signed funding action per player.</div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MoneyCell label="Wolo Wager" value={`${formatWolo(match.terms.wagerAmountWolo)} WOLO`} />
              <MoneyCell label="Match Guarantee" value={`${formatWolo(match.terms.guaranteeAmountWolo)} WOLO`} />
              <MoneyCell
                label="Funding Each"
                value={`${formatWolo(match.terms.totalFundingWolo)} WOLO`}
                emphasize
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FundingRow
              label="Creator rail"
              fundedAt={match.economy.creatorFundedAt}
              isViewer={viewerIsChallenger}
            />
            <FundingRow
              label="Opponent rail"
              fundedAt={match.economy.opponentFundedAt}
              isViewer={viewerIsChallenged}
            />
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-white/10 bg-white/[0.04] px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Start time</div>
                <div className="mt-2 text-sm font-medium text-white sm:text-base">
                  {localTimePrimary
                    ? formatDateTime(
                        match.scheduledAt,
                        {
                          timeDisplayMode: "local",
                          timezoneOverride: null,
                        },
                        {
                          includeZone: true,
                        }
                      )
                    : (
                        <TimeDisplayText
                          value={match.scheduledAt}
                          className="text-white"
                          bubbleClassName="max-w-[16rem] text-center"
                        />
                      )}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  UTC{" "}
                  {formatDateTime(
                    match.scheduledAt,
                    {
                      timeDisplayMode: "utc",
                      timezoneOverride: null,
                    },
                    {
                      includeZone: false,
                    }
                  )}
                </div>
              </div>
              <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-300">
                {countdownLabel}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-[1.3rem] border border-white/10 bg-slate-950/30 px-4 py-4">
          <div className={`inline-flex rounded-full border px-3 py-1 text-[11px] ${accent.badge}`}>
            {match.economy.statusLabel}
          </div>
          <div className="mt-3 text-lg font-semibold text-white">{match.economy.statusLabel}</div>
          <div className="mt-1 text-sm leading-6 text-slate-300">{match.economy.statusDetail}</div>

          <div className="mt-4 space-y-2 text-[11px] text-slate-400">
            <div className="flex items-center justify-between gap-3">
              <span>Check-in opens</span>
              <TimeDisplayText value={match.economy.checkInOpensAt} includeZone={false} className="text-slate-300" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Server lock</span>
              <TimeDisplayText value={match.economy.checkInClosesAt} includeZone={false} className="text-slate-300" />
            </div>
            {match.linkedMapName ? (
              <div className="flex items-center justify-between gap-3">
                <span>Map</span>
                <span className="text-right text-slate-300">{match.linkedMapName}</span>
              </div>
            ) : null}
            {match.linkedWinner ? (
              <div className="flex items-center justify-between gap-3">
                <span>Winner</span>
                <span className="text-right text-slate-300">{match.linkedWinner}</span>
              </div>
            ) : null}
          </div>

          {match.economy.resolution.label ? (
            <div className="mt-4 rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {match.economy.resolution.label}
              </div>
              {match.economy.resolution.guarantee ? (
                <div className="mt-2 text-xs leading-5 text-slate-300">
                  {match.economy.resolution.guarantee}
                </div>
              ) : null}
              {match.economy.resolution.wager ? (
                <div className="mt-1 text-xs leading-5 text-slate-400">
                  {match.economy.resolution.wager}
                </div>
              ) : null}
              {match.economy.resolution.treasury ? (
                <div className="mt-1 text-xs leading-5 text-amber-100/80">
                  {match.economy.resolution.treasury}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap gap-2.5 border-t border-white/10 pt-4 ${compact ? "" : "justify-end"}`}>
        {canAccept ? (
          <button
            type="button"
            onClick={() => void onAccept?.(match.id)}
            disabled={cardBusy}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionKind === "accept" ? "Accepting..." : "Accept Terms"}
          </button>
        ) : null}
        {canDecline ? (
          <button
            type="button"
            onClick={() => void onDecline?.(match.id)}
            disabled={cardBusy}
            className="rounded-full border border-rose-300/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionKind === "decline" ? "Declining..." : "Decline"}
          </button>
        ) : null}
        {canFund ? (
          <button
            type="button"
            onClick={() => setShowFundingForm((current) => !current)}
            disabled={cardBusy}
            className="rounded-full border border-amber-300/28 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showFundingForm ? "Close Funding" : "Mark Funded"}
          </button>
        ) : null}
        {canCheckIn ? (
          <button
            type="button"
            onClick={() => void onCheckIn?.(match.id)}
            disabled={cardBusy}
            className="rounded-full bg-emerald-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionKind === "check_in" ? "Checking In..." : "Check In"}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            onClick={() => void onCancel?.(match.id)}
            disabled={cardBusy}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionKind === "cancel" ? "Cancelling..." : "Cancel"}
          </button>
        ) : null}
        {canReschedule ? (
          <button
            type="button"
            onClick={() => setShowRescheduleForm((current) => !current)}
            disabled={cardBusy}
            className="rounded-full border border-sky-300/28 bg-sky-400/10 px-4 py-2 text-sm text-sky-100 transition hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showRescheduleForm ? "Close Terms" : "Edit Terms"}
          </button>
        ) : null}
        <Link
          href={primaryHref}
          className={
            hasManagementAction
              ? "rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              : "rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          }
        >
          {primaryLabel}
        </Link>
        <Link
          href={spotlightPlayer.href}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          View Player
        </Link>
      </div>

      {canFund && showFundingForm ? (
        <form
          onSubmit={handleFunding}
          className="mt-4 space-y-3 rounded-[1.2rem] border border-white/10 bg-slate-950/35 p-4"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Funding tx hash</span>
              <input
                type="text"
                value={fundingTxHash}
                onChange={(event) => setFundingTxHash(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Paste the signed escrow tx hash"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Wallet address</span>
              <input
                type="text"
                value={fundingWalletAddress}
                onChange={(event) => setFundingWalletAddress(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Optional"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              disabled={cardBusy}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {currentActionKind === "fund" ? "Recording..." : `Lock ${formatWolo(match.terms.totalFundingWolo)} WOLO`}
            </button>
            <button
              type="button"
              onClick={() => setShowFundingForm(false)}
              disabled={cardBusy}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Close
            </button>
          </div>
        </form>
      ) : null}

      {canReschedule && showRescheduleForm ? (
        <form
          onSubmit={handleReschedule}
          className="mt-4 space-y-3 rounded-[1.2rem] border border-white/10 bg-slate-950/35 p-4"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr]">
            <label className="block space-y-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">New start</span>
              <input
                type="datetime-local"
                value={rescheduledAt}
                onChange={(event) => setRescheduledAt(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Updated note</span>
              <AutoGrowTextarea
                value={rescheduleNote}
                onChange={(event) =>
                  setRescheduleNote(event.target.value.slice(0, CHALLENGE_NOTE_MAX_CHARS))
                }
                maxRows={compact ? 3 : 4}
                maxLength={CHALLENGE_NOTE_MAX_CHARS}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Shift it back 20 minutes and keep the map."
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Wolo Wager</span>
              <input
                type="number"
                min={1}
                step={1}
                value={wagerAmount}
                onChange={(event) => setWagerAmount(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300">Match Guarantee</span>
              <input
                type="number"
                min={1}
                step={1}
                value={guaranteeAmount}
                onChange={(event) => setGuaranteeAmount(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <MoneyCell
              label="Funding Each"
              value={`${formatWolo((Number.parseInt(wagerAmount, 10) || 0) + (Number.parseInt(guaranteeAmount, 10) || 0))} WOLO`}
              emphasize
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="submit"
              disabled={cardBusy}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {currentActionKind === "reschedule" ? "Sending..." : "Send New Terms"}
            </button>
            <button
              type="button"
              onClick={() => setShowRescheduleForm(false)}
              disabled={cardBusy}
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Close
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
