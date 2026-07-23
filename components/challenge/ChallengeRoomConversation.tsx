"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import SteamLoginButton from "@/components/SteamLoginButton";
import { useUserAuth } from "@/context/UserAuthContext";

export type ChallengeRoomTimelineEntry = {
  id: number;
  eventType: string;
  label: string;
  detail: string | null;
  message: string | null;
  proofUrl: string | null;
  actorUid: string | null;
  actorName: string | null;
  createdAt: string;
};

type ChallengeRoomConversationProps = {
  challengeId: number;
  challengerUid: string;
  challengedUid: string;
  challengerName: string;
  challengedName: string;
  entries: ChallengeRoomTimelineEntry[];
};

function formatTimelineTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function markerTone(eventType: string) {
  if (eventType.includes("desync")) {
    return {
      line: "from-transparent via-fuchsia-300/28 to-transparent",
      pill: "border-fuchsia-200/20 bg-fuchsia-300/[0.08] text-fuchsia-50",
    };
  }

  if (
    eventType.includes("settlement") ||
    eventType.includes("wager_awarded") ||
    eventType.includes("refund_sent") ||
    eventType.includes("guarantee_awarded")
  ) {
    return {
      line: "from-transparent via-emerald-300/24 to-transparent",
      pill: "border-emerald-200/18 bg-emerald-300/[0.07] text-emerald-50",
    };
  }

  if (
    eventType.includes("title") ||
    eventType.includes("trophy") ||
    eventType.includes("artifact")
  ) {
    return {
      line: "from-transparent via-amber-300/28 to-transparent",
      pill: "border-amber-200/20 bg-amber-300/[0.08] text-amber-50",
    };
  }

  if (
    eventType === "live" ||
    eventType === "match_live" ||
    eventType.includes("completed")
  ) {
    return {
      line: "from-transparent via-cyan-300/24 to-transparent",
      pill: "border-cyan-200/18 bg-cyan-300/[0.07] text-cyan-50",
    };
  }

  return {
    line: "from-transparent via-white/14 to-transparent",
    pill: "border-white/10 bg-white/[0.035] text-slate-300",
  };
}

