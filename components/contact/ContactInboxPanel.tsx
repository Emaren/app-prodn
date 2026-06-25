"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { MessageCirclePlus, Mic, Paperclip } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import ScheduledMatchCard from "@/components/challenge/ScheduledMatchCard";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import {
  DIRECT_MESSAGE_MAX_CHARS,
  DIRECT_MESSAGE_REACTIONS,
} from "@/lib/contactInboxConfig";
import { AI_CONCIERGE_NAME, AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import { summarizeChallengeInboxMessage } from "@/lib/challengeInboxMessages";
import type {
  ContactChallengeActionKind,
  ContactChallengeActionState,
  ContactInboxMessage,
  ContactInboxPayload,
  ContactInboxSummary,
} from "@/components/contact/types";

const TYPING_HUD_MODE_STORAGE_KEY = "aoe2war:typing-hud-mode";

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
    wagerAmountWolo?: number;
    guaranteeAmountWolo?: number;
    fundingTxHash?: string;
    fundingWalletAddress?: string;
  }) => void | Promise<void>;
  challengeActionState?: ContactChallengeActionState | null;
  onToggleReaction?: (messageId: number, emoji: string) => void;
  reactingMessageId?: number | null;
  richComposer?: ReactNode;
  openPageHref?: string;
  onOpenFullPage?: () => void;
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

function challengeNoticeTone(
  summary: ReturnType<typeof summarizeChallengeInboxMessage>
) {
  if (!summary) {
    return null;
  }

  switch (summary.state) {
    case "accepted":
    case "terms_accepted":
    case "ready":
      return {
        summary,
        shell:
          "border-emerald-300/18 bg-emerald-400/10 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(74,222,128,0.08)]",
      };
    case "funding":
    case "checkin":
    case "scheduled":
    case "rescheduled":
    case "result_ready":
      return {
        summary,
        shell:
          "border-amber-300/18 bg-amber-400/10 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]",
      };
    case "no_show":
    case "declined":
    case "cancelled":
      return {
        summary,
        shell:
          "border-rose-300/18 bg-rose-500/10 text-rose-50 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.08)]",
      };
  }
}

