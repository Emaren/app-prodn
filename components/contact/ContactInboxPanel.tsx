"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  Coins,
  LayoutList,
  MessageCirclePlus,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Languages,
  Pin,
  Reply,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import ScheduledMatchCard from "@/components/challenge/ScheduledMatchCard";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import {
  DIRECT_MESSAGE_MAX_CHARS,
  DIRECT_MESSAGE_QUICK_REACTIONS,
  DIRECT_MESSAGE_REACTIONS,
} from "@/lib/contactInboxConfig";
import {
  type ChatViewMode,
  useChatViewPreference,
} from "@/components/contact/chatViewPreference";
import { AI_CONCIERGE_NAME, AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import {
  parseClanProtocolMessage,
  type ClanProtocolMessage,
} from "@/lib/clanProtocolMessages";
import { summarizeChallengeInboxMessage } from "@/lib/challengeInboxMessages";
import type {
  ContactChallengeActionKind,
  ContactChallengeActionState,
  ContactInboxMessage,
  ContactInboxPayload,
  ContactInboxSummary,
  ContactTextMessage,
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
  onLoadOlder?: () => Promise<void>;
  onRefresh?: () => void | Promise<void>;
  replyingTo?: ContactTextMessage | null;
  onReply?: (message: ContactTextMessage) => void;
  onCancelReply?: () => void;
  onRetryOptimistic?: (message: ContactTextMessage) => void;
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

function formatReceiptTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  const dateCopy = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const timeCopy = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateCopy} · ${timeCopy}`;
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

const ONE_OFF_HIDDEN_BUBBLE_TIMESTAMP_MESSAGE_IDS = new Set<number>([
  3334,
]);

function shouldHideOneOffBubbleTimestamp(message: ContactInboxMessage) {
  return message.kind === "text" && ONE_OFF_HIDDEN_BUBBLE_TIMESTAMP_MESSAGE_IDS.has(message.messageId);
}

function isTightTextSequence(previous: ContactInboxMessage | null, current: ContactInboxMessage) {
  if (!previous) return false;
  if (previous.kind !== "text" || current.kind !== "text") return false;
  if (
    parseClanProtocolMessage(previous.body) ||
    parseClanProtocolMessage(current.body)
  ) {
    return false;
  }
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
          "border-emerald-300/18 bg-emerald-400/10 text-emerald-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]",
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
  const isInvite = summary.state === "scheduled" || summary.state === "rescheduled";

  return (
    <div className="flex justify-center">
      <div
        title={message.body}
        className={`w-full max-w-2xl overflow-hidden rounded-[1.4rem] border ${compactNotice.shell}`}
      >
        <div className="relative overflow-hidden px-4 py-4 sm:px-5">
          {isInvite ? (
            <div className="pointer-events-none absolute -right-8 -top-12 h-36 w-36 rounded-full bg-emerald-200/10 blur-2xl" />
          ) : null}

          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-current opacity-70">
                <Swords className="h-3.5 w-3.5" />
                {summary.compactHeadline}
              </div>
              <div className="mt-1.5 truncate text-base font-black text-white sm:text-lg">
                {summary.matchup || "Scheduled challenge"}
              </div>
            </div>
            {summary.challengeId ? (
              <div className="shrink-0 rounded-full border border-current/15 bg-black/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em]">
                #{summary.challengeId}
              </div>
            ) : null}
          </div>

          <div className="relative mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-current/10 bg-black/15 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] opacity-65">
                <CalendarClock className="h-3.5 w-3.5" />
                Battle time
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {summary.scheduledAtIso ? (
                  <TimeDisplayText
                    value={summary.scheduledAtIso}
                    includeZone
                    className="text-white"
                    bubbleClassName="w-max max-w-[18rem] text-center"
                  />
                ) : (
                  summary.scheduledLabel || "Timing pending"
                )}
              </div>
            </div>
            <div className="rounded-xl border border-current/10 bg-black/15 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] opacity-65">
                <Coins className="h-3.5 w-3.5" />
                Escrow each
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-white">
                {summary.fundingLabel || "Funding update"}
              </div>
            </div>
          </div>

          {summary.titleStakesLabel ? (
            <div className="relative mt-2 rounded-xl border border-emerald-100/20 bg-emerald-100/10 px-3 py-2.5">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-amber-50/70">
                <Trophy className="h-3.5 w-3.5" />
                Titles on the table
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                {summary.titleStakesLabel}
              </div>
            </div>
          ) : null}

          {summary.note ? (
            <div className="relative mt-2 rounded-xl border border-current/10 bg-black/10 px-3 py-2.5 text-sm italic leading-5 text-white/85">
              “{summary.note}”
            </div>
          ) : null}

          <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-[11px] font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              {summary.statusLabel || "Protected by verified challenge rules"}
            </div>
            {summary.challengeId ? (
              <Link
                href={`/challenge?focus=${summary.challengeId}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-current/20 bg-black/15 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-black/25"
              >
                Open challenge
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClanProtocolSystemLine({
  message,
  protocol,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
  protocol: ClanProtocolMessage;
}) {
  const appointed = protocol.kind === "leader-appointed";
  const toneClass = appointed
    ? "border-emerald-300/20 bg-[linear-gradient(90deg,rgba(6,78,59,0.26),rgba(16,185,129,0.13),rgba(6,78,59,0.26))] text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.08),inset_0_0_0_1px_rgba(110,231,183,0.04)]"
    : "border-slate-300/14 bg-[linear-gradient(90deg,rgba(30,41,59,0.42),rgba(51,65,85,0.24),rgba(30,41,59,0.42))] text-slate-200 shadow-[inset_0_0_0_1px_rgba(203,213,225,0.03)]";

  return (
    <div className="flex justify-center py-0.5">
      <div
        title={`AoE2WAR protocol · ${formatBubbleTime(message.createdAt)}`}
        className={`inline-flex max-w-full items-center justify-center rounded-full border px-3.5 py-1.5 text-center text-[11px] font-medium leading-5 sm:px-4 sm:text-xs ${toneClass}`}
      >
        <span className="sm:whitespace-nowrap">{protocol.body}</span>
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

const CHAT_VIEW_OPTIONS: Array<{
  mode: ChatViewMode;
  label: string;
  title: string;
  icon: typeof MessageSquare;
}> = [
  { mode: "v1", label: "V1", title: "Classic bubbles", icon: MessageSquare },
  { mode: "v2", label: "V2", title: "Compact lines", icon: LayoutList },
  { mode: "v3", label: "V3", title: "Obsidian glass", icon: Sparkles },
];

function ChatViewSwitcher({
  value,
  onChange,
}: {
  value: ChatViewMode;
  onChange: (mode: ChatViewMode) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-black/25 p-0.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] sm:p-1"
      role="group"
      aria-label="Chat appearance"
    >
      {CHAT_VIEW_OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = value === option.mode;
        return (
          <button
            key={option.mode}
            type="button"
            onClick={() => onChange(option.mode)}
            aria-pressed={active}
            title={option.title}
            className={`inline-flex h-7 items-center gap-1 rounded-full px-2 text-[9px] font-black uppercase tracking-[0.11em] transition sm:h-8 sm:gap-1.5 sm:px-3 sm:text-[10px] sm:tracking-[0.14em] ${
              active
                ? option.mode === "v3"
                  ? "bg-[linear-gradient(135deg,rgba(45,212,191,0.2),rgba(251,191,36,0.18))] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_0_20px_rgba(45,212,191,0.08)]"
                  : "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
                : "text-slate-500 hover:bg-white/[0.055] hover:text-slate-200"
            }`}
          >
            <Icon className="hidden h-3 w-3 min-[390px]:block" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SummaryButton({
  summary,
  active,
  onClick,
  viewMode,
}: {
  summary: ContactInboxSummary;
  active: boolean;
  onClick: () => void;
  viewMode: ChatViewMode;
}) {
  const isLineView = viewMode === "v2";
  const isObsidianView = viewMode === "v3";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full px-3 text-left transition ${
        isLineView ? "rounded-md py-2.5" : isObsidianView ? "rounded-[1rem] py-3" : "rounded-[1.35rem] py-3"
      } ${
        active
          ? isLineView
            ? "bg-[#30333a] text-white shadow-[inset_3px_0_0_#6ee7b7]"
            : isObsidianView
              ? "bg-[linear-gradient(135deg,rgba(45,212,191,0.11),rgba(251,191,36,0.07))] text-white shadow-[inset_0_0_0_1px_rgba(94,234,212,0.16)]"
              : "bg-[#16233a] text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]"
          : isLineView
            ? "text-slate-300 hover:bg-white/[0.055]"
            : isObsidianView
              ? "bg-white/[0.025] text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.045)] hover:bg-white/[0.05]"
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
  onRetry,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
  onRetry?: () => void;
}) {
  if (!message.receipt) {
    return null;
  }

  const copy =
    message.receipt.status === "read" && message.receipt.readAt
      ? formatReceiptTimestamp(message.receipt.readAt)
      : message.receipt.status === "delivered"
        ? "Sent"
        : message.receipt.status === "sending"
          ? "Sending…"
          : message.receipt.status === "failed"
            ? "Failed to send"
            : "Sent";

  return <div className={`mt-1 text-right text-[10px] italic ${message.receipt.status === "failed" ? "text-rose-300" : "text-slate-500/80"}`}>{copy}{message.receipt.status === "failed" && onRetry ? <button type="button" onClick={onRetry} className="ml-2 font-semibold not-italic underline decoration-rose-300/40 underline-offset-2">Retry</button> : null}</div>;
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

function DateDivider({ label, viewMode }: { label: string; viewMode: ChatViewMode }) {
  if (viewMode === "v2") {
    return (
      <div className="pointer-events-none sticky top-0 z-30 -mx-2 bg-[linear-gradient(180deg,rgba(4,10,20,0.98)_0%,rgba(4,10,20,0.91)_72%,rgba(4,10,20,0)_100%)] px-2 pb-2 pt-1 backdrop-blur-md" aria-label={`Messages from ${label}`}>
        <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b8d93]">
          <div className="h-px flex-1 bg-white/10" />
          {label}
          <div className="h-px flex-1 bg-white/10" />
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none sticky top-0 z-30 -mx-2 bg-[linear-gradient(180deg,rgba(4,10,20,0.98)_0%,rgba(4,10,20,0.91)_72%,rgba(4,10,20,0)_100%)] px-2 pb-2 pt-1 backdrop-blur-md" aria-label={`Messages from ${label}`}>
      <div className="flex items-center gap-3 py-1">
        <div className={`h-px flex-1 ${viewMode === "v3" ? "bg-gradient-to-r from-transparent to-teal-200/20" : "bg-white/7"}`} />
        <div className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.24em] ${viewMode === "v3" ? "border border-teal-100/10 bg-teal-200/[0.06] text-teal-100/60" : "bg-white/[0.06] text-slate-400"}`}>
          {label}
        </div>
        <div className={`h-px flex-1 ${viewMode === "v3" ? "bg-gradient-to-l from-transparent to-amber-200/20" : "bg-white/7"}`} />
      </div>
    </div>
  );
}

function TextMessageBubble({
  message,
  viewerUid,
  viewerIsAdmin,
  mode,
  viewMode,
  showMeta,
  showReceipt,
  onInboxAction,
  onToggleReaction,
  reactingMessageId,
  onReply,
  onRefresh,
  onRetryOptimistic,
}: {
  message: Extract<ContactInboxMessage, { kind: "text" }>;
  viewerUid: string;
  viewerIsAdmin: boolean;
  mode: "popover" | "page";
  viewMode: ChatViewMode;
  showMeta: boolean;
  showReceipt: boolean;
  onInboxAction: (action: Record<string, unknown>) => void;
  onToggleReaction?: (messageId: number, emoji: string) => void;
  reactingMessageId?: number | null;
  onReply?: (message: ContactTextMessage) => void;
  onRefresh?: () => void | Promise<void>;
  onRetryOptimistic?: (message: ContactTextMessage) => void;
}) {
  const isViewer = message.sender.uid === viewerUid;
  const isPersisted = message.messageId > 0;
  const canManageMessage = isPersisted && (viewerIsAdmin || isViewer);
  const maxBubbleWidthClass =
    viewMode === "v2"
      ? "w-full max-w-none"
      : mode === "page"
        ? viewMode === "v3"
          ? "max-w-[min(92%,52rem)]"
          : "max-w-[min(96%,56rem)]"
        : "max-w-[94%] sm:max-w-[82%]";
  const messageBodyViewportClass =
    mode === "page" ? "max-h-[min(46vh,28rem)] overflow-y-auto pr-1" : "max-h-48 overflow-y-auto pr-1";
  const canToggleLobbyShare =
    isPersisted && message.sender.uid === AI_CONCIERGE_UID && !message.attachment && message.body.trim().length > 0;
  const clanProtocolMessage = parseClanProtocolMessage(message.body);
  const compactChallengeNotice = message.body ? challengeNoticeTone(summarizeChallengeInboxMessage(message.body)) : null;
  const [trayPinnedOpen, setTrayPinnedOpen] = useState(false);
  const [trayPlacement, setTrayPlacement] = useState<"above" | "below">("above");
  const [reactionMoreOpen, setReactionMoreOpen] = useState(false);
  const [attachmentPreviewFailed, setAttachmentPreviewFailed] = useState(false);
  const [languagePending, setLanguagePending] = useState(false);
  const [transcriptionPending, setTranscriptionPending] = useState(false);
  const [activeTranslation, setActiveTranslation] = useState<{ language: string; text: string } | null>(message.translations[0] ?? null);
  const holdTimerRef = useRef<number | null>(null);
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

  function beginLongPress(pointerType: string) {
    if (pointerType === "mouse") return;
    longPressTriggeredRef.current = false;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      updateTrayPlacement();
      setTrayPinnedOpen(true);
    }, 360);
  }

  function updateTrayPlacement() {
    const bubble = bubbleRef.current;
    const timeline = bubble?.closest<HTMLElement>("[data-contact-chat-scroll]");
    if (!bubble || !timeline) return;
    const bubbleRect = bubble.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    setTrayPlacement(bubbleRect.top - timelineRect.top < 190 ? "below" : "above");
  }

  function handleBubbleClick() {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (trayPinnedOpen) {
      setTrayPinnedOpen(false);
      return;
    }
    updateTrayPlacement();
    setTrayPinnedOpen(true);
  }

  const bubbleTone = isViewer
    ? viewMode === "v2"
      ? "border-l-2 border-emerald-300/55 bg-emerald-300/[0.035] text-slate-100"
      : viewMode === "v3"
        ? "border border-amber-100/14 bg-[linear-gradient(135deg,rgba(251,191,36,0.19),rgba(120,53,15,0.14)_58%,rgba(8,15,25,0.84))] text-amber-50 shadow-[0_18px_50px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
        : mode === "popover"
          ? "border border-amber-300/14 bg-[linear-gradient(180deg,rgba(138,94,18,0.96),rgba(103,70,14,0.94))] text-amber-50 shadow-[0_18px_34px_rgba(76,54,15,0.34)]"
          : "border border-amber-300/10 bg-[linear-gradient(180deg,rgba(251,191,36,0.28),rgba(245,158,11,0.16))] text-amber-50 shadow-[0_16px_32px_rgba(245,158,11,0.12)]"
    : viewMode === "v2"
      ? "border-l-2 border-transparent text-slate-200 hover:bg-white/[0.025]"
      : viewMode === "v3"
        ? "border border-teal-100/12 bg-[linear-gradient(135deg,rgba(12,28,39,0.92),rgba(8,15,25,0.82))] text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl"
        : mode === "popover"
          ? "border border-slate-200/10 bg-[linear-gradient(180deg,rgba(22,31,47,0.98),rgba(14,21,34,0.96))] text-slate-100 shadow-[0_18px_34px_rgba(2,6,23,0.42)]"
          : "border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] text-slate-100 shadow-[0_14px_28px_rgba(0,0,0,0.18)]";

  function handleReactionPick(emoji: string) {
    if (!onToggleReaction) return;
    onToggleReaction(message.messageId, emoji);
    setTrayPinnedOpen(false);
    setReactionMoreOpen(false);
  }

  function handleLobbyShareToggle() {
    onInboxAction({
      action: "toggle_ai_lobby_share",
      messageId: message.messageId,
    });
    setTrayPinnedOpen(false);
    setReactionMoreOpen(false);
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

  async function handleTranslate() {
    const language = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase().slice(0, 5);
    const cached = message.translations.find((translation) => translation.language === language);
    if (cached) {
      setActiveTranslation((current) => current?.language === cached.language ? null : cached);
      setTrayPinnedOpen(false);
      return;
    }
    setLanguagePending(true);
    try {
      const response = await fetch(`/api/contact-emaren/messages/${message.messageId}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const payload = (await response.json().catch(() => ({}))) as { text?: string; language?: string; detail?: string };
      if (!response.ok || !payload.text) throw new Error(payload.detail || "Translation failed");
      setActiveTranslation({ language: payload.language || language, text: payload.text });
      await onRefresh?.();
    } finally {
      setLanguagePending(false);
      setTrayPinnedOpen(false);
    }
  }

  async function handleTranscribe() {
    setTranscriptionPending(true);
    try {
      const response = await fetch(`/api/contact-emaren/messages/${message.messageId}/transcribe`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { text?: string; detail?: string };
      if (!response.ok) throw new Error(payload.detail || "Transcription failed");
      await onRefresh?.();
    } finally {
      setTranscriptionPending(false);
      setTrayPinnedOpen(false);
    }
  }

  if (clanProtocolMessage) {
    return (
      <ClanProtocolSystemLine
        message={message}
        protocol={clanProtocolMessage}
      />
    );
  }

  if (compactChallengeNotice) {
    return <ChallengeSystemMessageLine message={message} compactNotice={compactChallengeNotice} />;
  }

  const trayVisible = trayPinnedOpen;
  const hasTray = isPersisted && Boolean(onToggleReaction || canToggleLobbyShare || canManageMessage || onReply);
  const secondaryReactions = DIRECT_MESSAGE_REACTIONS.filter(
    (emoji) => !(DIRECT_MESSAGE_QUICK_REACTIONS as readonly string[]).includes(emoji)
  );
  const senderInitial = message.sender.displayName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className={`${trayVisible ? "relative z-50 [content-visibility:visible]" : "[content-visibility:auto] [contain-intrinsic-size:auto_96px]"} flex ${viewMode === "v2" ? "justify-start" : isViewer ? "justify-end" : "justify-start"}`}>
      <div
        ref={bubbleRef}
        className={`group relative min-w-0 max-w-full ${maxBubbleWidthClass} ${viewMode === "v2" ? "py-0.5 pl-9 sm:pl-11" : ""}`}
        onPointerDown={(event) => beginLongPress(event.pointerType)}
        onPointerUp={clearHoldTimer}
        onPointerCancel={clearHoldTimer}
        onPointerLeave={clearHoldTimer}
      >
        {viewMode === "v2" && showMeta ? (
          <div className="mb-0.5 flex items-baseline gap-2 px-2">
            <span className={`font-semibold ${isViewer ? "text-emerald-200" : "text-white"}`}>
              {isViewer ? "You" : message.sender.displayName}
            </span>
            <span className="text-[10px] font-medium text-[#777a82]">{formatBubbleTime(message.createdAt)}</span>
          </div>
        ) : showMeta ? (
          <div className={`mb-1 px-2 text-[11px] uppercase tracking-[0.24em] text-slate-500 ${isViewer ? "text-right" : "text-left"}`}>
            {viewMode === "v3" && !isViewer ? `${message.sender.displayName} · ` : ""}{formatBubbleTime(message.createdAt)}
          </div>
        ) : null}

        {viewMode === "v2" && showMeta ? (
          <div className={`absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-[11px] font-black sm:h-9 sm:w-9 ${isViewer ? "bg-emerald-300/15 text-emerald-100" : "bg-[#353840] text-slate-100"}`}>
            {senderInitial}
          </div>
        ) : null}

        <div className="relative">
          <div
            data-message-id={message.messageId}
            className={`relative cursor-default ${
              viewMode === "v2"
                ? "rounded-sm px-2 py-1.5 text-[14px]"
                : viewMode === "v3"
                  ? "rounded-[1.05rem] px-3.5 py-3 sm:rounded-[1.25rem] sm:px-4"
                  : "rounded-[1.25rem] px-3 py-2.5 sm:rounded-[1.45rem] sm:px-4 sm:py-3"
            } ${bubbleTone}`}
            onClick={handleBubbleClick}
            aria-label="Message. Click or press and hold for reactions and actions."
          >
            {message.replyTo ? (
              <div className="mb-2 rounded-lg border-l-2 border-cyan-200/45 bg-black/20 px-3 py-2 text-xs text-slate-300">
                <div className="font-semibold text-cyan-100/80">{message.replyTo.senderName}</div>
                <div className="mt-0.5 line-clamp-2">{message.replyTo.body}</div>
              </div>
            ) : null}
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

            {message.transcription ? (
              <div className="mt-2 rounded-lg border border-white/8 bg-black/20 px-3 py-2 text-xs leading-5 text-slate-200">
                <span className="mr-2 font-semibold uppercase tracking-[0.14em] text-teal-200/70">Transcript</span>
                {message.transcription}
              </div>
            ) : null}

            {activeTranslation ? (
              <div className="mt-2 rounded-lg border border-cyan-200/10 bg-cyan-300/[0.045] px-3 py-2 text-xs leading-5 text-cyan-50/90">
                <span className="mr-2 font-semibold uppercase tracking-[0.14em] text-cyan-200/60">{activeTranslation.language}</span>
                {activeTranslation.text}
              </div>
            ) : null}

            {message.replayCard ? (
              <Link
                href={`/game-stats/${message.replayCard.id}`}
                onClick={(event) => event.stopPropagation()}
                className="mt-3 block rounded-xl border border-amber-200/16 bg-[linear-gradient(135deg,rgba(120,53,15,0.28),rgba(3,7,18,0.72))] p-3 transition hover:border-amber-200/30"
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-200/65">Replay intelligence · #{message.replayCard.id}</div>
                <div className="mt-1 text-sm font-semibold text-white">{message.replayCard.players.join(" vs ") || "Parsed AoE2 match"}</div>
                <div className="mt-1 text-xs text-slate-300">{[message.replayCard.mapName, message.replayCard.winner ? `${message.replayCard.winner} won` : null].filter(Boolean).join(" · ")}</div>
              </Link>
            ) : null}

            {message.editedAt ? <div className="mt-1 text-right text-[9px] italic text-slate-500">edited</div> : null}

            {hasTray && !trayVisible ? (
              <span className={`pointer-events-none absolute -top-3 ${isViewer && viewMode !== "v2" ? "left-2" : "right-2"} inline-flex h-6 w-6 translate-y-1 items-center justify-center rounded-full border border-white/10 bg-[#0a111d]/95 text-slate-400 opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100`}>
                <MoreHorizontal className="h-3.5 w-3.5" />
              </span>
            ) : null}
          </div>

          {hasTray ? (
            <div
              className={`absolute z-40 max-w-[min(22rem,calc(100vw-2rem))] ${isViewer && viewMode !== "v2" ? "right-0 sm:right-2" : "left-0 sm:left-2"} ${trayPlacement === "above" ? "bottom-full mb-2 origin-bottom" : "top-full mt-2 origin-top"} transition-all duration-150 ${
                trayVisible
                  ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none translate-y-1 scale-[0.98] opacity-0"
              }`}
            >
              <div className="max-w-full rounded-[1.15rem] border border-white/12 bg-[#09111d]/[0.98] p-2 shadow-[0_24px_64px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-2xl">
                <div className="flex items-center gap-1">
                  {DIRECT_MESSAGE_QUICK_REACTIONS.map((emoji) => {
                    const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
                    const isActive = Boolean(existing?.viewerReacted);
                    const isTextReaction = emoji === "GG";
                    return (
                      <button
                        key={`${message.messageId}-quick-${emoji}`}
                        type="button"
                        onClick={() => handleReactionPick(emoji)}
                        aria-label={`React ${emoji}`}
                        aria-pressed={isActive}
                        disabled={reactingMessageId === message.messageId}
                        className={`grid h-9 flex-1 min-w-9 place-items-center rounded-full border text-base transition hover:-translate-y-0.5 hover:scale-105 ${
                          isTextReaction ? "text-[10px] font-black tracking-wide" : ""
                        } ${
                          isActive
                            ? "border-amber-200/35 bg-amber-300/18 text-amber-50"
                            : "border-transparent bg-white/[0.055] text-slate-100 hover:border-white/14 hover:bg-white/[0.1]"
                        } disabled:opacity-50`}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setReactionMoreOpen((current) => !current)}
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${reactionMoreOpen ? "rotate-180 border-white/16 bg-white/[0.1] text-white" : "border-transparent bg-white/[0.045] text-slate-400 hover:bg-white/[0.09] hover:text-white"}`}
                    aria-label={reactionMoreOpen ? "Hide more reactions" : "Show more reactions"}
                    aria-expanded={reactionMoreOpen}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {reactionMoreOpen ? (
                  <div className="mt-2 grid grid-cols-6 gap-1 border-t border-white/8 pt-2">
                    {secondaryReactions.map((emoji) => {
                      const existing = message.reactions.find((reaction) => reaction.emoji === emoji);
                      return (
                        <button
                          key={`${message.messageId}-more-${emoji}`}
                          type="button"
                          onClick={() => handleReactionPick(emoji)}
                          aria-pressed={Boolean(existing?.viewerReacted)}
                          disabled={reactingMessageId === message.messageId}
                          className={`grid h-8 min-w-8 place-items-center rounded-full border text-sm transition hover:bg-white/[0.1] ${emoji === "GG" ? "text-[9px] font-black" : ""} ${existing?.viewerReacted ? "border-amber-200/30 bg-amber-300/14" : "border-transparent bg-white/[0.035]"}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {(canToggleLobbyShare || canManageMessage || onReply) ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/8 pt-2">
                {onReply ? (
                  <button type="button" onClick={() => { onReply(message); setTrayPinnedOpen(false); }} className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.1]">
                    <Reply className="h-3 w-3" /> Reply
                  </button>
                ) : null}
                <button type="button" onClick={() => { onInboxAction({ action: "toggle_pin", messageId: message.messageId }); setTrayPinnedOpen(false); }} className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.1]">
                  <Pin className="h-3 w-3" /> {message.isPinned ? "Unpin" : "Pin"}
                </button>
                {message.body ? (
                  <button type="button" disabled={languagePending} onClick={() => void handleTranslate()} className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.1] disabled:opacity-50">
                    <Languages className="h-3 w-3" /> {languagePending ? "Translating" : "Translate"}
                  </button>
                ) : null}
                {message.attachment?.kind === "audio" ? (
                  <button type="button" disabled={transcriptionPending} onClick={() => void handleTranscribe()} className="inline-flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-200 hover:bg-white/[0.1] disabled:opacity-50">
                    <Mic className="h-3 w-3" /> {transcriptionPending ? "Transcribing" : message.transcription ? "Transcript" : "Transcribe"}
                  </button>
                ) : null}
                {canToggleLobbyShare ? (
                  <button
                    type="button"
                    onClick={handleLobbyShareToggle}
                    className={`inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] transition ${
                      message.sharedLobbyMessageId
                        ? "border-cyan-300/22 bg-cyan-400/10 text-cyan-50 hover:border-cyan-200/30 hover:bg-cyan-400/16"
                        : "border-white/10 bg-white/[0.045] text-slate-200 hover:border-white/18 hover:bg-white/[0.1] hover:text-white"
                    }`}
                  >
                    {message.sharedLobbyMessageId ? "Make Private" : "Make Public"}
                  </button>
                ) : null}

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
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {message.reactions.length > 0 ? (
          <div
            className={`flex flex-wrap gap-1 px-1 ${viewMode === "v2" ? "mt-1 justify-start" : `mt-2 ${isViewer ? "justify-end" : "justify-start"}`}`}
          >
            {message.reactions.map((reaction) => (
              <button
                key={`${message.messageId}-${reaction.emoji}-summary`}
                type="button"
                onClick={() => onToggleReaction?.(message.messageId, reaction.emoji)}
                className={`inline-flex items-center justify-center gap-1 rounded-full border font-semibold leading-none transition duration-150 ${viewMode === "v2" ? "min-w-[2.35rem] px-1.5 py-0.5 text-[9px]" : "min-w-[2.65rem] px-2 py-1 text-[10px]"} ${
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

        {showReceipt ? (
          <ReceiptLine message={message} onRetry={message.receipt?.status === "failed" ? () => onRetryOptimistic?.(message) : undefined} />
        ) : null}
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
      showMeta: !shouldHideOneOffBubbleTimestamp(message) && !isTightTextSequence(previous, message),
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
  onLoadOlder,
  onRefresh,
  replyingTo,
  onReply,
  onCancelReply,
  onRetryOptimistic,
}: ContactInboxPanelProps) {
  const counterpart = data?.activeCounterpart ?? null;
  const activeTargetUid = data?.activeTargetUid ?? null;
  const { chatViewMode, setChatViewMode } = useChatViewPreference();
  const timelineViewportRef = useRef<HTMLDivElement | null>(null);
  const timelineBottomRef = useRef<HTMLDivElement | null>(null);
  const timelineContentRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledTargetUidRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [showTimelineJump, setShowTimelineJump] = useState(false);
  const [typingHudMode, setTypingHudMode] = useState<"steady" | "pulse">("steady");
  const [ownTypingPulse, setOwnTypingPulse] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ messageId: number; body: string; createdAt: string; senderName: string }>>([]);
  const [searchPending, setSearchPending] = useState(false);
  const ownTypingPulseTimerRef = useRef<number | null>(null);
  const lastBodyForTypingPulseRef = useRef(body);
  const hasConversationChoices = (data?.summaries.length ?? 0) > 1;
  const showConversationRail = Boolean(mode === "page" && hasConversationChoices);
  const showConversationChips = hasConversationChoices;
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
  const latestOutgoingMessageId = useMemo(() => {
    const viewerUid = data?.viewer.uid;
    if (!viewerUid) return null;
    const messages = data?.messages ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.kind === "text" && message.sender.uid === viewerUid) {
        return message.messageId;
      }
    }
    return null;
  }, [data?.messages, data?.viewer.uid]);
  const latestTimelineKey = timelineRows[timelineRows.length - 1]?.key ?? "empty";
  const isLineView = chatViewMode === "v2";
  const isObsidianView = chatViewMode === "v3";
  const shellClassName =
    isLineView
      ? "bg-[#1e1f22]"
      : isObsidianView
        ? "bg-[radial-gradient(circle_at_12%_0%,rgba(45,212,191,0.11),transparent_34%),radial-gradient(circle_at_96%_100%,rgba(251,191,36,0.10),transparent_38%),linear-gradient(145deg,#071019,#03070d_68%)]"
        : mode === "page"
          ? "bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]"
          : "bg-[linear-gradient(180deg,rgba(7,12,22,1),rgba(4,8,16,1))]";
  const chromeClassName =
    isLineView
      ? "border-white/10 bg-[#2b2d31]"
      : isObsidianView
        ? "border-white/8 bg-black/15 backdrop-blur-2xl"
        : mode === "page"
          ? "border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]"
          : "border-slate-200/12 bg-[#101a2c]";
  const railClassName = isLineView
    ? "bg-[#25262b]"
    : isObsidianView
      ? "bg-black/10"
      : mode === "page" ? "bg-white/[0.02]" : "bg-[#0b1423]";
  const composerClassName = isLineView
    ? "bg-[#292b30]"
    : isObsidianView
      ? "bg-[linear-gradient(180deg,rgba(4,10,17,0.72),rgba(2,6,12,0.9))]"
      : mode === "page" ? "bg-white/[0.015]" : "bg-[#0d1625]";
  const plainComposerInputClassName =
    isLineView
      ? "rounded-md bg-[#383a40] shadow-none"
      : isObsidianView
        ? "border border-teal-100/10 bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_30px_rgba(0,0,0,0.18)]"
        : mode === "page"
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

  const updateTimelineJumpButton = useCallback(() => {
    const viewport = timelineViewportRef.current;
    if (!viewport) return;

    const usesDocumentScroll = mode === "page" && viewport.scrollHeight <= viewport.clientHeight + 1;
    const distanceFromBottom = usesDocumentScroll
      ? document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      : viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const shouldShow = distanceFromBottom > 140;
    shouldStickToBottomRef.current = distanceFromBottom < 220;

    setShowTimelineJump((current) => (current === shouldShow ? current : shouldShow));
  }, [mode]);

  function scrollTimelineToBottom(behavior: ScrollBehavior = "smooth") {
    const viewport = timelineViewportRef.current;
    shouldStickToBottomRef.current = true;

    if (mode === "page" && viewport && viewport.scrollHeight <= viewport.clientHeight + 1) {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior });
    } else {
      timelineBottomRef.current?.scrollIntoView({ block: "end", behavior });
    }

    if (viewport && !(mode === "page" && viewport.scrollHeight <= viewport.clientHeight + 1)) {
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

  async function loadOlderMessages() {
    if (!onLoadOlder || loadingOlder) return;
    const viewport = timelineViewportRef.current;
    const previousHeight = viewport?.scrollHeight ?? 0;
    const previousTop = viewport?.scrollTop ?? 0;
    const usesDocumentScroll = Boolean(mode === "page" && viewport && viewport.scrollHeight <= viewport.clientHeight + 1);
    const previousDocumentHeight = document.documentElement.scrollHeight;
    const previousWindowY = window.scrollY;
    setLoadingOlder(true);
    try {
      await onLoadOlder();
      window.requestAnimationFrame(() => {
        if (usesDocumentScroll) {
          window.scrollTo({ top: previousWindowY + (document.documentElement.scrollHeight - previousDocumentHeight), behavior: "auto" });
        } else if (viewport) {
          viewport.scrollTop = previousTop + (viewport.scrollHeight - previousHeight);
        }
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  async function runSearch() {
    if (!activeTargetUid || searchQuery.trim().length < 2) return;
    setSearchPending(true);
    try {
      const params = new URLSearchParams({ user: activeTargetUid, q: searchQuery.trim() });
      const response = await fetch(`/api/contact-emaren/search?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as { results?: typeof searchResults };
      setSearchResults(response.ok && Array.isArray(payload.results) ? payload.results : []);
    } finally {
      setSearchPending(false);
    }
  }

  function focusMessage(messageId: number) {
    const node = timelineViewportRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSearchOpen(false);
    setPinsOpen(false);
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
    if (mode !== "page") return;
    const handleDocumentScroll = () => updateTimelineJumpButton();
    window.addEventListener("scroll", handleDocumentScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleDocumentScroll);
  }, [mode, updateTimelineJumpButton]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!timelineRows.length) return;

    const viewport = timelineViewportRef.current;
    if (!viewport) return;

    const targetChanged = lastAutoScrolledTargetUidRef.current !== activeTargetUid;
    const usesDocumentScroll = mode === "page" && viewport.scrollHeight <= viewport.clientHeight + 1;
    const distanceFromBottom = usesDocumentScroll
      ? document.documentElement.scrollHeight - window.scrollY - window.innerHeight
      : viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const userIsNearBottom = shouldStickToBottomRef.current || distanceFromBottom < 220;

    if (!targetChanged && !userIsNearBottom) {
      updateTimelineJumpButton();
      return;
    }

    lastAutoScrolledTargetUidRef.current = activeTargetUid;
    shouldStickToBottomRef.current = true;

    const scrollToLatest = () => {
      if (usesDocumentScroll) {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
      setShowTimelineJump(false);
    };

    scrollToLatest();
    const frame = window.requestAnimationFrame(scrollToLatest);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeTargetUid, chatViewMode, latestTimelineKey, loading, mode, timelineRows.length, updateTimelineJumpButton]);

  useEffect(() => {
    const viewport = timelineViewportRef.current;
    const content = timelineContentRef.current;
    if (!viewport || !content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (shouldStickToBottomRef.current) {
        if (mode === "page" && viewport.scrollHeight <= viewport.clientHeight + 1) {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
        } else {
          viewport.scrollTop = viewport.scrollHeight;
        }
        setShowTimelineJump(false);
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeTargetUid, mode, timelineRows.length]);

  return (
    <div
      className={`relative isolate flex min-h-0 flex-col overflow-hidden text-white ${isLineView ? "rounded-lg" : isObsidianView ? "rounded-[1.1rem] shadow-[0_38px_130px_rgba(0,0,0,0.62),0_0_50px_rgba(45,212,191,0.055)] sm:rounded-[1.35rem]" : "rounded-[1.25rem] shadow-[0_28px_120px_rgba(0,0,0,0.45),0_0_42px_rgba(16,185,129,0.08)] sm:rounded-[1.6rem]"} ${shellClassName} ${
        mode === "page"
          ? "h-full max-h-full flex-1 shadow-[0_32px_140px_rgba(0,0,0,0.5)]"
          : "h-full w-full shadow-[0_34px_120px_rgba(2,6,23,0.82)]"
      }`}
      style={{ boxShadow: isLineView ? "inset 0 0 0 1px rgba(255,255,255,0.08)" : undefined }}
    >
      <div className={`shrink-0 border-b px-3 py-2.5 sm:px-4 sm:py-3 ${chromeClassName}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2 className="min-w-0 break-words text-lg font-semibold leading-tight text-white sm:truncate sm:text-xl">
              {heading}
            </h2>
            {counterpart?.badges.map((badge) => (
              <CommunityBadgePill key={badge.id} label={badge.label} />
            ))}
            {counterpart && counterpart.giftedWolo > 0 ? (
              <span className="rounded-full border border-amber-200/15 bg-amber-300/[0.06] px-2 py-1 text-[10px] font-medium text-amber-100/80">
                {counterpart.giftedWolo} WOLO gifted
              </span>
            ) : null}
            {unreadCount > 0 ? (
              <span className="rounded-full bg-red-500/90 px-2 py-1 text-[10px] font-semibold text-white">{unreadCount} unread</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <button type="button" onClick={() => { setSearchOpen((current) => !current); setPinsOpen(false); }} className="grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-slate-300 transition hover:bg-white/[0.09] hover:text-white sm:h-8 sm:w-8" aria-label="Search messages"><Search className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => { setPinsOpen((current) => !current); setSearchOpen(false); }} className="relative grid h-7 w-7 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-slate-300 transition hover:bg-white/[0.09] hover:text-white sm:h-8 sm:w-8" aria-label="Pinned messages"><Pin className="h-3.5 w-3.5" />{data?.pinnedMessages.length ? <span className="absolute -right-1 -top-1 rounded-full bg-amber-300 px-1 text-[9px] font-black text-slate-950">{data.pinnedMessages.length}</span> : null}</button>
              <ChatViewSwitcher value={chatViewMode} onChange={setChatViewMode} />
          </div>
        </div>

        {searchOpen ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-2">
            <form onSubmit={(event) => { event.preventDefault(); void runSearch(); }} className="flex gap-2">
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search this conversation" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500" autoFocus />
              <button type="submit" disabled={searchPending || searchQuery.trim().length < 2} className="rounded-lg bg-cyan-200/12 px-3 text-xs font-semibold text-cyan-100 disabled:opacity-40">{searchPending ? "…" : "Search"}</button>
            </form>
            {searchResults.length ? <div className="mt-2 max-h-44 space-y-1 overflow-y-auto">{searchResults.map((result) => <button key={result.messageId} type="button" onClick={() => focusMessage(result.messageId)} className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.06]"><div className="text-[10px] text-cyan-100/60">{result.senderName} · {formatTimestamp(result.createdAt)}</div><div className="mt-0.5 line-clamp-2 text-xs text-slate-200">{result.body}</div></button>)}</div> : null}
          </div>
        ) : null}

        {pinsOpen ? (
          <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-xl border border-amber-200/12 bg-amber-300/[0.035] p-2">
            {data?.pinnedMessages.length ? data.pinnedMessages.map((message) => <button key={message.messageId} type="button" onClick={() => focusMessage(message.messageId)} className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.06]"><div className="text-[10px] text-amber-100/55">{message.sender.displayName} · {formatTimestamp(message.createdAt)}</div><div className="mt-0.5 line-clamp-2 text-xs text-slate-200">{message.body || message.transcription || "Attachment"}</div></button>) : <div className="px-3 py-2 text-xs text-slate-400">No pinned messages yet.</div>}
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
            ? `grid min-h-0 flex-1 ${isLineView ? "lg:grid-cols-[13rem_minmax(0,1fr)]" : "lg:grid-cols-[15rem_minmax(0,1fr)]"}`
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        {showConversationRail ? (
          <aside className={`hidden max-h-64 overflow-y-auto overscroll-contain border-b p-4 lg:block lg:max-h-none lg:border-b-0 lg:border-r ${chromeClassName} ${railClassName}`}>
            <div className="space-y-3">
              {data?.summaries.map((summary) => (
                <SummaryButton
                  key={summary.targetUid}
                  summary={summary}
                  active={summary.targetUid === activeTargetUid}
                  onClick={() => onSelectConversation(summary.targetUid)}
                  viewMode={chatViewMode}
                />
              ))}
            </div>
          </aside>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col">
          {showConversationChips ? (
            <div className={`flex shrink-0 gap-2 overflow-x-auto overscroll-contain border-b px-3 py-2 sm:px-4 sm:py-3 ${mode === "page" ? "lg:hidden" : ""} ${chromeClassName}`}>
              {data?.summaries.map((summary) => (
                <button
                  key={summary.targetUid}
                  type="button"
                  onClick={() => onSelectConversation(summary.targetUid)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition ${
                    summary.targetUid === activeTargetUid
                      ? "bg-emerald-400/12 text-emerald-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.18)]"
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
              onLoadCapture={() => {
                if (shouldStickToBottomRef.current) {
                  window.requestAnimationFrame(() => scrollTimelineToBottom("auto"));
                }
              }}
              data-contact-chat-scroll={mode}
              className={`h-full min-h-0 overflow-y-auto overscroll-contain ${isLineView ? "px-2 py-2 sm:px-3" : isObsidianView ? "px-3 py-4 sm:px-5 sm:py-5" : "px-3 py-3 sm:px-4 sm:py-4"}`}
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
              <div className="rounded-[1.35rem] bg-emerald-400/10 px-4 py-5 text-sm text-emerald-100 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.2)]">
                {data.unavailableReason}
              </div>
            ) : timelineRows.length === 0 ? (
              <div className="rounded-[1.35rem] bg-white/[0.045] px-4 py-5 text-sm text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                {data?.viewer.isAdmin ? "No messages in this thread yet." : "No messages yet. Say hello."}
              </div>
            ) : (
              <div ref={timelineContentRef} className={isLineView ? "space-y-0.5" : isObsidianView ? "space-y-4" : "space-y-3"}>
                {data?.messagePage.hasMore ? (
                  <div className="flex justify-center pb-2"><button type="button" onClick={() => void loadOlderMessages()} disabled={loadingOlder} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50">{loadingOlder ? "Loading history…" : "Load older messages"}</button></div>
                ) : null}
                {timelineRows.map((row) =>
                  row.type === "date" ? (
                    <DateDivider key={row.key} label={row.label} viewMode={chatViewMode} />
                  ) : row.message.kind === "text" ? (
                    <TextMessageBubble
                      key={row.key}
                      message={row.message}
                      viewerUid={data?.viewer.uid || ""}
                      viewerIsAdmin={Boolean(data?.viewer.isAdmin)}
                      mode={mode}
                      viewMode={chatViewMode}
                      showMeta={row.showMeta}
                      showReceipt={row.message.messageId === latestOutgoingMessageId}
                      onInboxAction={onInboxAction}
                      onToggleReaction={onToggleReaction}
                      reactingMessageId={reactingMessageId}
                      onReply={onReply}
                      onRefresh={onRefresh}
                      onRetryOptimistic={onRetryOptimistic}
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

          <div className={`relative shrink-0 border-t px-3 pb-2.5 pt-2.5 sm:px-4 sm:pb-4 sm:pt-4 ${chromeClassName} ${composerClassName}`}>
            <button
              type="button"
              onClick={toggleTypingHudMode}
              className={`absolute bottom-2.5 left-3 z-30 inline-flex h-4 w-4 items-center justify-center rounded-full border transition hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-200/25 sm:bottom-3 sm:left-4 ${
                premiumTypingHud
                  ? "border-emerald-200/20 bg-emerald-300/[0.075] shadow-[0_0_14px_rgba(110,231,183,0.18)]"
                  : "border-white/12 bg-white/[0.055] shadow-[0_0_10px_rgba(148,163,184,0.10)]"
              }`}
              aria-label="Toggle typing display"
              aria-pressed={premiumTypingHud}
              title={premiumTypingHud ? "Typing indicator: pulse" : "Typing indicator: steady"}
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
            {replyingTo ? (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-lg border-l-2 border-cyan-200/45 bg-cyan-300/[0.045] px-3 py-2 text-xs text-slate-300">
                <div className="min-w-0"><span className="font-semibold text-cyan-100">Replying to {replyingTo.sender.displayName}</span><div className="mt-0.5 truncate">{replyingTo.body || replyingTo.transcription || "Attachment"}</div></div>
                <button type="button" onClick={onCancelReply} className="text-slate-400 hover:text-white" aria-label="Cancel reply">×</button>
              </div>
            ) : null}
            {richComposer ? (
              richComposer
            ) : (
              <div className="flex items-end gap-2 sm:gap-3">
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
                  inputMode="text"
                  enterKeyHint="send"
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck
                  className={`min-w-0 flex-1 touch-manipulation ${isLineView ? "rounded-md" : "rounded-[1.25rem]"} px-4 py-3 text-base leading-6 text-white outline-none placeholder:text-slate-500 transition focus:shadow-[inset_0_0_0_1px_rgba(251,191,36,0.25)] sm:text-sm ${plainComposerInputClassName}`}
                />
                <button
                  type="button"
                  data-contact-send="true"
                  onClick={onSend}
                  disabled={sendPending || !body.trim() || Boolean(data?.unavailableReason)}
                  className={`min-h-11 shrink-0 bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 ${isLineView ? "rounded-md" : "rounded-full"}`}
                >
                  {sendPending ? "Sending..." : "Send"}
                </button>
              </div>
            )}

            {openPageHref ? (
              <div className="mt-2 flex justify-end">
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
