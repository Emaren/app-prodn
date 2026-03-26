"use client";

import Link from "next/link";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
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
  openPageHref?: string;
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

function buildPrompt(
  data: ContactInboxPayload | null,
  counterpartName: string | null
) {
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
      className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
        active
          ? "border-amber-300/30 bg-amber-400/10"
          : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{summary.displayName}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">
            {summary.isAdmin ? "Admin thread" : "Direct thread"}
          </div>
        </div>
        {summary.unreadCount > 0 ? (
          <div className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-semibold text-white">
            {summary.unreadCount}
          </div>
        ) : null}
      </div>

      {summary.badges.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.badges.slice(0, 3).map((badge) => (
            <CommunityBadgePill key={badge.id} label={badge.label} />
          ))}
        </div>
      ) : null}

      <div className="mt-3 text-xs text-slate-300">
        {summary.lastMessageSnippet || "No messages yet."}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">{formatTimestamp(summary.lastMessageAt)}</div>
    </button>
  );
}

function statusTone(status: string) {
  if (status === "accepted") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
  if (status === "declined") {
    return "border-red-400/30 bg-red-500/10 text-red-100";
  }
  return "border-amber-300/30 bg-amber-400/10 text-amber-100";
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
      ? `Read at ${formatTimestamp(message.receipt.readAt)}`
      : "Sent";

  return (
    <div className="mt-2 text-right text-[10px] italic text-slate-400/80">
      {copy}
    </div>
  );
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
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Accept Private
          </button>
          <button
            type="button"
            onClick={() => onInboxAction({ action: "decline_badge", badgeId: message.badge.id })}
            className="rounded-full border border-red-400/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10"
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
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:border-white/30 hover:text-white"
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
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:border-white/30 hover:text-white"
          >
            Accept Private
          </button>
          <button
            type="button"
            onClick={() => onInboxAction({ action: "decline_gift", giftId: message.gift.id })}
            className="rounded-full border border-red-400/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10"
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
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/85 transition hover:border-white/30 hover:text-white"
          >
            {message.gift.displayOnProfile ? "Hide Gift On Profile" : "Show Gift On Profile"}
          </button>
        </div>
      );
    }
  }

  return null;
}

function InboxEventCard({
  message,
  viewerUid,
  viewerIsAdmin,
  onInboxAction,
}: {
  message: ContactInboxMessage;
  viewerUid: string;
  viewerIsAdmin: boolean;
  onInboxAction: (action: Record<string, unknown>) => void;
}) {
  const isViewer = message.sender.uid === viewerUid;

  if (message.kind === "text" && message.body) {
    return (
      <div className={`flex ${isViewer ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[88%] rounded-2xl border px-4 py-3 ${
            isViewer
              ? "border-amber-300/30 bg-amber-400/12 text-amber-50"
              : "border-white/10 bg-white/5 text-slate-100"
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-300/80">
            <span>{message.sender.displayName}</span>
            <span>{formatTimestamp(message.createdAt)}</span>
          </div>

          {message.sender.badges.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {message.sender.badges.slice(0, 3).map((badge) => (
                <CommunityBadgePill key={badge.id} label={badge.label} />
              ))}
            </div>
          ) : null}

          <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
          <ReceiptLine message={message} />
        </div>
      </div>
    );
  }

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
      <div className="max-w-[92%] rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-4 text-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-300/80">
            {message.sender.displayName}
          </div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
            {formatTimestamp(message.createdAt)}
          </div>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone(honorStatus)}`}>
            {honorStatus}
          </span>
          {displayOnProfile ? (
            <span className="rounded-full border border-sky-300/30 bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-100">
              public
            </span>
          ) : null}
        </div>

        <div className="mt-3 text-base font-semibold text-white">{honorTitle}</div>
        <div className="mt-2 text-sm leading-6 text-slate-200">
          {note || "A new community item is waiting in your direct line."}
        </div>

        <HonorActions
          message={message}
          viewerIsAdmin={viewerIsAdmin}
          onInboxAction={onInboxAction}
        />
      </div>
    </div>
  );
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
  openPageHref,
}: ContactInboxPanelProps) {
  const counterpart = data?.activeCounterpart ?? null;
  const activeTargetUid = data?.activeTargetUid ?? null;
  const showConversationRail = Boolean(data?.viewer.isAdmin && (data?.summaries.length ?? 0) > 0);
  const unreadCount = data?.totalUnreadCount ?? 0;
  const heading = data?.viewer.isAdmin ? "Direct Threads" : counterpart?.displayName || "Private Thread";

  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/95 text-white shadow-2xl ${
        mode === "page" ? "min-h-[40rem]" : "w-[24rem] max-w-[calc(100vw-2rem)]"
      }`}
    >
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-200/70">
              {data?.viewer.isAdmin ? "Private Inbox" : "Direct Line"}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">{heading}</h2>
          </div>
          {unreadCount > 0 ? (
            <div className="rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-xs text-red-100">
              {unreadCount} unread
            </div>
          ) : null}
        </div>

        {counterpart ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
              {counterpart.isAdmin ? "Emaren admin thread" : "Private community line"}
            </span>
            {counterpart.giftedWolo > 0 ? (
              <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-amber-100">
                {counterpart.giftedWolo} WOLO live
              </span>
            ) : null}
            {counterpart.badges.map((badge) => (
              <CommunityBadgePill key={badge.id} label={badge.label} />
            ))}
          </div>
        ) : null}
      </div>

      <div className={mode === "page" && showConversationRail ? "grid min-h-[34rem] lg:grid-cols-[18rem_1fr]" : ""}>
        {showConversationRail ? (
          <aside className="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
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

        <div className="flex min-h-[22rem] flex-col">
          {!showConversationRail && (data?.summaries.length ?? 0) > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-white/10 px-4 py-3">
              {data?.summaries.map((summary) => (
                <button
                  key={summary.targetUid}
                  type="button"
                  onClick={() => onSelectConversation(summary.targetUid)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${
                    summary.targetUid === activeTargetUid
                      ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
                      : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {summary.displayName}
                  {summary.unreadCount > 0 ? ` (${summary.unreadCount})` : ""}
                </button>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                Loading the private line...
              </div>
            ) : error ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-5 text-sm text-red-100">
                {error}
              </div>
            ) : data?.unavailableReason ? (
              <div className="rounded-2xl border border-amber-300/30 bg-amber-400/10 px-4 py-5 text-sm text-amber-100">
                {data.unavailableReason}
              </div>
            ) : (data?.messages.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                {data?.viewer.isAdmin
                  ? "No messages in this thread yet."
                  : "No messages yet. Say hello."}
              </div>
            ) : (
              data?.messages.map((message) => (
                <InboxEventCard
                  key={message.id}
                  message={message}
                  viewerUid={data.viewer.uid}
                  viewerIsAdmin={data.viewer.isAdmin}
                  onInboxAction={onInboxAction}
                />
              ))
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="flex gap-3">
              <textarea
                value={body}
                onChange={(event) => onBodyChange(event.target.value)}
                placeholder={buildPrompt(data, counterpart?.displayName ?? null)}
                className="min-h-[3.8rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35 focus:bg-white/7"
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

            {openPageHref ? (
              <div className="mt-3 flex justify-end">
                <Link
                  href={openPageHref}
                  className="text-xs uppercase tracking-[0.24em] text-slate-400 transition hover:text-white"
                >
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
