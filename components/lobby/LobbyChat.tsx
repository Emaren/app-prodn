"use client";

import { type CSSProperties, type ReactNode, type RefObject } from "react";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type { ChatRenderItem } from "@/components/lobby/utils";
import { displayName } from "@/components/lobby/utils";

type LobbyChatProps = {
  style?: CSSProperties;
  chatRoomTitle: string;
  messagesCount: number;
  chatItems: ChatRenderItem[];
  chatScrollRef: RefObject<HTMLDivElement | null>;
  chatError: string | null;
  isAuthenticated: boolean;
  playerName: string | null;
  currentUserInGameName: string | null;
  currentUserSteamPersonaName: string | null;
  messageBody: string;
  chatPending: boolean;
  onMessageBodyChange: (value: string) => void;
  onSendMessage: () => void;
  onLogin: () => void;
};

export function LobbyChat({
  style,
  chatRoomTitle,
  messagesCount,
  chatItems,
  chatScrollRef,
  chatError,
  isAuthenticated,
  playerName,
  currentUserInGameName,
  currentUserSteamPersonaName,
  messageBody,
  chatPending,
  onMessageBodyChange,
  onSendMessage,
  onLogin,
}: LobbyChatProps) {
  return (
    <div
      className="flex min-h-[34rem] min-w-0 flex-col rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6"
      style={style}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Chat</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{chatRoomTitle}</h3>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {messagesCount} recent
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border border-white/8 bg-white/5 p-3">
          <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {chatItems.length === 0 ? (
              <div className="rounded-xl bg-slate-950/70 px-4 py-5 text-sm text-slate-300">
                No messages yet. The first tournament chatter starts here.
              </div>
            ) : (
              chatItems.map((item) =>
                item.type === "divider" ? (
                  <ChatDateDivider key={item.key} label={item.label} />
                ) : (
                  <div key={item.key} className="rounded-xl bg-slate-950/70 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">
                        {displayName(item.message.user.inGameName, item.message.user.steamPersonaName)}
                      </div>

                      <div className="text-xs text-slate-400">
                        {new Date(item.message.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.message.user.verificationLevel > 0 ? (
                        <SteamLinkedBadge compact />
                      ) : (
                        <MiniIdentityPill>Unverified</MiniIdentityPill>
                      )}

                      {item.message.user.verified ? (
                        <MiniIdentityPill>Replay verified</MiniIdentityPill>
                      ) : null}
                    </div>

                    <p className="mt-3 text-sm leading-6 text-slate-200">{item.message.body}</p>
                  </div>
                )
              )
            )}
          </div>
        </div>

        {chatError && (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {chatError}
          </div>
        )}

        <div className="rounded-[1.5rem] border border-white/8 bg-white/5 p-3">
          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="text-sm text-slate-300">
                Chatting as {playerName || displayName(currentUserInGameName, currentUserSteamPersonaName)}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={messageBody}
                  onChange={(event) => onMessageBodyChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      onSendMessage();
                    }
                  }}
                  maxLength={280}
                  placeholder="Call out the matchup, look for practice games, or talk bracket."
                  className="min-w-0 flex-1 rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-300/50"
                />

                <button
                  type="button"
                  onClick={onSendMessage}
                  disabled={chatPending || messageBody.trim().length === 0}
                  className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {chatPending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-slate-300">
                Sign in to join the live lobby instead of just watching it.
              </div>

              <button
                type="button"
                onClick={onLogin}
                className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
              >
                Sign In To Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatDateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className="h-px flex-1 bg-white/10" />
      <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function MiniIdentityPill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-slate-300">
      {children}
    </span>
  );
}
