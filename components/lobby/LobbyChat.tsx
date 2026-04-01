"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import type { ChatRenderItem } from "@/components/lobby/utils";
import { displayName } from "@/components/lobby/utils";
import {
  AI_MODEL_OPTIONS,
  type AiModelId,
  type AiVisibilityOption,
} from "@/lib/aiConciergeConfig";
import { LOBBY_MESSAGE_REACTIONS } from "@/lib/lobbyReactionConfig";

type LobbyChatProps = {
  style?: CSSProperties;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  chatRoomTitle: string;
  messagesCount: number;
  chatItems: ChatRenderItem[];
  chatScrollRef: RefObject<HTMLDivElement | null>;
  chatError: string | null;
  chatNotice: string | null;
  isAuthenticated: boolean;
  playerName: string | null;
  currentUserInGameName: string | null;
  currentUserSteamPersonaName: string | null;
  messageBody: string;
  chatPending: boolean;
  reactingMessageId: number | null;
  aiEnabled: boolean;
  aiVisibility: AiVisibilityOption;
  aiModel: AiModelId;
  onMessageBodyChange: (value: string) => void;
  onSendMessage: () => void;
  onAiEnabledChange: (value: boolean) => void;
  onAiVisibilityChange: (value: AiVisibilityOption) => void;
  onAiModelChange: (value: AiModelId) => void;
  onToggleReaction: (messageId: number, emoji: string) => void;
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
  chatNotice,
  isAuthenticated,
  playerName,
  currentUserInGameName,
  currentUserSteamPersonaName,
  messageBody,
  chatPending,
  reactingMessageId,
  aiEnabled,
  aiVisibility,
  aiModel,
  onMessageBodyChange,
  onSendMessage,
  onAiEnabledChange,
  onAiVisibilityChange,
  onAiModelChange,
  onToggleReaction,
  onLogin,
}: LobbyChatProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);

  return (
    <div
      className={`flex min-h-[31rem] min-w-0 max-h-[min(86dvh,46rem)] flex-col rounded-[1.75rem] border p-4 sm:min-h-[34rem] sm:max-h-[50rem] sm:p-5 lg:min-h-[34rem] lg:max-h-none lg:p-6 ${tone.panelShell}`}
      style={style}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Chat</div>
          <h3 className="mt-2 text-2xl font-semibold text-white">{chatRoomTitle}</h3>
        </div>

        <div className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
          {messagesCount} recent
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-4">
        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border p-3 sm:p-4 ${tone.insetPanel}`}
        >
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
                  <LobbyMessageCard
                    key={item.key}
                    item={item}
                    tone={tone}
                    isAuthenticated={isAuthenticated}
                    reactingMessageId={reactingMessageId}
                    onToggleReaction={onToggleReaction}
                  />
                )
              )
            )}
          </div>
        </div>

        {chatNotice && !chatError ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-400/8 px-4 py-3 text-sm text-amber-50/90">
            {chatNotice}
          </div>
        ) : null}

        {chatError ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {chatError}
          </div>
        ) : null}

        <div className={`rounded-[1.5rem] border px-3 py-3 sm:px-4 sm:py-4 ${tone.insetPanel}`}>
          {isAuthenticated ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  Chatting as
                </div>
                <div className="text-xl font-semibold text-white">
                  {playerName || displayName(currentUserInGameName, currentUserSteamPersonaName)}
                </div>
              </div>

              <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.035] px-3 py-3.5 text-sm text-slate-200 sm:px-4">
                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <label className="inline-flex flex-wrap items-center gap-3 text-sm text-white">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/18 bg-amber-300/12 text-amber-200">
                        <input
                          type="checkbox"
                          checked={aiEnabled}
                          onChange={(event) => onAiEnabledChange(event.target.checked)}
                          className="h-4 w-4 rounded border-white/20 bg-transparent accent-amber-300"
                        />
                      </span>
                      <span className="space-y-0.5">
                        <span className="block text-lg font-semibold text-white">AI response</span>
                        <span className="block text-xs text-slate-400">
                          Keep the concierge in the loop for this message.
                        </span>
                      </span>
                    </label>

                    <label className="flex min-w-0 flex-col gap-2 text-[11px] uppercase tracking-[0.26em] text-slate-500">
                      <span>Model</span>
                      <select
                        value={aiModel}
                        onChange={(event) => onAiModelChange(event.target.value as AiModelId)}
                        disabled={!aiEnabled}
                        className="h-11 min-w-0 rounded-full border border-white/10 bg-[#0d1524] px-4 text-sm font-medium tracking-normal text-white outline-none disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[15rem]"
                      >
                        {AI_MODEL_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">
                      AI lane
                    </div>
                    <div className="inline-flex w-fit rounded-full border border-white/10 bg-[#0b1322] p-1">
                      {(["private", "public"] as const).map((option) => (
                        <button
                          key={option}
                          type="button"
                          onClick={() => onAiVisibilityChange(option)}
                          disabled={!aiEnabled}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] transition sm:px-4 ${
                            aiVisibility === option
                              ? "bg-amber-300 text-slate-950"
                              : "text-slate-300 hover:text-white"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          {option === "private" ? "Private AI" : "Public AI"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1 rounded-[1.3rem] border border-white/8 bg-[#09111d]/75 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
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
                    className={`min-w-0 w-full rounded-full border px-4 py-3.5 text-sm outline-none ${tone.input}`}
                  />
                </div>

                <button
                  type="button"
                  onClick={onSendMessage}
                  disabled={chatPending || messageBody.trim().length === 0}
                  className={`min-h-[3.5rem] rounded-full px-6 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[6.75rem] ${tone.primaryButton}`}
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

function LobbyMessageCard({
  item,
  tone,
  isAuthenticated,
  reactingMessageId,
  onToggleReaction,
}: {
  item: Extract<ChatRenderItem, { type: "message" }>;
  tone: ReturnType<typeof getLobbyPresentationTone>;
  isAuthenticated: boolean;
  reactingMessageId: number | null;
  onToggleReaction: (messageId: number, emoji: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isAi = item.message.user.isAi;

  useEffect(() => {
    if (!pickerOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [pickerOpen]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
    };
  }, []);

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
      setPickerOpen(true);
    }, 360);
  }

  function handleCardTap() {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setPickerOpen((current) => !current);
  }

  function handleReactionToggle(event: MouseEvent<HTMLButtonElement>, emoji: string) {
    event.stopPropagation();
    onToggleReaction(item.message.id, emoji);
    setPickerOpen(false);
  }

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-visible rounded-xl border px-4 py-4 ${tone.subduedCard}`}
      onClick={handleCardTap}
      onPointerDown={(event) => beginLongPress(event.pointerType)}
      onPointerUp={clearHoldTimer}
      onPointerCancel={clearHoldTimer}
      onPointerLeave={clearHoldTimer}
    >
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
        {isAi ? (
          <MiniIdentityPill toneClassName="border-cyan-400/20 bg-cyan-400/10 text-cyan-50">
            AI concierge
          </MiniIdentityPill>
        ) : item.message.user.verificationLevel > 0 ? (
          <SteamLinkedBadge compact />
        ) : (
          <MiniIdentityPill toneClassName={tone.neutralPill}>Unverified</MiniIdentityPill>
        )}

        {!isAi && item.message.user.verified ? (
          <MiniIdentityPill toneClassName={tone.neutralPill}>Replay verified</MiniIdentityPill>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-6 text-slate-200">{item.message.body}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.message.reactions.map((reaction) => {
          const tooltip =
            isAuthenticated && (reaction.users.length > 0 || reaction.anonymousCount > 0)
              ? formatReactionTooltip(reaction)
              : undefined;

          return (
            <button
              key={`${item.message.id}-${reaction.emoji}-summary`}
              type="button"
              onClick={(event) => handleReactionToggle(event, reaction.emoji)}
              title={tooltip}
              aria-pressed={reaction.viewerReacted}
              disabled={reactingMessageId === item.message.id}
              className={`inline-flex min-w-[3rem] items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
                reaction.viewerReacted
                  ? "border-amber-300/20 bg-amber-400/12 text-amber-100"
                  : "border-white/10 bg-[#0c1524] text-slate-300 hover:border-white/18 hover:text-white"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span>{reaction.emoji}</span>
              <span>{reaction.count}</span>
            </button>
          );
        })}
      </div>

      <div
        className={`absolute left-4 top-full z-30 mt-2 transition-all duration-150 ${
          pickerOpen
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100"
        }`}
      >
        <div className="inline-flex max-w-[calc(100vw-6rem)] flex-wrap items-center gap-2 rounded-full border border-white/10 bg-[#091321] px-2.5 py-2 shadow-[0_18px_40px_rgba(2,6,23,0.4)]">
          {LOBBY_MESSAGE_REACTIONS.map((emoji) => {
            const existing = item.message.reactions.find((reaction) => reaction.emoji === emoji);
            const isActive = Boolean(existing?.viewerReacted);
            return (
              <button
                key={`${item.message.id}-${emoji}`}
                type="button"
                onClick={(event) => handleReactionToggle(event, emoji)}
                aria-pressed={isActive}
                disabled={reactingMessageId === item.message.id}
                className={`flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-sm transition ${
                  isActive
                    ? "border-amber-300/30 bg-amber-400/16 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.12)]"
                    : "border-white/10 bg-white/[0.045] text-slate-200 hover:border-white/18 hover:bg-white/[0.1] hover:text-white"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span>{emoji}</span>
              </button>
            );
          })}
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

function MiniIdentityPill({
  children,
  toneClassName,
}: {
  children: ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}

function formatReactionTooltip(reaction: {
  users: Array<{ displayName: string }>;
  anonymousCount: number;
}) {
  const named = reaction.users.map((user) => user.displayName);
  if (reaction.anonymousCount > 0) {
    named.push(`${reaction.anonymousCount} guest${reaction.anonymousCount === 1 ? "" : "s"}`);
  }
  return named.join(", ");
}
