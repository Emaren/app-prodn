"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
import type { ScheduledMatchTile } from "@/lib/challenges";

export type ScheduledMatchCardActionKind =
  | "accept"
  | "decline"
  | "cancel"
  | "reschedule";

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
    }
  ) => void | Promise<void>;
  actionState?: ScheduledMatchCardActionState | null;
  compact?: boolean;
};

function toLocalDateTimeValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
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

function formatStatusLine(match: ScheduledMatchTile, nowMs: number) {
  const scheduledMs = new Date(match.scheduledAt).getTime();
  const startedAgo = nowMs - scheduledMs;
  const untilStart = scheduledMs - nowMs;

  switch (match.displayState) {
    case "pending":
      return {
        status: "Awaiting acceptance",
        time:
          untilStart >= 0
            ? `Starts in ${formatRelativeDuration(untilStart)}`
            : `Window passed ${formatRelativeDuration(untilStart)} ago`,
      };
    case "accepted":
      return {
        status: "Ready",
        time:
          untilStart >= 0
            ? `Game starting in ${formatRelativeDuration(untilStart)}`
            : `Start window open for ${formatRelativeDuration(startedAgo)}`,
      };
    case "live":
      return {
        status: "Now playing",
        time:
          startedAgo >= 0
            ? `Started ${formatRelativeDuration(startedAgo)} ago`
            : `Game starting in ${formatRelativeDuration(untilStart)}`,
      };
    case "completed":
      return {
        status: "Final stored",
        time: `Wrapped ${formatRelativeDuration(nowMs - new Date(match.activityAt).getTime())} ago`,
      };
    case "forfeited":
      return {
        status: "Forfeit",
        time: "Missed start by 1m",
      };
    case "declined":
      return {
        status: "Declined",
        time: `Declined ${formatRelativeDuration(nowMs - new Date(match.activityAt).getTime())} ago`,
      };
    case "cancelled":
      return {
        status: "Cancelled",
        time: `Cancelled ${formatRelativeDuration(nowMs - new Date(match.activityAt).getTime())} ago`,
      };
    default:
      return {
        status: "Scheduled",
        time: `Starts in ${formatRelativeDuration(untilStart)}`,
      };
  }
}

function accentClasses(displayState: ScheduledMatchTile["displayState"]) {
  switch (displayState) {
    case "pending":
      return {
        shell: "border-amber-300/25 bg-amber-400/10",
        badge: "border-amber-300/25 bg-amber-300/12 text-amber-100",
        eyebrow: "text-amber-100/80",
      };
    case "accepted":
      return {
        shell: "border-emerald-300/25 bg-emerald-500/10",
        badge: "border-emerald-300/25 bg-emerald-300/12 text-emerald-50",
        eyebrow: "text-emerald-100/80",
      };
    case "live":
      return {
        shell: "border-cyan-300/25 bg-cyan-400/10",
        badge: "border-cyan-300/25 bg-cyan-300/12 text-cyan-50",
        eyebrow: "text-cyan-100/80",
      };
    case "completed":
      return {
        shell: "border-emerald-300/25 bg-emerald-500/10",
        badge: "border-emerald-300/25 bg-emerald-300/12 text-emerald-50",
        eyebrow: "text-emerald-100/80",
      };
    case "forfeited":
      return {
        shell: "border-rose-300/25 bg-rose-500/10",
        badge: "border-rose-300/25 bg-rose-300/12 text-rose-50",
        eyebrow: "text-rose-100/80",
      };
    case "declined":
      return {
        shell: "border-rose-300/25 bg-rose-500/10",
        badge: "border-rose-300/25 bg-rose-300/12 text-rose-50",
        eyebrow: "text-rose-100/80",
      };
    case "cancelled":
      return {
        shell: "border-white/10 bg-white/5",
        badge: "border-white/15 bg-white/8 text-slate-100",
        eyebrow: "text-slate-300/80",
      };
  }
}

