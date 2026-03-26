"use client";

import { type CSSProperties, type ReactNode, type RefObject } from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type { ChatRenderItem } from "@/components/lobby/utils";
import { displayName } from "@/components/lobby/utils";

type LobbyChatProps = {
  style?: CSSProperties;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
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
  themeKey,
  viewMode,
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
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <div
      className={`flex min-h-[34rem] min-w-0 flex-col rounded-[1.75rem] border p-6 ${tone.panelShell}`}
      style={style}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.35em] text-white/45">Chat</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{chatRoomTitle}</h3>
        </div>

        <div className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
          {messagesCount} recent
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3">
        <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border p-3 ${tone.insetPanel}`}>
          <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {chatItems.length === 0 ? (
              <div className={`rounded-xl border px-4 py-5 text-sm text-slate-300 ${tone.subduedCard}`}>
                No messages yet. The first tournament chatter starts here.
              </div>
            ) : (
              chatItems.map((item) =>
                item.type === "divider" ? (
                  <ChatDateDivider key={item.key} label={item.label} dividerClassName={tone.divider} />
                ) : (
                  <div key={item.key} className={`rounded-xl border px-4 py-4 ${tone.subduedCard}`}>
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

        <div className={`rounded-[1.5rem] border p-3 ${tone.insetPanel}`}>
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
                  className={`min-w-0 flex-1 rounded-full border px-4 py-3 text-sm outline-none ${tone.input}`}
                />

                <button
                  type="button"
                  onClick={onSendMessage}
                  disabled={chatPending || messageBody.trim().length === 0}
                  className={`rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tone.primaryButton}`}
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
                className={`rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
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

function ChatDateDivider({
  label,
  dividerClassName,
}: {
  label: string;
  dividerClassName: string;
}) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <div className={`h-px flex-1 border-t ${dividerClassName}`} />
      <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>
      <div className={`h-px flex-1 border-t ${dividerClassName}`} />
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