export default function ChallengeRoomConversation({
  challengeId,
  challengerUid,
  challengedUid,
  challengerName,
  challengedName,
  entries,
}: ChallengeRoomConversationProps) {
  const router = useRouter();
  const { uid, isAdmin, isAuthenticated, loading } = useUserAuth();

  const timelineRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const viewerIsChallenger = uid === challengerUid;
  const viewerIsChallenged = uid === challengedUid;

  const canPost =
    Boolean(isAuthenticated) &&
    (viewerIsChallenger || viewerIsChallenged || Boolean(isAdmin));

  useEffect(() => {
    const node = timelineRef.current;

    if (!node) {
      return;
    }

    node.scrollTo({
      top: node.scrollHeight,
      behavior: entries.length > 1 ? "smooth" : "auto",
    });
  }, [entries.length]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = message.trim();

    if (!body || sending || !canPost) {
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/challenges/${challengeId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "room_message",
          message: body,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(payload.detail || "The Match Room message could not be posted.");
      }

      setMessage("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Match Room message could not be posted."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-amber-100/16 bg-[linear-gradient(180deg,rgba(5,12,25,0.96),rgba(2,6,15,0.98))] shadow-[0_25px_90px_rgba(0,0,0,0.42)]">
      <div className="border-b border-white/8 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.32em] text-amber-100/48">
              Public Match Room
            </div>

            <h2 className="mt-1 font-serif text-xl font-semibold text-white">
              Match #{challengeId} Chronicle
            </h2>

            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
              {challengerName} vs {challengedName} · negotiations, protocol events,
              result truth, settlement, and championship history in one chronological record.
            </p>
          </div>

          <div className="rounded-full border border-emerald-200/12 bg-emerald-300/[0.055] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100/75">
            Public read · Duelists + Commissioner write
          </div>
        </div>
      </div>

      <div
        ref={timelineRef}
        className="h-[42rem] max-h-[72vh] min-h-[30rem] overflow-y-auto scroll-smooth px-4 py-6 sm:px-7"
      >
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div>
              <div className="text-sm font-black text-white">
                The Match Chronicle begins here.
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Challenge activity and player conversation will appear in chronological order.
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const isRoomMessage =
                entry.eventType === "room_message" && Boolean(entry.message);

              if (isRoomMessage) {
                const fromChallenger = entry.actorUid === challengerUid;
                const fromChallenged = entry.actorUid === challengedUid;
                const fromCommissioner =
                  !fromChallenger && !fromChallenged && Boolean(entry.actorUid);

                const align = fromCommissioner
                  ? "justify-center"
                  : fromChallenged
                    ? "justify-end"
                    : "justify-start";

                const bubble = fromCommissioner
                  ? "max-w-[82%] border-amber-200/16 bg-amber-300/[0.07]"
                  : fromChallenged
                    ? "max-w-[82%] border-emerald-200/14 bg-emerald-300/[0.065]"
                    : "max-w-[82%] border-cyan-200/12 bg-cyan-300/[0.055]";

                return (
                  <div key={`message-${entry.id}`} className={`flex ${align}`}>
                    <div className={`rounded-[1.2rem] border px-4 py-3 ${bubble}`}>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-black text-white">
                          {entry.actorName || "AoE2WAR"}
                        </span>

                        {fromCommissioner ? (
                          <span className="rounded-full border border-amber-200/14 bg-amber-300/[0.08] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-amber-100">
                            Commissioner
                          </span>
                        ) : null}

                        <span className="text-[9px] text-slate-500">
                          {formatTimelineTime(entry.createdAt)}
                        </span>
                      </div>

                      <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                        {entry.message}
                      </div>
                    </div>
                  </div>
                );
              }

              const tone = markerTone(entry.eventType);
              const secondary =
                entry.detail && entry.detail !== entry.label
                  ? entry.detail
                  : null;

              return (
                <div
                  key={`event-${entry.id}`}
                  className="flex items-center gap-3 py-1"
                >
                  <div
                    className={`h-px min-w-4 flex-1 bg-gradient-to-r ${tone.line}`}
                  />

                  <div className="max-w-[78%] text-center">
                    <div
                      className={`inline-flex items-center rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${tone.pill}`}
                    >
                      {entry.label}
                    </div>

                    {secondary ? (
                      <div className="mt-1 text-[10px] leading-4 text-slate-500">
                        {secondary}
                      </div>
                    ) : null}

                    <div className="mt-1 text-[9px] uppercase tracking-[0.14em] text-slate-600">
                      {entry.actorName ? `${entry.actorName} · ` : ""}
                      {formatTimelineTime(entry.createdAt)}
                    </div>

                    {entry.proofUrl ? (
                      <a
                        href={entry.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex text-[10px] font-black text-emerald-200/72 transition hover:text-emerald-100"
                      >
                        Open proof ↗
                      </a>
                    ) : null}
                  </div>

                  <div
                    className={`h-px min-w-4 flex-1 bg-gradient-to-r ${tone.line}`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-white/8 bg-black/20 p-4 sm:p-5">
        {loading ? (
          <div className="text-sm text-slate-500">
            Checking Match Room permissions…
          </div>
        ) : canPost ? (
          <form onSubmit={submitMessage}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
                Add to Match #{challengeId}
              </div>

              <div className="text-[9px] text-slate-600">
                {message.length}/2000
              </div>
            </div>

            <div className="flex items-end gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.025] p-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value.slice(0, 2000))}
                placeholder={
                  isAdmin
                    ? "Post to the public Match Chronicle…"
                    : "Message your opponent in the Match Room…"
                }
                rows={2}
                className="min-h-[3.25rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-slate-600"
              />

              <button
                type="submit"
                disabled={sending || message.trim().length === 0}
                className="rounded-full border border-amber-200/18 bg-amber-300/80 px-5 py-2.5 text-xs font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {sending ? "Posting…" : "Post"}
              </button>
            </div>

            {error ? (
              <div className="mt-2 text-xs font-semibold text-rose-300">
                {error}
              </div>
            ) : null}
          </form>
        ) : !isAuthenticated ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-white">
                This Match Room is public.
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Everyone can follow the battle story. Only the duelists and Commissioner can post.
              </div>
            </div>

            <SteamLoginButton />
          </div>
        ) : (
          <div>
            <div className="text-sm font-black text-white">
              Public spectator view
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Follow the complete Challenge Chronicle here. Posting is reserved for the duelists and Commissioner.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