export default function ScheduledMatchCard({
  match,
  viewerUid,
  onAccept,
  onDecline,
  onCancel,
  onReschedule,
  actionState = null,
  compact = false,
}: ScheduledMatchCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [rescheduledAt, setRescheduledAt] = useState(() => toLocalDateTimeValue(match.scheduledAt));
  const [rescheduleNote, setRescheduleNote] = useState(match.challengeNote ?? "");

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setShowRescheduleForm(false);
    setRescheduledAt(toLocalDateTimeValue(match.scheduledAt));
    setRescheduleNote(match.challengeNote ?? "");
  }, [match.id, match.scheduledAt, match.challengeNote]);

  const accent = accentClasses(match.displayState);
  const statusLine = formatStatusLine(match, nowMs);
  const viewerIsChallenger = Boolean(viewerUid && viewerUid === match.challenger.uid);
  const viewerIsChallenged = Boolean(viewerUid && viewerUid === match.challenged.uid);
  const canAccept = Boolean(
    onAccept && viewerIsChallenged && match.displayState === "pending"
  );
  const canDecline = Boolean(
    onDecline && viewerIsChallenged && match.displayState === "pending"
  );
  const canCancel = Boolean(
    onCancel &&
      ((viewerIsChallenger && match.displayState === "pending") ||
        ((viewerIsChallenger || viewerIsChallenged) && match.displayState === "accepted"))
  );
  const canReschedule = Boolean(
    onReschedule &&
      (viewerIsChallenger || viewerIsChallenged) &&
      (
        match.displayState === "pending" ||
        match.displayState === "accepted" ||
        match.displayState === "declined" ||
        match.displayState === "cancelled"
      )
  );
  const spotlightPlayer =
    viewerIsChallenged ? match.challenger : match.challenged;
  const currentActionKind = actionState?.challengeId === match.id ? actionState.kind : null;
  const cardBusy = Boolean(currentActionKind);
  const hasManagementAction = canAccept || canDecline || canCancel || canReschedule;
  const reopenLabel =
    match.displayState === "declined" || match.displayState === "cancelled"
      ? "Challenge Again"
      : "Reschedule";
  const primaryHref =
    match.displayState === "completed" && match.linkedSessionKey
      ? `/game-stats/live/${encodeURIComponent(match.linkedSessionKey)}`
      : match.displayState === "live" && match.linkedSessionKey
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

    await onReschedule(match.id, {
      scheduledAt: new Date(rescheduledAt).toISOString(),
      challengeNote: rescheduleNote,
    });
    setShowRescheduleForm(false);
  }

  return (
    <div className={`rounded-[1.5rem] border p-4 sm:p-5 ${accent.shell}`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(12rem,0.65fr)]">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.3em] ${accent.eyebrow}`}>
            Scheduled match
          </div>
          <div className="mt-2 break-words text-xl font-semibold text-white">
            {match.challenger.name} vs {match.challenged.name}
          </div>
          {match.challengeNote ? (
            <div className="mt-3 max-w-2xl break-words text-sm text-slate-300">
              {match.challengeNote}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {match.linkedMapName ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {match.linkedMapName}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <TimeDisplayText
                value={match.scheduledAt}
                className="text-slate-300"
                bubbleClassName="max-w-[16rem] text-center"
              />
            </span>
            {match.linkedWinner ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Winner {match.linkedWinner}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/25 px-4 py-3 text-left lg:text-right">
          <div className={`inline-flex rounded-full border px-3 py-1 text-xs ${accent.badge}`}>
            {statusLine.status}
          </div>
          <div className="mt-3 text-lg font-semibold text-white/95">{statusLine.status}</div>
          <div className="mt-1 text-sm text-slate-200">{statusLine.time}</div>
          {match.durationSeconds && match.durationSeconds > 0 ? (
            <div className="mt-3 text-xs uppercase tracking-[0.22em] text-slate-400">
              {Math.max(1, Math.floor(match.durationSeconds / 60))}m
            </div>
          ) : null}
        </div>
      </div>

      <div
        className={`mt-4 flex flex-wrap gap-3 border-t border-white/10 pt-4 ${
          compact ? "" : "justify-end"
        }`}
      >
        {canAccept ? (
          <button
            type="button"
            onClick={() => void onAccept?.(match.id)}
            disabled={cardBusy}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {currentActionKind === "accept" ? "Accepting..." : "Accept"}
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
            className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {showRescheduleForm ? "Close" : reopenLabel}
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

      {canReschedule && showRescheduleForm ? (
        <form
          onSubmit={handleReschedule}
          className="mt-4 space-y-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_1fr]">
            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-300">New Start</span>
              <input
                type="datetime-local"
                value={rescheduledAt}
                onChange={(event) => setRescheduledAt(event.target.value)}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-xs uppercase tracking-[0.2em] text-slate-300">Updated Note</span>
              <AutoGrowTextarea
                value={rescheduleNote}
                onChange={(event) =>
                  setRescheduleNote(event.target.value.slice(0, CHALLENGE_NOTE_MAX_CHARS))
                }
                maxRows={compact ? 3 : 4}
                maxLength={CHALLENGE_NOTE_MAX_CHARS}
                disabled={cardBusy}
                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="Push it back 30 minutes and keep the map."
              />
              <div className="text-right text-[11px] uppercase tracking-[0.18em] text-slate-500">
                {rescheduleNote.length}/{CHALLENGE_NOTE_MAX_CHARS}
              </div>
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={cardBusy}
              className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {currentActionKind === "reschedule" ? "Sending..." : "Send New Time"}
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