function ChallengeSystemMessageLine({
  message,
  compactNotice,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
  compactNotice: NonNullable<ReturnType<typeof challengeNoticeTone>>;
}) {
  const summary = compactNotice.summary;
  const parts = [
    summary.compactHeadline,
    summary.matchup,
    summary.fundingLabel,
    summary.statusLabel,
    summary.note ? "note attached" : null,
  ].filter(Boolean);

  return (
    <div className="flex justify-center">
      <div
        title={message.body}
        className={`max-w-full rounded-full border px-3 py-1.5 text-[11px] font-medium ${compactNotice.shell}`}
      >
        <div className="truncate whitespace-nowrap">
          {parts.slice(0, 2).join(" · ")}
          {summary.scheduledAtIso ? (
            <>
              {" · "}
              <TimeDisplayText
                value={summary.scheduledAtIso}
                includeZone={false}
                className="text-inherit"
                bubbleClassName="w-max max-w-[18rem] text-center"
              />
            </>
          ) : summary.scheduledLabel ? (
            ` · ${summary.scheduledLabel}`
          ) : null}
          {parts.length > 2 ? ` · ${parts.slice(2).join(" · ")}` : ""}
        </div>
      </div>
    </div>
  );
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

  if (!challenge || !counterpart || counterpart.threadKind !== "direct") {
    return null;
  }

  return (
    <div className="mt-3">
      <ScheduledMatchCard
        match={challenge}
        viewerUid={data.viewer.uid}
        compact={mode === "popover"}
        defaultViewMode="summary"
        allowExpand
        onAccept={(challengeId) => onChallengeAction?.({ challengeId, action: "accept" })}
        onDecline={(challengeId) => onChallengeAction?.({ challengeId, action: "decline" })}
        onCancel={(challengeId) => onChallengeAction?.({ challengeId, action: "cancel" })}
        onReschedule={(challengeId, payload) =>
          onChallengeAction?.({
            challengeId,
            action: "reschedule",
            scheduledAt: payload.scheduledAt,
            challengeNote: payload.challengeNote,
            wagerAmountWolo: payload.wagerAmountWolo,
            guaranteeAmountWolo: payload.guaranteeAmountWolo,
          })
        }
        onFund={(challengeId, payload) =>
          onChallengeAction?.({
            challengeId,
            action: "fund",
            fundingTxHash: payload.fundingTxHash,
            fundingWalletAddress: payload.fundingWalletAddress,
          })
        }
        onCheckIn={(challengeId) => onChallengeAction?.({ challengeId, action: "check_in" })}
        actionState={
          challengeActionState
            ? {
                challengeId: challengeActionState.challengeId,
                kind: challengeActionState.action,
              }
            : null
        }
      />
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
  const compactChallengeNotice = message.body ? challengeNoticeTone(summarizeChallengeInboxMessage(message.body)) : null;
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

  if (compactChallengeNotice) {
    return <ChallengeSystemMessageLine message={message} compactNotice={compactChallengeNotice} />;
  }

  const trayVisible = trayPinnedOpen || trayHovered;
  const hasTray = Boolean(onToggleReaction || canToggleLobbyShare || canManageMessage);

  return (
    <div className={`flex ${isViewer ? "justify-end" : "justify-start"}`}>
      <div
        ref={bubbleRef}
        className={`group relative min-w-0 max-w-full ${maxBubbleWidthClass}`}
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
            className={`relative rounded-[1.25rem] px-3 py-2.5 sm:rounded-[1.45rem] sm:px-4 sm:py-3 ${bubbleTone}`}
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
              className={`absolute z-30 max-w-[calc(100vw-2rem)] ${isViewer ? "right-0 sm:right-3" : "left-0 sm:left-3"} top-full mt-2 transition-all duration-150 ${
                trayVisible
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-1 opacity-0"
              }`}
              onMouseEnter={handleDesktopHoverStart}
              onMouseLeave={handleDesktopHoverEnd}
            >
              <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-[1.15rem] border border-white/10 bg-[#091321] px-2.5 py-2 shadow-[0_22px_48px_rgba(2,6,23,0.6)] sm:gap-2 sm:rounded-full">
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
                      className={`inline-flex h-7 items-center justify-center rounded-full border px-2 transition duration-150 ${
                        isTextReaction ? "min-w-[2.3rem] text-[10px] font-semibold tracking-[0.04em]" : "min-w-7 text-[13px]"
                      } ${
                        isActive
                          ? "border-amber-200/35 bg-amber-300/18 text-amber-50 shadow-[0_0_16px_rgba(251,191,36,0.12),inset_0_0_0_1px_rgba(251,191,36,0.12)]"
                          : "border-white/9 bg-white/[0.055] text-slate-200 hover:border-amber-200/22 hover:bg-white/[0.09] hover:text-white"
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
                    className="inline-flex h-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:border-white/18 hover:bg-white/[0.09] hover:text-white"
                  >
                    Edit
                  </button>
                ) : null}

                {canManageMessage ? (
                  <button
                    type="button"
                    onClick={handleDeleteMessage}
                    className="inline-flex h-7 items-center justify-center rounded-full border border-rose-300/20 bg-rose-500/8 px-2 text-[9px] font-semibold uppercase tracking-[0.16em] text-rose-100 transition hover:border-rose-200/30 hover:bg-rose-500/14"
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
            className={`mt-2 flex flex-wrap gap-1.5 px-1 ${isViewer ? "justify-end" : "justify-start"}`}
          >
            {message.reactions.map((reaction) => (
              <button
                key={`${message.messageId}-${reaction.emoji}-summary`}
                type="button"
                onClick={() => onToggleReaction?.(message.messageId, reaction.emoji)}
                className={`inline-flex min-w-[2.65rem] items-center justify-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none transition duration-150 ${
                  reaction.viewerReacted
                    ? "border-amber-200/32 bg-amber-300/15 text-amber-50 shadow-[0_0_14px_rgba(251,191,36,0.10)]"
                    : "border-white/10 bg-white/[0.045] text-slate-300 hover:border-white/18 hover:bg-white/[0.075] hover:text-white"
                }`}
                title={reaction.viewerReacted ? "Remove your reaction" : "React"}
              >
                <span className="text-[12px] leading-none">{reaction.emoji}</span>
                <span className="text-[9px] leading-none text-current/75">{reaction.count}</span>
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
  onOpenFullPage,
}: ContactInboxPanelProps) {
  const counterpart = data?.activeCounterpart ?? null;
  const activeTargetUid = data?.activeTargetUid ?? null;
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineBottomRef = useRef<HTMLDivElement | null>(null);
  const [showTimelineJump, setShowTimelineJump] = useState(false);
  const [typingHudMode, setTypingHudMode] = useState<"steady" | "pulse">("steady");
  const [ownTypingPulse, setOwnTypingPulse] = useState(false);
  const ownTypingPulseTimerRef = useRef<number | null>(null);
  const lastBodyForTypingPulseRef = useRef(body);
  const hasConversationChoices = (data?.summaries.length ?? 0) > 1;
  const showConversationRail = Boolean(mode === "page" && hasConversationChoices);
  const showConversationChips = !showConversationRail && hasConversationChoices;
  const unreadCount = data?.totalUnreadCount ?? 0;
  const heading = counterpart?.displayName || (data?.viewer.isAdmin ? "Private inbox" : "Private Thread");
  const premiumTypingHud = typingHudMode === "pulse";
  const typingLabel =
    data?.conversation?.counterpartTyping && counterpart
      ? `${counterpart.displayName} is typing…`
      : null;
  const ownTypingSteadyLabel =
    body.trim().length > 0 && !data?.unavailableReason
      ? `${data?.viewer.displayName || "You"} is typing…`
      : null;
  const ownTypingPulseLabel =
    ownTypingPulse && body.trim().length > 0 && !data?.unavailableReason
      ? `${data?.viewer.displayName || "You"} is typing…`
      : null;
  const streamTypingLabel = premiumTypingHud ? null : typingLabel;
  const centerTypingLabel = premiumTypingHud
    ? typingLabel || ownTypingPulseLabel
    : ownTypingSteadyLabel;
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

  function pulseOwnTypingHud() {
    if (typeof window === "undefined") return;
    if (typingHudMode !== "pulse") return;

    setOwnTypingPulse(true);

    if (ownTypingPulseTimerRef.current) {
      window.clearTimeout(ownTypingPulseTimerRef.current);
    }

    ownTypingPulseTimerRef.current = window.setTimeout(() => {
      setOwnTypingPulse(false);
      ownTypingPulseTimerRef.current = null;
    }, 1150);
  }

  function toggleTypingHudMode() {
    setTypingHudMode((current) => {
      const next = current === "pulse" ? "steady" : "pulse";

      if (typeof window !== "undefined") {
        window.localStorage.setItem(TYPING_HUD_MODE_STORAGE_KEY, next);
      }

      if (next === "steady") {
        setOwnTypingPulse(false);
      } else if (body.trim()) {
        window.setTimeout(() => pulseOwnTypingHud(), 0);
      }

      return next;
    });
  }

  function updateTimelineJumpButton() {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const shouldShow = distanceFromBottom > 140;

    setShowTimelineJump((current) => (current === shouldShow ? current : shouldShow));
  }

  function scrollTimelineToBottom(behavior: ScrollBehavior = "smooth") {
    const viewport = timelineViewportRef.current;

    timelineBottomRef.current?.scrollIntoView({ block: "end", behavior });

    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
    }

    setShowTimelineJump(false);
  }

  function handleTimelineScroll() {
    updateTimelineJumpButton();
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    const saved = window.localStorage.getItem(TYPING_HUD_MODE_STORAGE_KEY);
    if (saved === "steady" || saved === "pulse") {
      setTypingHudMode(saved);
    }

    return () => {
      if (ownTypingPulseTimerRef.current) {
        window.clearTimeout(ownTypingPulseTimerRef.current);
        ownTypingPulseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typingHudMode !== "pulse") {
      lastBodyForTypingPulseRef.current = body;
      return;
    }

    if (body !== lastBodyForTypingPulseRef.current) {
      lastBodyForTypingPulseRef.current = body;

      if (body.trim()) {
        pulseOwnTypingHud();
      } else {
        setOwnTypingPulse(false);
      }
    }
  }, [body, typingHudMode]);

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
      setShowTimelineJump(false);
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
  }, [activeTargetUid, latestTimelineKey, loading]);

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-[1.25rem] text-white shadow-[0_28px_120px_rgba(0,0,0,0.45)] sm:rounded-[1.6rem] ${shellClassName} ${
        mode === "page"
          ? "h-full max-h-full flex-1 shadow-[0_32px_140px_rgba(0,0,0,0.5)]"
          : "h-full w-full shadow-[0_34px_120px_rgba(2,6,23,0.82)]"
      }`}
      style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.07), 0 32px 120px rgba(0,0,0,0.45)" }}
    >
      <div className={`shrink-0 border-b px-3 py-2.5 sm:px-4 sm:py-3 ${chromeClassName}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/70">
              {counterpart?.threadKind === "ai"
                ? "AI scribe"
                : data?.viewer.isAdmin
                  ? "Private inbox"
                  : "Direct line"}
            </div>
            <h2 className="mt-1.5 break-words text-lg font-semibold text-white sm:mt-2 sm:truncate sm:text-xl">
              {heading}
            </h2>
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
            <div className={`flex shrink-0 gap-2 overflow-x-auto overscroll-contain border-b px-3 py-2.5 sm:px-4 sm:py-3 ${chromeClassName}`}>
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

          <div className="relative min-h-0 flex-1">
            <div
              ref={timelineViewportRef}
              onScroll={handleTimelineScroll}
              className="h-full min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:py-4"
            >
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
                {streamTypingLabel ? (
                  <div className="mt-1 flex justify-start px-1">
                    <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-100/62">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/70 shadow-[0_0_10px_rgba(110,231,183,0.42)]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/45 [animation-delay:120ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/25 [animation-delay:240ms]" />
                      </span>
                      <span>{streamTypingLabel}</span>
                    </div>
                  </div>
                ) : null}
                <div ref={timelineBottomRef} className="h-px w-full" />
              </div>
            )}
            </div>

            {showTimelineJump ? (
              <button
                type="button"
                onClick={() => scrollTimelineToBottom("smooth")}
                className="absolute bottom-4 left-1/2 z-20 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-emerald-200/18 bg-[#07111f]/88 text-sm font-black text-emerald-100/82 shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_0_0_1px_rgba(110,231,183,0.08)] backdrop-blur-md transition hover:border-emerald-200/30 hover:bg-[#0b1828] hover:text-emerald-50"
                aria-label="Scroll to latest message"
              >
                <span aria-hidden="true">↓</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleTypingHudMode}
              className={`absolute bottom-4 left-4 z-30 inline-flex h-4 w-4 items-center justify-center rounded-full border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-200/25 ${
                premiumTypingHud
                  ? "border-emerald-200/20 bg-emerald-300/[0.075] shadow-[0_0_14px_rgba(110,231,183,0.18)]"
                  : "border-white/12 bg-white/[0.055] shadow-[0_0_10px_rgba(148,163,184,0.10)]"
              }`}
              aria-label="Toggle typing display"
              aria-pressed={premiumTypingHud}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full transition ${
                  premiumTypingHud
                    ? "bg-emerald-200/90 shadow-[0_0_12px_rgba(110,231,183,0.55)]"
                    : "bg-slate-300/45 shadow-[0_0_8px_rgba(148,163,184,0.22)]"
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          {centerTypingLabel ? (
            <div className="pointer-events-none flex shrink-0 justify-center px-3 pb-2 pt-1 sm:px-4">
              <div className="inline-flex max-w-full items-center justify-center gap-2 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/70">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/80 shadow-[0_0_10px_rgba(110,231,183,0.45)]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/50 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/30 [animation-delay:240ms]" />
                </span>
                <span className="truncate">{centerTypingLabel}</span>
              </div>
            </div>
          ) : null}

          <div className={`shrink-0 border-t px-3 py-3 sm:px-4 sm:py-4 ${chromeClassName} ${composerClassName}`}>
            {richComposer ? (
              richComposer
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
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
                  className={`min-w-0 flex-1 rounded-[1.25rem] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 transition focus:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)] ${plainComposerInputClassName}`}
                />
                <button
                  type="button"
                  onClick={onSend}
                  disabled={sendPending || !body.trim() || Boolean(data?.unavailableReason)}
                  className="min-h-11 rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 sm:self-end"
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
                  onClick={onOpenFullPage}
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
