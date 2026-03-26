"use client";

import Link from "next/link";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import type { ContactInboxPayload, ContactInboxSummary } from "@/components/contact/types";

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
  openPageHref,
}: ContactInboxPanelProps) {
  const counterpart = data?.activeCounterpart ?? null;
  const activeTargetUid = data?.activeTargetUid ?? null;
  const showConversationRail = Boolean(data?.viewer.isAdmin && (data?.summaries.length ?? 0) > 0);

  return (
    <div
      className={`overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950/95 text-white shadow-2xl ${
        mode === "page" ? "min-h-[42rem]" : "w-[24rem] max-w-[calc(100vw-2rem)]"
      }`}
    >
      <div className="border-b border-white/10 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-amber-200/70">
              {data?.viewer.isAdmin ? "Private Inbox" : "Contact Emaren"}
            </div>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {data?.viewer.isAdmin ? "Direct Threads" : "1 on 1 conversation"}
            </h2>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            {data?.totalUnreadCount ?? 0} unread
          </div>
        </div>

        {counterpart ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{counterpart.displayName}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  {counterpart.isAdmin ? "Emaren admin thread" : "Direct community line"}
                </div>
              </div>
              {counterpart.giftedWolo > 0 ? (
                <div className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-100">
                  {counterpart.giftedWolo} WOLO
                </div>
              ) : null}
            </div>

            {counterpart.badges.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {counterpart.badges.map((badge) => (
                  <CommunityBadgePill key={badge.id} label={badge.label} />
                ))}
              </div>
            ) : null}
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
                  ? "No messages in this thread yet. Once either side says hello, the private line begins here."
                  : "No messages yet. This is your direct line to Emaren."}
              </div>
            ) : (
              data?.messages.map((message) => {
                const isViewer = message.sender.uid === data.viewer.uid;
                return (
                  <div
                    key={message.id}
                    className={`flex ${isViewer ? "justify-end" : "justify-start"}`}
                  >
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
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-white/10 px-4 py-4">
            <div className="flex gap-3">
              <textarea
                value={body}
                onChange={(event) => onBodyChange(event.target.value)}
                placeholder={buildPrompt(data, counterpart?.displayName ?? null)}
                className="min-h-[4.25rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/35 focus:bg-white/7"
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
