"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ScheduledMatchTile } from "@/lib/challenges";

type ScheduledMatchCardProps = {
  match: ScheduledMatchTile;
  viewerUid?: string | null;
  onAccept?: (challengeId: number) => void | Promise<void>;
  accepting?: boolean;
  compact?: boolean;
};

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
        time: `Game starting in ${formatRelativeDuration(untilStart)}`,
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
  }
}

export default function ScheduledMatchCard({
  match,
  viewerUid,
  onAccept,
  accepting = false,
  compact = false,
}: ScheduledMatchCardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);

    return () => window.clearInterval(interval);
  }, []);

  const accent = accentClasses(match.displayState);
  const statusLine = formatStatusLine(match, nowMs);
  const canAccept = Boolean(
    onAccept && viewerUid && viewerUid === match.challenged.uid && match.displayState === "pending"
  );
  const spotlightPlayer =
    viewerUid && viewerUid === match.challenged.uid ? match.challenger : match.challenged;
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
        : "Open Inbox";

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${accent.shell}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.3em] ${accent.eyebrow}`}>
            Scheduled match
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {match.challenger.name} vs {match.challenged.name}
          </div>
          <div className="mt-2 text-sm font-medium text-white/90">{statusLine.status}</div>
          <div className="mt-1 text-sm text-slate-200">{statusLine.time}</div>
          {match.challengeNote ? (
            <div className="mt-3 max-w-2xl text-sm text-slate-300">{match.challengeNote}</div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {match.linkedMapName ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {match.linkedMapName}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {new Date(match.scheduledAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {match.linkedWinner ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                Winner {match.linkedWinner}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 text-right">
          <div className={`rounded-full border px-3 py-1 text-xs ${accent.badge}`}>
            {statusLine.status}
          </div>
          {match.durationSeconds && match.durationSeconds > 0 ? (
            <div className="text-xs text-slate-300">
              {Math.max(1, Math.floor(match.durationSeconds / 60))}m
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap gap-3 ${compact ? "" : "pt-1"}`}>
        {canAccept ? (
          <button
            type="button"
            onClick={() => void onAccept?.(match.id)}
            disabled={accepting}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {accepting ? "Accepting..." : "Accept Challenge"}
          </button>
        ) : null}
        <Link
          href={primaryHref}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
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
    </div>
  );
}
