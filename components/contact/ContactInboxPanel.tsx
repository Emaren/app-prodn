"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { MessageCirclePlus, Mic, Paperclip } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import {
  DIRECT_MESSAGE_MAX_CHARS,
  DIRECT_MESSAGE_REACTIONS,
} from "@/lib/contactInboxConfig";
import { AI_CONCIERGE_NAME, AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import type {
  ContactChallengeActionKind,
  ContactChallengeActionState,
  ContactInboxMessage,
  ContactInboxPayload,
  ContactInboxSummary,
} from "@/components/contact/types";
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";

type ContactInboxPanelProps = {
  data: ContactInboxPayload | null;
  loading: boolean;
  error: string | null;
  body: string;
  sendPending: boolean;
  mode: "popover" | "page";
  onBodyChange: (value: string) => void;
  onSend: () => void;
  onSelectConversation: (targetUid: string) => void;
  onInboxAction: (action: Record<string, unknown>) => void;
  onChallengeAction?: (payload: {
    challengeId: number;
    action: ContactChallengeActionKind;
    scheduledAt?: string;
    challengeNote?: string;
  }) => void | Promise<void>;
  challengeActionState?: ContactChallengeActionState | null;
  onToggleReaction?: (messageId: number, emoji: string) => void;
  reactingMessageId?: number | null;
  richComposer?: ReactNode;
  openPageHref?: string;
};

type TimelineRow =
  | {
      type: "date";
      key: string;
      label: string;
    }
  | {
      type: "message";
      key: string;
      showMeta: boolean;
      showTail: boolean;
      message: ContactInboxMessage;
    };

function formatTimestamp(value: string | null) {
  if (!value) return "No messages yet";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatReceiptTimestamp(value: string, compareTo?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  const comparisonDate = compareTo ? new Date(compareTo) : new Date();
  const sameDay =
    !Number.isNaN(comparisonDate.getTime()) && date.toDateString() === comparisonDate.toDateString();
  if (sameDay) {
    return date.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBubbleTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateDivider(value: string) {
  return new Date(value).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function sameCalendarDay(left: string | null, right: string | null) {
  if (!left || !right) return false;
  const leftDate = new Date(left);
  const rightDate = new Date(right);
  return leftDate.toDateString() === rightDate.toDateString();
}

function isTightTextSequence(previous: ContactInboxMessage | null, current: ContactInboxMessage) {
  if (!previous) return false;
  if (previous.kind !== "text" || current.kind !== "text") return false;
  if (!sameCalendarDay(previous.createdAt, current.createdAt)) return false;
  if (previous.sender.uid !== current.sender.uid) return false;

  const delta = Math.abs(
    new Date(current.createdAt).getTime() - new Date(previous.createdAt).getTime()
  );
  return delta <= 5 * 60 * 1000;
}

function buildPrompt(
  data: ContactInboxPayload | null,
  counterpart: ContactInboxPayload["activeCounterpart"]
) {
  const counterpartName = counterpart?.displayName ?? null;
  if (!data?.viewer.isAdmin) {
    if (counterpart?.threadKind === "ai") {
      return counterpartName
        ? `Ask ${counterpartName} about the site, players, replays, or WOLO...`
        : `Ask ${AI_CONCIERGE_NAME} about the site, players, replays, or WOLO...`;
    }
    return counterpartName ? `Message ${counterpartName}...` : "Message Emaren...";
  }

  return counterpartName ? `Reply to ${counterpartName}...` : "Write a message...";
}

function toLocalDateTimeValue(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatChallengeDuration(diffMs: number) {
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

function challengeStatusLine(challenge: NonNullable<ContactInboxPayload["activeChallenge"]>) {
  const nowMs = Date.now();
  const scheduledMs = new Date(challenge.scheduledAt).getTime();
  const untilStart = scheduledMs - nowMs;

  switch (challenge.displayState) {
    case "pending":
      return {
        status: "Awaiting acceptance",
        detail:
          untilStart >= 0
            ? `Starts in ${formatChallengeDuration(untilStart)}`
            : `Window passed ${formatChallengeDuration(untilStart)} ago`,
      };
    case "accepted":
      return {
        status: "Ready",
        detail: `Game starting in ${formatChallengeDuration(untilStart)}`,
      };
    case "live":
      return {
        status: "Now playing",
        detail: challenge.linkedSessionKey ? "Live session linked." : "Start window is open.",
      };
    case "completed":
      return {
        status: "Final stored",
        detail: challenge.linkedWinner ? `Winner ${challenge.linkedWinner}` : "Replay proof linked.",
      };
    case "forfeited":
      return {
        status: "Forfeit",
        detail: "Missed start by 1m.",
      };
    case "declined":
      return {
        status: "Declined",
        detail: "Send a new time to reopen the duel.",
      };
    case "cancelled":
      return {
        status: "Cancelled",
        detail: "Reopen it with a fresh start time.",
      };
    default:
      return {
        status: "Scheduled",
        detail: new Date(challenge.scheduledAt).toLocaleString(),
      };
  }
}

function challengeTone(displayState: NonNullable<ContactInboxPayload["activeChallenge"]>["displayState"]) {
  switch (displayState) {
    case "pending":
      return {
        shell: "border-amber-300/25 bg-amber-400/10",
        badge: "border-amber-300/25 bg-amber-300/12 text-amber-100",
        eyebrow: "text-amber-100/80",
      };
    case "accepted":
    case "completed":
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
    case "forfeited":
    case "declined":
      return {
        shell: "border-rose-300/25 bg-rose-500/10",
        badge: "border-rose-300/25 bg-rose-300/12 text-rose-50",
        eyebrow: "text-rose-100/80",
      };
    case "cancelled":
    default:
      return {
        shell: "border-white/10 bg-white/[0.04]",
        badge: "border-white/15 bg-white/[0.08] text-slate-100",
        eyebrow: "text-slate-300/80",
      };
  }
}

function ChallengeThreadStrip({
  data,
  mode,
  onChallengeAction,
  challengeActionState,
}: {
  data: ContactInboxPayload;
  mode: "popover" | "page";
  onChallengeAction?: ContactInboxPanelProps["onChallengeAction"];
  challengeActionState?: ContactChallengeActionState | null;
}) {
  const challenge = data.activeChallenge;
  const counterpart = data.activeCounterpart;
  const challengeId = challenge?.id ?? null;
  const challengeScheduledAt = challenge?.scheduledAt ?? null;
  const challengeNoteValue = challenge?.challengeNote ?? "";
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() =>
    challenge ? toLocalDateTimeValue(challenge.scheduledAt) : ""
  );
  const [challengeNote, setChallengeNote] = useState(challengeNoteValue);

  useEffect(() => {
    setShowRescheduleForm(false);
    setScheduledAt(challengeScheduledAt ? toLocalDateTimeValue(challengeScheduledAt) : "");
    setChallengeNote(challengeNoteValue);
  }, [challengeId, challengeScheduledAt, challengeNoteValue]);

  if (!challenge || !counterpart || counterpart.threadKind !== "direct") {
    return null;
  }

  const tone = challengeTone(challenge.displayState);
  const status = challengeStatusLine(challenge);
  const viewerIsChallenger = data.viewer.uid === challenge.challenger.uid;
  const viewerIsChallenged = data.viewer.uid === challenge.challenged.uid;
  const canAccept = viewerIsChallenged && challenge.displayState === "pending";
  const canDecline = viewerIsChallenged && challenge.displayState === "pending";
  const canCancel =
    (viewerIsChallenger && challenge.displayState === "pending") ||
    ((viewerIsChallenger || viewerIsChallenged) && challenge.displayState === "accepted");
  const canReschedule =
    viewerIsChallenger || viewerIsChallenged
      ? ["pending", "accepted", "declined", "cancelled"].includes(challenge.displayState)
      : false;
  const currentAction =
    challengeActionState?.challengeId === challenge.id ? challengeActionState.action : null;
  const isBusy = Boolean(currentAction);
  const reopenLabel =
    challenge.displayState === "declined" || challenge.displayState === "cancelled"
      ? "Challenge Again"
      : "Reschedule";
  const compact = mode === "popover";
  const actionSizing = compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-xs";

  async function handleReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onChallengeAction || !scheduledAt.trim() || challengeId === null) {
      return;
    }

    await onChallengeAction({
      challengeId,
      action: "reschedule",
      scheduledAt: new Date(scheduledAt).toISOString(),
      challengeNote,
    });
    setShowRescheduleForm(false);
  }

  return (
    <div
      className={`rounded-[1.1rem] border ${compact ? "mt-2.5 px-3 py-2.5" : "mt-3 px-3.5 py-3"} ${
        tone.shell
      }`}
    >
      <div
        className={`grid ${compact ? "gap-2 sm:grid-cols-[minmax(0,1fr)_124px]" : "gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]"}`}
      >
        <div className="min-w-0">
          <div className={`${compact ? "text-[9px]" : "text-[10px]"} uppercase tracking-[0.26em] ${tone.eyebrow}`}>
            Challenge runway
          </div>
          <div className={`mt-1 ${compact ? "text-[15px]" : "text-sm"} font-semibold text-white`}>
            {challenge.challenger.name} vs {challenge.challenged.name}
          </div>
          {challenge.challengeNote ? (
            <div className="mt-1 line-clamp-1 text-[11px] text-slate-300">
              {challenge.challengeNote}
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-slate-200">
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5">
              {new Date(challenge.scheduledAt).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            {challenge.linkedMapName ? (
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-0.5">
                {challenge.linkedMapName}
              </span>
            ) : null}
          </div>
        </div>

        <div className={`rounded-[0.95rem] border border-white/10 bg-slate-950/25 ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} text-left sm:text-right`}>
          <div className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] ${tone.badge}`}>
            {status.status}
          </div>
          <div className="mt-1 text-xs font-semibold text-white/95">{status.status}</div>
          <div className="mt-0.5 text-[11px] text-slate-300">{status.detail}</div>
        </div>
      </div>

      <div className={`mt-2.5 flex flex-wrap gap-1.5 ${compact ? "" : "justify-end"}`}>
        {canAccept ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onChallengeAction?.({ challengeId: challenge.id, action: "accept" })}
            className={`rounded-full bg-white font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60 ${actionSizing}`}
          >
            {currentAction === "accept" ? "Accepting..." : "Accept"}
          </button>
        ) : null}
        {canDecline ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onChallengeAction?.({ challengeId: challenge.id, action: "decline" })}
            className={`rounded-full border border-rose-300/30 bg-rose-500/10 font-semibold text-rose-50 transition hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-60 ${actionSizing}`}
          >
            {currentAction === "decline" ? "Declining..." : "Decline"}
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onChallengeAction?.({ challengeId: challenge.id, action: "cancel" })}
            className={`rounded-full border border-white/15 text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${actionSizing}`}
          >
            {currentAction === "cancel" ? "Cancelling..." : "Cancel"}
          </button>
        ) : null}
        {canReschedule ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => setShowRescheduleForm((current) => !current)}
            className={`rounded-full border border-amber-300/30 bg-amber-400/10 text-amber-100 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60 ${actionSizing}`}
          >
            {showRescheduleForm ? "Close" : reopenLabel}
          </button>
        ) : null}
        <Link
          href={
            challenge.displayState === "live" && challenge.linkedSessionKey
              ? `/game-stats/live/${encodeURIComponent(challenge.linkedSessionKey)}`
              : "/challenge"
          }
          className={`rounded-full border border-white/15 text-white/85 transition hover:border-white/30 hover:text-white ${actionSizing}`}
        >
          {challenge.displayState === "live" && challenge.linkedSessionKey
            ? "Watch Live Stats"
            : mode === "popover"
              ? "Open Runway"
              : "Open Challenge Hub"}
        </Link>
      </div>

      {canReschedule && showRescheduleForm ? (
        <form
          onSubmit={handleReschedule}
          className={`mt-2.5 space-y-2.5 rounded-[0.95rem] border border-white/10 bg-slate-950/35 ${compact ? "p-2.5" : "p-3"}`}
        >
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">New Start</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              disabled={isBusy}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-300">Updated Note</span>
            <AutoGrowTextarea
              value={challengeNote}
              onChange={(event) =>
                setChallengeNote(event.target.value.slice(0, CHALLENGE_NOTE_MAX_CHARS))
              }
              maxRows={mode === "popover" ? 3 : 4}
              maxLength={CHALLENGE_NOTE_MAX_CHARS}
              disabled={isBusy}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-300/50 disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Push it back 30 minutes."
            />
            <div className="text-right text-[10px] uppercase tracking-[0.18em] text-slate-500">
              {challengeNote.length}/{CHALLENGE_NOTE_MAX_CHARS}
            </div>
          </label>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="submit"
              disabled={isBusy}
              className={`rounded-full bg-amber-300 font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60 ${actionSizing}`}
            >
              {currentAction === "reschedule" ? "Sending..." : "Send New Time"}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setShowRescheduleForm(false)}
              className={`rounded-full border border-white/15 text-white/85 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 ${actionSizing}`}
            >
              Close
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function SummaryButton({
  summary,
  active,
  onClick,
}: {
  summary: ContactInboxSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[1.35rem] px-3 py-3 text-left transition ${
        active
          ? "bg-[#16233a] text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]"
          : "bg-[#111a2c] text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-[#172339]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{summary.displayName}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {summary.threadKind === "ai"
              ? "AI scribe"
              : summary.isAdmin
                ? "Admin thread"
                : "Direct thread"}
          </div>
        </div>
        {summary.unreadCount > 0 ? (
          <div className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {summary.unreadCount}
          </div>
        ) : null}
      </div>

      <div className="mt-3 overflow-hidden text-xs leading-5 text-slate-400 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">
        {summary.lastMessageSnippet || "No messages yet."}
      </div>
      <div className="mt-2 text-[11px] text-slate-600">{formatTimestamp(summary.lastMessageAt)}</div>
    </button>
  );
}

function statusTone(status: string) {
  if (status === "accepted") {
    return "bg-emerald-500/12 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.2)]";
  }
  if (status === "declined") {
    return "bg-red-500/12 text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.2)]";
  }
  return "bg-amber-400/12 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2)]";
}

function ReceiptLine({
  message,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
}) {
  if (!message.receipt) {
    return null;
  }

  const copy =
    message.receipt.status === "read" && message.receipt.readAt
      ? `Read ${formatReceiptTimestamp(message.receipt.readAt, message.createdAt)}`
      : "Sent";

  return <div className="mt-1 text-right text-[10px] italic text-slate-500/80">{copy}</div>;
}

function HonorActions({
  message,
  viewerIsAdmin,
  onInboxAction,
}: {
  message: ContactInboxMessage;
  viewerIsAdmin: boolean;
  onInboxAction: (action: Record<string, unknown>) => void;
}) {
  if (viewerIsAdmin) {
    return null;
  }

  if (message.kind === "badge" && message.badge) {
    if (message.badge.status === "pending") {
      return (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onInboxAction({ action: "accept_badge", badgeId: message.badge.id, displayOnProfile: true })
            }
            className="rounded-full bg-amber-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            Accept + Show
          </button>
          <button
            type="button"
            onClick={() =>
              onInboxAction({ action: "accept_badge", badgeId: message.badge.id, displayOnProfile: false })
            }
            className="rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/12"
          >
            Accept Private
          </button>
          <button
            type="button"
            onClick={() => onInboxAction({ action: "decline_badge", badgeId: message.badge.id })}
            className="rounded-full bg-red-500/12 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/18"
          >
            Decline
          </button>
        </div>
      );
    }

    if (message.badge.status === "accepted") {
      return (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onInboxAction({
                action: "set_badge_display",
                badgeId: message.badge.id,
                displayOnProfile: !message.badge.displayOnProfile,
              })
            }
            className="rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/12"
          >
            {message.badge.displayOnProfile ? "Hide On Profile" : "Show On Profile"}
          </button>
        </div>
      );
    }
  }

  if (message.kind === "gift" && message.gift) {
    if (message.gift.status === "pending") {
      return (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onInboxAction({ action: "accept_gift", giftId: message.gift.id, displayOnProfile: true })
            }
            className="rounded-full bg-emerald-300 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            Accept + Show
          </button>
          <button
            type="button"
            onClick={() =>
              onInboxAction({ action: "accept_gift", giftId: message.gift.id, displayOnProfile: false })
            }
            className="rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/12"
          >
            Accept Private
          </button>
          <button
            type="button"
            onClick={() => onInboxAction({ action: "decline_gift", giftId: message.gift.id })}
            className="rounded-full bg-red-500/12 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/18"
          >
            Decline
          </button>
        </div>
      );
    }

    if (message.gift.status === "accepted") {
      return (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              onInboxAction({
                action: "set_gift_display",
                giftId: message.gift.id,
                displayOnProfile: !message.gift.displayOnProfile,
              })
            }
            className="rounded-full bg-white/8 px-3 py-1.5 text-xs text-white/85 transition hover:bg-white/12"
          >
            {message.gift.displayOnProfile ? "Hide Gift On Profile" : "Show Gift On Profile"}
          </button>
        </div>
      );
    }
  }

  return null;
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="my-3 flex items-center gap-3 py-1">
      <div className="h-px flex-1 bg-white/7" />
      <div className="rounded-full bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
        {label}
      </div>
      <div className="h-px flex-1 bg-white/7" />
    </div>
  );
}

function TextMessageBubble({
  message,
  viewerUid,
  viewerIsAdmin,
  mode,
  showMeta,
  onInboxAction,
  onToggleReaction,
  reactingMessageId,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
  viewerUid: string;
  viewerIsAdmin: boolean;
  mode: "popover" | "page";
  showMeta: boolean;
  onInboxAction: (action: Record<string, unknown>) => void;
  onToggleReaction?: (messageId: number, emoji: string) => void;
  reactingMessageId?: number | null;
}) {
  const isViewer = message.sender.uid === viewerUid;
  const canManageMessage = viewerIsAdmin || isViewer;
  const maxBubbleWidthClass =
    mode === "page" ? "max-w-[min(96%,56rem)]" : "max-w-[94%] sm:max-w-[82%]";
  const messageBodyViewportClass =
    mode === "page" ? "max-h-[min(46vh,28rem)] overflow-y-auto pr-1" : "max-h-48 overflow-y-auto pr-1";
  const canToggleLobbyShare =
    message.sender.uid === AI_CONCIERGE_UID && !message.attachment && message.body.trim().length > 0;
  const [trayPinnedOpen, setTrayPinnedOpen] = useState(false);
  const [trayHovered, setTrayHovered] = useState(false);
  const [attachmentPreviewFailed, setAttachmentPreviewFailed] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!trayPinnedOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!bubbleRef.current?.contains(event.target as Node)) {
        setTrayPinnedOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [trayPinnedOpen]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearHoverCloseTimer();
    };
  }, []);

  useEffect(() => {
    setAttachmentPreviewFailed(false);
  }, [message.messageId]);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function clearHoverCloseTimer() {
    if (hoverCloseTimerRef.current) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }

  function prefersHover() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches
    );
  }

  function beginLongPress(pointerType: string) {
    if (pointerType === "mouse") return;
    longPressTriggeredRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setTrayPinnedOpen(true);
    }, 360);
  }

  function handleBubbleClick() {
    if (prefersHover()) {
      return;
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setTrayPinnedOpen((current) => !current);
  }

  function handleDesktopHoverStart() {
    if (!prefersHover()) return;
    clearHoverCloseTimer();
    setTrayHovered(true);
  }

  function handleDesktopHoverEnd() {
    if (!prefersHover()) return;
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setTrayHovered(false);
    }, 140);
  }

  const bubbleTone = isViewer
    ? mode === "popover"
      ? "border border-amber-300/14 bg-[linear-gradient(180deg,rgba(138,94,18,0.96),rgba(103,70,14,0.94))] text-amber-50 shadow-[0_18px_34px_rgba(76,54,15,0.34)]"
      : "border border-amber-300/10 bg-[linear-gradient(180deg,rgba(251,191,36,0.28),rgba(245,158,11,0.16))] text-amber-50 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
    : mode === "popover"
      ? "border border-slate-200/10 bg-[linear-gradient(180deg,rgba(22,31,47,0.98),rgba(14,21,34,0.96))] text-slate-100 shadow-[0_18px_34px_rgba(2,6,23,0.42)]"
      : "border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 shadow-[0_14px_28px_rgba(0,0,0,0.18)]";

  function handleReactionPick(emoji: string) {
    if (!onToggleReaction) return;
    onToggleReaction(message.messageId, emoji);
    setTrayPinnedOpen(false);
  }

  function handleLobbyShareToggle() {
    onInboxAction({
      action: "toggle_ai_lobby_share",
      messageId: message.messageId,
    });
    setTrayPinnedOpen(false);
  }

  function handleEditMessage() {
    const nextBody = window.prompt("Edit private message", message.body);
    if (nextBody === null) {
      return;
    }
    onInboxAction({
      action: "edit_message",
      messageId: message.messageId,
      body: nextBody,
    });
    setTrayPinnedOpen(false);
  }

  function handleDeleteMessage() {
    const confirmed = window.confirm("Delete this private message?");
    if (!confirmed) {
      return;
    }
    onInboxAction({
      action: "delete_message",
      messageId: message.messageId,
    });
    setTrayPinnedOpen(false);
  }

  const trayVisible = trayPinnedOpen || trayHovered;
  const hasTray = Boolean(onToggleReaction || canToggleLobbyShare || canManageMessage);

  return (
    <div className={`flex ${isViewer ? "justify-end" : "justify-start"}`}>
      <div
        ref={bubbleRef}
        className={`group relative ${maxBubbleWidthClass}`}
        onPointerDown={(event) => beginLongPress(event.pointerType)}
        onPointerUp={clearHoldTimer}
        onPointerCancel={clearHoldTimer}
        onPointerLeave={clearHoldTimer}
        onMouseEnter={handleDesktopHoverStart}
        onMouseLeave={handleDesktopHoverEnd}
      >
        {showMeta ? (
          <div className={`mb-1 px-2 text-[11px] uppercase tracking-[0.24em] text-slate-500 ${isViewer ? "text-right" : "text-left"}`}>
            {formatBubbleTime(message.createdAt)}
          </div>
        ) : null}

        <div className="relative">
          <div
            className={`relative rounded-[1.45rem] px-4 py-3 ${bubbleTone}`}
            onClick={handleBubbleClick}
          >
            {message.body ? (
              <div
                className={`relative whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere] ${messageBodyViewportClass}`}
              >
                {message.body}
              </div>
            ) : null}

            {message.attachment ? (
              <div className="mt-3 overflow-hidden rounded-[1.15rem] bg-slate-950/40 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                {message.attachment.kind === "image" ? (
                  attachmentPreviewFailed ? (
                    <a
                      href={message.attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-h-44 items-center justify-center rounded-[1rem] border border-white/10 bg-[#0b1322] px-4 py-6 text-center text-sm text-slate-200 transition hover:border-white/18 hover:text-white"
                    >
                      View screenshot
                    </a>
                  ) : (
                    <a href={message.attachment.url} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={message.attachment.url}
                        alt={message.attachment.name || "Chat screenshot"}
                        loading="lazy"
                        decoding="async"
                        onError={() => setAttachmentPreviewFailed(true)}
                        className="max-h-72 w-full rounded-[1rem] bg-[#08111d] object-contain"
                      />
                    </a>
                  )
                ) : (
                  <audio src={message.attachment.url} controls className="w-full" />
                )}
                <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-slate-300/75">
                  {message.attachment.kind === "image" ? (
                    <Paperclip className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  {message.attachment.kind === "image" ? "Attachment" : "Voice note"}
                  {message.attachment.durationSeconds ? ` · ${message.attachment.durationSeconds}s` : ""}
                </div>
              </div>
            ) : null}
          </div>

          {hasTray ? (
            <div
              className={`absolute z-30 ${isViewer ? "right-3" : "left-3"} top-full mt-2 transition-all duration-150 ${
                trayVisible
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1 opacity-0"
              }`}
              onMouseEnter={handleDesktopHoverStart}
              onMouseLeave={handleDesktopHoverEnd}
            >
              <div className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-[#091321] px-2.5 py-2 shadow-[0_22px_48px_rgba(2,6,23,0.6)]">
                {canToggleLobbyShare ? (
                  <button
                    type="button"
                    onClick={handleLobbyShareToggle}
                    className={`inline-flex h-10 items-center justify-center rounded-full border px-3 text-[11px] font-medium uppercase tracking-[0.16em] transition ${
                      message.sharedLobbyMessageId
                        ? "border-cyan-300/22 bg-cyan-400/10 text-cyan-50 hover:border-cyan-200/30 hover:bg-cyan-400/16"
                        : "border-white/10 bg-white/[0.045] text-slate-200 hover:border-white/18 hover:bg-white/[0.1] hover:text-white"
                    }`}
                  >
                    {message.sharedLobbyMessageId ? "Make Private" : "Make Public"}
                  </button>
                ) : null}

                {DIRECT_MESSAGE_REACTIONS.map((emoji) => {
                  const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
                  const isActive = Boolean(existing?.viewerReacted);
                  const isTextReaction = emoji === "GG";
                  return (
                    <button
                      key={`${message.messageId}-${emoji}`}
                      type="button"
                      onClick={() => handleReactionPick(emoji)}
                      aria-pressed={isActive}
                      disabled={reactingMessageId === message.messageId}
                      className={`flex h-10 items-center justify-center rounded-full border px-3 transition ${
                        isTextReaction ? "min-w-[3.25rem] text-[13px] font-semibold" : "min-w-10 text-base"
                      } ${
                        isActive
                          ? "border-amber-300/30 bg-amber-400/16 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]"
                          : "border-white/10 bg-white/[0.045] text-slate-200 hover:border-white/18 hover:bg-white/[0.1] hover:text-white"
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <span>{emoji}</span>
                    </button>
                  );
                })}

                {canManageMessage ? (
                  <button
                    type="button"
                    onClick={handleEditMessage}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-200 transition hover:border-white/18 hover:bg-white/[0.1] hover:text-white"
                  >
                    Edit
                  </button>
                ) : null}

                {canManageMessage ? (
                  <button
                    type="button"
                    onClick={handleDeleteMessage}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-rose-300/22 bg-rose-500/10 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-50 transition hover:border-rose-200/30 hover:bg-rose-500/16"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {message.reactions.length > 0 ? (
          <div
            className={`mt-3 flex flex-wrap gap-2 px-1 ${isViewer ? "justify-end" : "justify-start"}`}
          >
            {message.reactions.map((reaction) => (
              <button
                key={`${message.messageId}-${reaction.emoji}-summary`}
                type="button"
                onClick={() => onToggleReaction?.(message.messageId, reaction.emoji)}
                className={`inline-flex min-w-[3rem] items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                  reaction.viewerReacted
                    ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
                    : "border-white/10 bg-[#0c1524] text-slate-300 hover:border-white/18 hover:text-white"
                }`}
              >
                <span>{reaction.emoji}</span>
                <span>{reaction.count}</span>
              </button>
            ))}
          </div>
        ) : null}

        <ReceiptLine message={message} />
      </div>
    </div>
  );
}

function HonorEventCard({
  message,
  viewerUid,
  viewerIsAdmin,
  onInboxAction,
}: {
  message: Exclude<ContactInboxMessage, { kind: "text" }>;
  viewerUid: string;
  viewerIsAdmin: boolean;
  onInboxAction: (action: Record<string, unknown>) => void;
}) {
  const isViewer = message.sender.uid === viewerUid;
  const honorTitle =
    message.kind === "badge" && message.badge
      ? `${message.badge.label} badge`
      : message.kind === "gift" && message.gift
        ? `${message.gift.amount ? `${message.gift.amount} ` : ""}${message.gift.kind}`
        : "Inbox event";
  const honorStatus =
    message.kind === "badge" && message.badge
      ? message.badge.status
      : message.kind === "gift" && message.gift
        ? message.gift.status
        : "pending";
  const displayOnProfile =
    message.kind === "badge" && message.badge
      ? message.badge.displayOnProfile
      : message.kind === "gift" && message.gift
        ? message.gift.displayOnProfile
        : false;
  const note =
    message.kind === "badge" && message.badge
      ? message.badge.note
      : message.kind === "gift" && message.gift
        ? message.gift.note
        : null;

  return (
    <div className={`flex ${isViewer ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[88%] rounded-[1.4rem] bg-sky-500/[0.10] px-4 py-4 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.18)] sm:max-w-[78%]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/80">
            {formatTimestamp(message.createdAt)}
          </div>
          <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(honorStatus)}`}>
            {honorStatus}
          </span>
          {displayOnProfile ? (
            <span className="rounded-full bg-sky-400/12 px-2 py-0.5 text-[11px] text-sky-100 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.22)]">
              public
            </span>
          ) : null}
        </div>

        <div className="mt-3 text-base font-semibold text-white">{honorTitle}</div>
        <div className="mt-2 text-sm leading-6 text-slate-200">
          {note || "A new community item is waiting in your direct line."}
        </div>

        <HonorActions message={message} viewerIsAdmin={viewerIsAdmin} onInboxAction={onInboxAction} />
      </div>
    </div>
  );
}

function buildTimelineRows(messages: ContactInboxMessage[]) {
  const rows: TimelineRow[] = [];

  messages.forEach((message, index) => {
    const previous = index > 0 ? messages[index - 1] : null;
    const next = index < messages.length - 1 ? messages[index + 1] : null;
    const dateChanged = !sameCalendarDay(previous?.createdAt ?? null, message.createdAt);

    if (dateChanged) {
      rows.push({
        type: "date",
        key: `date-${message.id}`,
        label: formatDateDivider(message.createdAt),
      });
    }

    rows.push({
      type: "message",
      key: message.id,
      message,
      showMeta: !isTightTextSequence(previous, message),
      showTail: next ? !isTightTextSequence(message, next) : true,
    });
  });

  return rows;
}

export default function ContactInboxPanel({
  data,
  loading,
  error,
  body,
  sendPending,
  mode,
  onBodyChange,
  onSend,
  onSelectConversation,
  onInboxAction,
  onChallengeAction,
  challengeActionState,
  onToggleReaction,
  reactingMessageId,
  richComposer,
  openPageHref,
}: ContactInboxPanelProps) {
  const counterpart = data?.activeCounterpart ?? null;
  const activeTargetUid = data?.activeTargetUid ?? null;
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineBottomRef = useRef<HTMLDivElement | null>(null);
  const hasConversationChoices = (data?.summaries.length ?? 0) > 1;
  const showConversationRail = Boolean(mode === "page" && hasConversationChoices);
  const showConversationChips = !showConversationRail && hasConversationChoices;
  const unreadCount = data?.totalUnreadCount ?? 0;
  const heading = counterpart?.displayName || (data?.viewer.isAdmin ? "Private inbox" : "Private Thread");
  const typingLabel =
    data?.conversation?.counterpartTyping && counterpart
      ? `${counterpart.displayName} is typing…`
      : null;
  const timelineRows = useMemo(() => buildTimelineRows(data?.messages ?? []), [data?.messages]);
  const latestTimelineKey = timelineRows[timelineRows.length - 1]?.key ?? "empty";
  const shellClassName =
    mode === "page"
      ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]"
      : "bg-[linear-gradient(180deg,rgba(7,12,22,1),rgba(4,8,16,1))]";
  const chromeClassName =
    mode === "page"
      ? "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]"
      : "border-slate-200/12 bg-[#101a2c]";
  const railClassName = mode === "page" ? "bg-white/[0.02]" : "bg-[#0b1423]";
  const composerClassName = mode === "page" ? "bg-white/[0.015]" : "bg-[#0d1625]";
  const plainComposerInputClassName =
    mode === "page"
      ? "bg-white/[0.055] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
      : "bg-[#0a1220] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]";

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!timelineRows.length) return;

    const viewport = timelineViewportRef.current;
    if (!viewport) return;

    let secondFrame = 0;
    const scrollToLatest = () => {
      timelineBottomRef.current?.scrollIntoView({ block: "end" });
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "auto",
      });
    };

    const timeout = window.setTimeout(() => {
      scrollToLatest();
    }, 140);

    const frame = window.requestAnimationFrame(() => {
      scrollToLatest();
      secondFrame = window.requestAnimationFrame(() => {
        scrollToLatest();
      });
    });

    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeTargetUid, latestTimelineKey, loading, timelineRows.length]);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-[1.6rem] text-white shadow-[0_28px_120px_rgba(0,0,0,0.45)] ${shellClassName} ${
        mode === "page"
          ? "h-full max-h-full flex-1 shadow-[0_32px_140px_rgba(0,0,0,0.5)]"
          : "h-full w-full shadow-[0_34px_120px_rgba(2,6,23,0.82)]"
      }`}
      style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07), 0 32px 120px rgba(0,0,0,0.45)" }}
    >
      <div className={`shrink-0 border-b px-4 py-3 ${chromeClassName}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/70">
              {counterpart?.threadKind === "ai"
                ? "AI scribe"
                : data?.viewer.isAdmin
                  ? "Private inbox"
                  : "Direct line"}
            </div>
            <h2 className="mt-2 truncate text-xl font-semibold text-white">{heading}</h2>
            {counterpart ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>
                  {counterpart.threadKind === "ai"
                    ? "Private AI scribe thread with site context"
                    : counterpart.isAdmin
                      ? "Private thread with Emaren"
                      : "Private community thread"}
                </span>
                {counterpart.giftedWolo > 0 ? <span>· {counterpart.giftedWolo} WOLO gifted</span> : null}
              </div>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <div className="rounded-full bg-red-500/90 px-3 py-1 text-xs text-white">{unreadCount} unread</div>
          ) : null}
        </div>

        {counterpart?.badges.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {counterpart.badges.map((badge) => (
              <CommunityBadgePill key={badge.id} label={badge.label} />
            ))}
          </div>
        ) : null}

        {data ? (
          <ChallengeThreadStrip
            data={data}
            mode={mode}
            onChallengeAction={onChallengeAction}
            challengeActionState={challengeActionState}
          />
        ) : null}
      </div>

      <div
        className={
          showConversationRail
            ? "grid min-h-0 flex-1 lg:grid-cols-[15rem_minmax(0,1fr)]"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {showConversationRail ? (
          <aside className={`max-h-64 overflow-y-auto overscroll-contain border-b p-4 lg:max-h-none lg:border-b-0 lg:border-r ${chromeClassName} ${railClassName}`}>
            <div className="space-y-3">
              {data?.summaries.map((summary) => (
                <SummaryButton
                  key={summary.targetUid}
                  summary={summary}
                  active={summary.targetUid === activeTargetUid}
                  onClick={() => onSelectConversation(summary.targetUid)}
                />
              ))}
            </div>
          </aside>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {showConversationChips ? (
            <div className={`flex shrink-0 gap-2 overflow-x-auto overscroll-contain border-b px-4 py-3 ${chromeClassName}`}>
              {data?.summaries.map((summary) => (
                <button
                  key={summary.targetUid}
                  type="button"
                  onClick={() => onSelectConversation(summary.targetUid)}
                  className={`rounded-full px-3 py-1.5 text-xs transition ${
                    summary.targetUid === activeTargetUid
                      ? "bg-amber-400/12 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]"
                      : "bg-white/[0.05] text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] hover:bg-white/[0.08]"
                  }`}
                >
                  {summary.displayName}
                  {summary.unreadCount > 0 ? ` (${summary.unreadCount})` : ""}
                </button>
              ))}
            </div>
          ) : null}

          <div
            ref={timelineViewportRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
          >
            {typingLabel ? (
              <div className="mb-3 flex justify-center">
                <div className="rounded-full bg-white/[0.05] px-3 py-2 text-xs text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                  {typingLabel}
                </div>
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-[1.35rem] bg-white/[0.045] px-4 py-5 text-sm text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                Loading the private line...
              </div>
            ) : error ? (
              <div className="rounded-[1.35rem] bg-red-500/10 px-4 py-5 text-sm text-red-100 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.24)]">
                {error}
              </div>
            ) : data?.unavailableReason ? (
              <div className="rounded-[1.35rem] bg-amber-400/10 px-4 py-5 text-sm text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2)]">
                {data.unavailableReason}
              </div>
            ) : timelineRows.length === 0 ? (
              <div className="rounded-[1.35rem] bg-white/[0.045] px-4 py-5 text-sm text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                {data?.viewer.isAdmin ? "No messages in this thread yet." : "No messages yet. Say hello."}
              </div>
            ) : (
              <div className="space-y-3">
                {timelineRows.map((row) =>
                  row.type === "date" ? (
                    <DateDivider key={row.key} label={row.label} />
                  ) : row.message.kind === "text" ? (
                    <TextMessageBubble
                      key={row.key}
                      message={row.message}
                      viewerUid={data?.viewer.uid || ""}
                      viewerIsAdmin={Boolean(data?.viewer.isAdmin)}
                      mode={mode}
                      showMeta={row.showMeta}
                      onInboxAction={onInboxAction}
                      onToggleReaction={onToggleReaction}
                      reactingMessageId={reactingMessageId}
                    />
                  ) : (
                    <HonorEventCard
                      key={row.key}
                      message={row.message}
                      viewerUid={data?.viewer.uid || ""}
                      viewerIsAdmin={Boolean(data?.viewer.isAdmin)}
                      onInboxAction={onInboxAction}
                    />
                  )
                )}
                <div ref={timelineBottomRef} className="h-px w-full" />
              </div>
            )}
          </div>

          <div className={`shrink-0 border-t px-4 py-4 ${chromeClassName} ${composerClassName}`}>
            {richComposer ? (
              richComposer
            ) : (
              <div className="flex gap-3">
                <AutoGrowTextarea
                  value={body}
                  maxRows={4}
                  maxLength={DIRECT_MESSAGE_MAX_CHARS}
                  onChange={(event) =>
                    onBodyChange(event.target.value.slice(0, DIRECT_MESSAGE_MAX_CHARS))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!sendPending && body.trim() && !data?.unavailableReason) {
                        onSend();
                      }
                    }
                  }}
                  placeholder={buildPrompt(data, counterpart)}
                  className={`flex-1 rounded-[1.25rem] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 transition focus:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)] ${plainComposerInputClassName}`}
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={sendPending || !body.trim() || Boolean(data?.unavailableReason)}
                  className="self-end rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sendPending ? "Sending..." : "Send"}
                </button>
              </div>
            )}

            {!richComposer ? (
              <div className="mt-2 text-right text-[11px] uppercase tracking-[0.18em] text-slate-600">
                {body.length}/{DIRECT_MESSAGE_MAX_CHARS}
              </div>
            ) : null}

            {openPageHref ? (
              <div className="mt-3 flex justify-end">
                <Link
                  href={openPageHref}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-slate-500 transition hover:text-white"
                >
                  <MessageCirclePlus className="h-3.5 w-3.5" />
                  Open full page
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
