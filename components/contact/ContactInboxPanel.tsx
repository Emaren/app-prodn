"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCirclePlus, Mic, Paperclip } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import { DIRECT_MESSAGE_REACTIONS } from "@/lib/contactInboxConfig";
import type {
  ContactInboxMessage,
  ContactInboxPayload,
  ContactInboxSummary,
} from "@/components/contact/types";

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

function buildPrompt(data: ContactInboxPayload | null, counterpartName: string | null) {
  if (!data?.viewer.isAdmin) {
    return counterpartName ? `Message ${counterpartName}...` : "Message Emaren...";
  }

  return counterpartName ? `Reply to ${counterpartName}...` : "Write a message...";
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
          ? "bg-amber-400/12 text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]"
          : "bg-white/[0.045] text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-white/[0.075]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{summary.displayName}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-500">
            {summary.isAdmin ? "Admin thread" : "Direct thread"}
          </div>
        </div>
        {summary.unreadCount > 0 ? (
          <div className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {summary.unreadCount}
          </div>
        ) : null}
      </div>

      <div className="mt-3 text-xs leading-5 text-slate-400">
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
  showMeta,
  showTail,
  onToggleReaction,
  reactingMessageId,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
  viewerUid: string;
  showMeta: boolean;
  showTail: boolean;
  onToggleReaction?: (messageId: number, emoji: string) => void;
  reactingMessageId?: number | null;
}) {
  const isViewer = message.sender.uid === viewerUid;
  const [pickerPinned, setPickerPinned] = useState(false);
  const holdTimerRef = useRef<number | null>(null);

  function clearHoldTimer() {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function beginLongPress(pointerType: string) {
    if (pointerType === "mouse") return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      setPickerPinned(true);
    }, 420);
  }

  const bubbleTone = isViewer
    ? "bg-[linear-gradient(180deg,rgba(251,191,36,0.30),rgba(245,158,11,0.16))] text-amber-50 shadow-[0_14px_28px_rgba(245,158,11,0.10)]"
    : "bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 shadow-[0_14px_28px_rgba(0,0,0,0.18)]";
  const tailTone = isViewer ? "bg-amber-300/30" : "bg-white/10";

  return (
    <div className={`flex ${isViewer ? "justify-end" : "justify-start"}`}>
      <div
        className={`group relative max-w-[88%] sm:max-w-[78%]`}
        onPointerDown={(event) => beginLongPress(event.pointerType)}
        onPointerUp={clearHoldTimer}
        onPointerCancel={clearHoldTimer}
        onPointerLeave={clearHoldTimer}
        onMouseLeave={() => setPickerPinned(false)}
      >
        {showMeta ? (
          <div className={`mb-1 px-2 text-[11px] uppercase tracking-[0.24em] text-slate-500 ${isViewer ? "text-right" : "text-left"}`}>
            {formatBubbleTime(message.createdAt)}
          </div>
        ) : null}

        <div className={`relative rounded-[1.45rem] px-4 py-3 ${bubbleTone}`}>
          {showTail ? (
            <span
              className={`absolute bottom-2 h-3.5 w-3.5 rotate-45 rounded-[0.3rem] ${tailTone} ${
                isViewer ? "right-[-0.22rem]" : "left-[-0.22rem]"
              }`}
            />
          ) : null}

          {message.body ? (
            <div className="relative whitespace-pre-wrap text-sm leading-6">{message.body}</div>
          ) : null}

          {message.attachment ? (
            <div className="mt-3 overflow-hidden rounded-[1.15rem] bg-slate-950/40 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              {message.attachment.kind === "image" ? (
                <Image
                  src={message.attachment.dataUrl}
                  alt={message.attachment.name || "Chat screenshot"}
                  width={1440}
                  height={900}
                  unoptimized
                  className="max-h-72 w-full rounded-[1rem] object-cover"
                />
              ) : (
                <audio src={message.attachment.dataUrl} controls className="w-full" />
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

        {onToggleReaction ? (
          <div
            className={`absolute z-20 flex max-w-[20rem] flex-wrap items-center gap-2 rounded-[1.35rem] border border-white/8 bg-slate-950/96 px-2.5 py-2.5 shadow-[0_20px_42px_rgba(0,0,0,0.46)] transition ${
              isViewer ? "right-0" : "left-0"
            } bottom-[calc(100%+0.75rem)] ${
              pickerPinned
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
            }`}
          >
            {DIRECT_MESSAGE_REACTIONS.map((emoji) => {
              const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
              const isActive = Boolean(existing?.viewerReacted);
              return (
                <button
                  key={`${message.messageId}-${emoji}`}
                  type="button"
                  onClick={() => {
                    onToggleReaction(message.messageId, emoji);
                    setPickerPinned(false);
                  }}
                  aria-pressed={isActive}
                  disabled={reactingMessageId === message.messageId}
                  className={`flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition ${
                    isActive
                      ? "bg-amber-400/15 text-amber-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.24)]"
                      : "bg-white/[0.06] text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] hover:bg-white/[0.12]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>{emoji}</span>
                  {existing?.count ? (
                    <span className="text-[10px] tracking-[0.08em] text-slate-300/90">
                      {existing.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
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
  const showConversationRail = Boolean(
    mode === "page" && data?.viewer.isAdmin && hasConversationChoices
  );
  const showConversationChips = !showConversationRail && hasConversationChoices;
  const unreadCount = data?.totalUnreadCount ?? 0;
  const heading = data?.viewer.isAdmin ? "Direct Threads" : counterpart?.displayName || "Private Thread";
  const typingLabel =
    data?.conversation?.counterpartTyping && counterpart
      ? `${counterpart.displayName} is typing…`
      : null;
  const timelineRows = useMemo(() => buildTimelineRows(data?.messages ?? []), [data?.messages]);
  const latestTimelineKey = timelineRows[timelineRows.length - 1]?.key ?? "empty";

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
      className={`flex min-h-0 flex-col overflow-hidden rounded-[1.6rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] text-white shadow-[0_28px_120px_rgba(0,0,0,0.45)] ${
        mode === "page"
          ? "h-full flex-1 shadow-[0_32px_140px_rgba(0,0,0,0.5)]"
          : "h-full w-full"
      }`}
      style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07), 0 32px 120px rgba(0,0,0,0.45)" }}
    >
      <div className="shrink-0 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/70">
              {data?.viewer.isAdmin ? "Private inbox" : "Direct line"}
            </div>
            <h2 className="mt-2 truncate text-xl font-semibold text-white">{heading}</h2>
            {counterpart ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span>{counterpart.isAdmin ? "Private thread with Emaren" : "Private community thread"}</span>
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
      </div>

      <div
        className={
          showConversationRail
            ? "grid min-h-0 flex-1 lg:grid-cols-[17.5rem_minmax(0,1fr)]"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {showConversationRail ? (
          <aside className="max-h-64 overflow-y-auto overscroll-contain border-b border-white/8 bg-white/[0.02] p-4 lg:max-h-none lg:border-b-0 lg:border-r">
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
            <div className="flex shrink-0 gap-2 overflow-x-auto overscroll-contain border-b border-white/8 px-4 py-3">
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
                      showMeta={row.showMeta}
                      showTail={row.showTail}
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

          <div className="shrink-0 border-t border-white/8 bg-white/[0.015] px-4 py-4">
            {richComposer ? (
              richComposer
            ) : (
              <div className="flex gap-3">
                <textarea
                  value={body}
                  onChange={(event) => onBodyChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!sendPending && body.trim() && !data?.unavailableReason) {
                        onSend();
                      }
                    }
                  }}
                  placeholder={buildPrompt(data, counterpart?.displayName ?? null)}
                  className="min-h-[3.8rem] flex-1 resize-none rounded-[1.25rem] bg-white/[0.055] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] transition focus:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)]"
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
