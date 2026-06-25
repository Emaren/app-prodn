"use client";

import Image from "next/image";
import { formatLobbyMoment } from "@/components/lobby/utils";
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
import type { AiVisibilityOption } from "@/lib/aiConciergeConfig";
import AutoGrowTextarea from "@/components/ui/AutoGrowTextarea";
import { LOBBY_MESSAGE_MAX_CHARS } from "@/lib/lobby";
import { LOBBY_MESSAGE_REACTIONS } from "@/lib/lobbyReactionConfig";
import { avatarThumbUrlForUser } from "@/lib/avatarAssets";

const TYPING_HUD_MODE_STORAGE_KEY = "aoe2war:typing-hud-mode";

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
  currentUserUid: string | null;
  currentUserIsAdmin: boolean;
  messageBody: string;
  chatPending: boolean;
  reactingMessageId: number | null;
  moderatingMessageId: number | null;
  aiEnabled: boolean;
  aiVisibility: AiVisibilityOption;
  aiScribeEnabled: boolean;
  aiGrimerEnabled: boolean;
  onMessageBodyChange: (value: string) => void;
  onSendMessage: () => void;
  onAiEnabledChange: (value: boolean) => void;
  onAiVisibilityChange: (value: AiVisibilityOption) => void;
  onAiScribeEnabledChange: (value: boolean) => void;
  onAiGrimerEnabledChange: (value: boolean) => void;
  onToggleReaction: (messageId: number, emoji: string) => void;
  onEditMessage: (messageId: number, body: string) => void;
  onDeleteMessage: (messageId: number) => void;
  onLogin: () => void;
  surface?: "standard" | "extreme";
};

export function LobbyChat(props: LobbyChatProps) {
  const {
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
    currentUserUid,
    currentUserIsAdmin,
    messageBody,
    chatPending,
    reactingMessageId,
    moderatingMessageId,
    aiEnabled,
    aiScribeEnabled,
    aiGrimerEnabled,
    onMessageBodyChange,
    onSendMessage,
    onAiEnabledChange,
    onAiScribeEnabledChange,
    onAiGrimerEnabledChange,
    onToggleReaction,
    onEditMessage,
    onDeleteMessage,
    onLogin,
    surface = "standard",
  } = props;

  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";
  const [showChatJump, setShowChatJump] = useState(false);
  const [typingHudMode, setTypingHudMode] = useState<"steady" | "pulse">("steady");
  const [ownTypingPulse, setOwnTypingPulse] = useState(false);
  const ownTypingPulseTimerRef = useRef<number | null>(null);
  const lastMessageBodyForTypingPulseRef = useRef(messageBody);

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
      } else if (messageBody.trim()) {
        window.setTimeout(() => pulseOwnTypingHud(), 0);
      }

      return next;
    });
  }

  function updateChatJumpButton() {
    const viewport = chatScrollRef.current;
    if (!viewport) return;

    const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    const shouldShow = distanceFromBottom > 140;

    setShowChatJump((current) => (current === shouldShow ? current : shouldShow));
  }

  function scrollChatToBottom(behavior: ScrollBehavior = "smooth") {
    const viewport = chatScrollRef.current;
    if (!viewport) return;

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior,
    });

    setShowChatJump(false);
  }

  function handleChatScroll() {
    updateChatJumpButton();
  }

  const viewerName =
    playerName || displayName(currentUserInGameName, currentUserSteamPersonaName) || "You";

  const premiumTypingHud = typingHudMode === "pulse";
  const ownTypingSteadyLabel =
    messageBody.trim().length > 0 ? `${viewerName} is typing…` : null;
  const ownTypingPulseLabel =
    ownTypingPulse && messageBody.trim().length > 0 ? `${viewerName} is typing…` : null;
  const typingLabel =
    chatPending
      ? aiEnabled && (aiScribeEnabled || aiGrimerEnabled)
        ? `${aiScribeEnabled ? "The AI Scribe" : "Grimer"} is typing…`
        : "The lobby is typing…"
      : premiumTypingHud
        ? ownTypingPulseLabel
        : ownTypingSteadyLabel;

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
      lastMessageBodyForTypingPulseRef.current = messageBody;
      return;
    }

    if (messageBody !== lastMessageBodyForTypingPulseRef.current) {
      lastMessageBodyForTypingPulseRef.current = messageBody;

      if (messageBody.trim()) {
        pulseOwnTypingHud();
      } else {
        setOwnTypingPulse(false);
      }
    }
  }, [messageBody, typingHudMode]);

  return (
    <div
      className={`flex h-[min(76dvh,46rem)] min-h-[28rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[1.75rem] border p-4 sm:h-[min(78dvh,48rem)] sm:min-h-[30rem] sm:p-5 lg:h-[min(78dvh,50rem)] lg:min-h-[32rem] lg:p-6 ${
        isExtreme
          ? "border-amber-200/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[0_26px_88px_rgba(0,0,0,0.28)]"
          : tone.panelShell
      }`}
      style={style}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Chat</div>
          <h3 className="mt-1.5 min-w-0 truncate whitespace-nowrap text-[clamp(1.35rem,4.8vw,2rem)] font-semibold leading-tight text-white">
            {chatRoomTitle}
          </h3>
        </div>

        <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
          {messagesCount} recent
        </div>
      </div>

      <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden">
        <div
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border p-3 sm:p-4 ${tone.insetPanel}`}
        >
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="min-h-0 min-w-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto pb-12 pr-1">
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
                    currentUserUid={currentUserUid}
                    currentUserIsAdmin={currentUserIsAdmin}
                    reactingMessageId={reactingMessageId}
                    moderatingMessageId={moderatingMessageId}
                    onToggleReaction={onToggleReaction}
                    onEditMessage={onEditMessage}
                    onDeleteMessage={onDeleteMessage}
                  />
                )
              )
            )}
          </div>

          {showChatJump ? (
            <button
              type="button"
              onClick={() => scrollChatToBottom("smooth")}
              className="absolute bottom-4 left-1/2 z-20 inline-flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-emerald-200/18 bg-[#07111f]/88 text-sm font-black text-emerald-100/82 shadow-[0_12px_32px_rgba(0,0,0,0.30),inset_0_0_0_1px_rgba(110,231,183,0.08)] backdrop-blur-md transition hover:border-emerald-200/30 hover:bg-[#0b1828] hover:text-emerald-50"
              aria-label="Scroll to latest lobby message"
            >
              <span aria-hidden="true">↓</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={toggleTypingHudMode}
            className={`absolute bottom-5 left-5 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full opacity-45 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-200/25 ${
              premiumTypingHud ? "bg-emerald-300/[0.055]" : "bg-white/[0.025]"
            }`}
            aria-label="Toggle typing display"
            aria-pressed={premiumTypingHud}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full transition ${
                premiumTypingHud
                  ? "bg-emerald-200/80 shadow-[0_0_12px_rgba(110,231,183,0.45)]"
                  : "bg-slate-400/28 shadow-[0_0_8px_rgba(148,163,184,0.16)]"
              }`}
              aria-hidden="true"
            />
          </button>

          {typingLabel ? (
            <div className="pointer-events-none mt-2 flex shrink-0 justify-center px-1 text-center">
              <div className="inline-flex max-w-full items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-100/70">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/80 shadow-[0_0_10px_rgba(110,231,183,0.45)]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/50 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300/30 [animation-delay:240ms]" />
                </span>
                <span className="truncate">{typingLabel}</span>
              </div>
            </div>
          ) : null}
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

        <div className="rounded-[1.4rem] px-1 py-1 sm:px-1.5 sm:py-1">
          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  Chatting as
                </div>
                <div className="truncate text-sm font-semibold text-white">
                  {playerName || displayName(currentUserInGameName, currentUserSteamPersonaName)}
                </div>
              </div>

              <div className="rounded-[1.25rem] bg-[#10192a]/72 px-2.5 py-2.5 text-sm text-slate-200 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <div className="flex justify-end">
                    <AiVoicePill
                      label="The AI Scribe"
                      checked={aiScribeEnabled}
                      disabled={!aiEnabled}
                      onToggle={() => onAiScribeEnabledChange(!aiScribeEnabled)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => onAiEnabledChange(!aiEnabled)}
                    aria-pressed={aiEnabled}
                    aria-label={aiEnabled ? "House voices enabled" : "House voices disabled"}
                    title={aiEnabled ? "House voices enabled" : "House voices disabled"}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                      aiEnabled
                        ? "border-emerald-300/30 bg-emerald-400/14 text-emerald-100 shadow-[0_0_18px_rgba(52,211,153,0.18)]"
                        : "border-red-300/24 bg-red-400/10 text-red-100 shadow-[0_0_18px_rgba(248,113,113,0.12)]"
                    }`}
                  >
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
                      <path
                        d="M10 2.75v5.5"
                        stroke="currentColor"
                        strokeWidth="1.44"
                        strokeLinecap="round"
                      />
                      <path
                        d="M6.35 5.2a6 6 0 1 0 7.3 0"
                        stroke="currentColor"
                        strokeWidth="1.44"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  <div className="flex justify-start">
                    <AiVoicePill
                      label="Grimer"
                      checked={aiGrimerEnabled}
                      disabled={!aiEnabled}
                      onToggle={() => onAiGrimerEnabledChange(!aiGrimerEnabled)}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1 rounded-[1.2rem] bg-[#09111d]/75 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
                  <AutoGrowTextarea
                    value={messageBody}
                    maxRows={4}
                    maxLength={LOBBY_MESSAGE_MAX_CHARS}
                    onChange={(event) =>
                      onMessageBodyChange(event.target.value.slice(0, LOBBY_MESSAGE_MAX_CHARS))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        onSendMessage();
                      }
                    }}
                    placeholder="Message the lobby..."
                    className={`min-w-0 w-full rounded-[1rem] border px-4 py-3 text-sm leading-6 outline-none ${tone.input}`}
                  />
                </div>

                  <button
                    type="button"
                    onClick={onSendMessage}
                    disabled={chatPending || messageBody.trim().length === 0}
                    className={`flex min-h-[3.25rem] w-[3.25rem] shrink-0 items-center justify-center rounded-full text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tone.primaryButton}`}
                    aria-label={chatPending ? "Sending message" : "Send message"}
                    title={chatPending ? "Sending..." : "Send"}
                  >
                    {chatPending ? (
                      <span className="h-4 w-4 animate-pulse rounded-full bg-current/70" />
                    ) : (
                      <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
                        <path
                          d="M3.25 10.35 16.5 3.75l-4.1 12.5-2.45-5.05-5.25-1.15Z"
                          stroke="currentColor"
                          strokeWidth="1.55"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="m9.95 11.2 2.8-2.95"
                          stroke="currentColor"
                          strokeWidth="1.55"
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                  </button>
              </div>

              <div className="flex justify-end text-[11px] uppercase tracking-[0.18em] text-slate-600">
                {messageBody.length}/{LOBBY_MESSAGE_MAX_CHARS}
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

function AiVoicePill({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      className={`inline-flex h-10 w-[9.75rem] max-w-full items-center justify-center rounded-full px-4 text-center text-[11px] font-medium uppercase tracking-[0.16em] transition ${
        checked
          ? "bg-[#132338] text-cyan-50 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.14)]"
          : "bg-[#0d1524]/90 text-slate-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)] hover:bg-[#10192a] hover:text-white"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

function LobbyMessageCard({
  item,
  tone,
  isAuthenticated,
  currentUserUid,
  currentUserIsAdmin,
  reactingMessageId,
  moderatingMessageId,
  onToggleReaction,
  onEditMessage,
  onDeleteMessage,
}: {
  item: Extract<ChatRenderItem, { type: "message" }>;
  tone: ReturnType<typeof getLobbyPresentationTone>;
  isAuthenticated: boolean;
  currentUserUid: string | null;
  currentUserIsAdmin: boolean;
  reactingMessageId: number | null;
  moderatingMessageId: number | null;
  onToggleReaction: (messageId: number, emoji: string) => void;
  onEditMessage: (messageId: number, body: string) => void;
  onDeleteMessage: (messageId: number) => void;
}) {
  const [pickerPinnedOpen, setPickerPinnedOpen] = useState(false);
  const [pickerHovered, setPickerHovered] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isAi = item.message.user.isAi;
  const canManageMessage =
    currentUserIsAdmin || (currentUserUid !== null && item.message.user.uid === currentUserUid);
  const aiLabel =
    displayName(item.message.user.inGameName, item.message.user.steamPersonaName) || "The AI Scribe";
  const authorName = displayName(item.message.user.inGameName, item.message.user.steamPersonaName) || aiLabel;
  const avatarSrc = avatarThumbUrlForUser(item.message.user.uid, authorName);

  useEffect(() => {
    if (!pickerPinnedOpen || typeof document === "undefined") {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setPickerPinnedOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [pickerPinnedOpen]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearHoverCloseTimer();
    };
  }, []);

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
      setPickerPinnedOpen(true);
    }, 360);
  }

  function handleCardTap() {
    if (prefersHover()) {
      return;
    }
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    setPickerPinnedOpen((current) => !current);
  }

  function handleDesktopHoverStart() {
    if (!prefersHover()) return;
    clearHoverCloseTimer();
    setPickerHovered(true);
  }

  function handleDesktopHoverEnd() {
    if (!prefersHover()) return;
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      setPickerHovered(false);
    }, 140);
  }

  function handleReactionToggle(event: MouseEvent<HTMLButtonElement>, emoji: string) {
    event.stopPropagation();
    onToggleReaction(item.message.id, emoji);
    setPickerPinnedOpen(false);
  }

  function handleReactionHandleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearHoverCloseTimer();
    setPickerPinnedOpen((current) => !current);
  }

  function handleEditClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const nextBody = window.prompt("Edit lobby message", item.message.body);
    if (nextBody === null) {
      return;
    }
    onEditMessage(item.message.id, nextBody);
    setPickerPinnedOpen(false);
  }

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const confirmed = window.confirm("Delete this lobby message?");
    if (!confirmed) {
      return;
    }
    onDeleteMessage(item.message.id);
    setPickerPinnedOpen(false);
  }

  const pickerVisible = pickerPinnedOpen || pickerHovered;

  return (
    <div
      ref={cardRef}
      className={`group relative overflow-hidden rounded-xl border px-4 py-4 ${tone.subduedCard}`}
      onClick={handleCardTap}
      onPointerDown={(event) => beginLongPress(event.pointerType)}
      onPointerUp={clearHoldTimer}
      onPointerCancel={clearHoldTimer}
      onPointerLeave={clearHoldTimer}
      onMouseEnter={handleDesktopHoverStart}
      onMouseLeave={handleDesktopHoverEnd}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-amber-200/14 bg-black/28">
            <Image
              src={avatarSrc}
              alt=""
              fill
              unoptimized
              sizes="40px"
              className="object-cover object-top"
            />
          </span>
          <div className="min-w-0 truncate font-medium text-white">
            {authorName}
          </div>
        </div>

        <div className="text-xs text-slate-400">
          {formatLobbyMoment(item.message.createdAt)}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {isAi ? (
          <MiniIdentityPill toneClassName="border-cyan-400/20 bg-cyan-400/10 text-cyan-50">
            {aiLabel}
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

      <div className="mt-4 flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-x-hidden">
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
              className={`inline-flex min-h-10 min-w-[3.55rem] items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-medium transition ${
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

        <button
          type="button"
          onClick={handleReactionHandleClick}
          aria-label={pickerVisible ? "Hide reactions" : "Show reactions"}
          aria-expanded={pickerVisible}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#0c1524] text-base text-slate-300 transition hover:border-white/18 hover:text-white"
        >
          +
        </button>
      </div>

        <div
          className={`mt-3 max-w-full overflow-hidden transition-all duration-150 ${
            pickerVisible ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
          }`}
          onMouseEnter={handleDesktopHoverStart}
          onMouseLeave={handleDesktopHoverEnd}
        >
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 overflow-x-hidden rounded-2xl border border-white/10 bg-[#091321] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)]">
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
                  className={`flex h-11 min-w-11 items-center justify-center rounded-full border px-3.5 text-[17px] transition ${
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
                onClick={handleEditClick}
                disabled={moderatingMessageId === item.message.id}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-200 transition hover:border-white/18 hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Edit
              </button>
            ) : null}

            {canManageMessage ? (
              <button
                type="button"
                onClick={handleDeleteClick}
                disabled={moderatingMessageId === item.message.id}
                className="inline-flex h-10 items-center justify-center rounded-full border border-rose-300/22 bg-rose-500/10 px-3 text-[11px] font-medium uppercase tracking-[0.16em] text-rose-50 transition hover:border-rose-200/30 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            ) : null}
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
      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
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
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}

function formatReactionTooltip(
  reaction: Extract<ChatRenderItem, { type: "message" }>["message"]["reactions"][number]
) {
  const named = reaction.users.map((user) => user.displayName).filter(Boolean);
  const fragments: string[] = [];

  if (named.length > 0) {
    fragments.push(named.join(", "));
  }

  if (reaction.anonymousCount > 0) {
    fragments.push(
      reaction.anonymousCount === 1
        ? "1 anonymous player"
        : `${reaction.anonymousCount} anonymous players`
    );
  }

  return fragments.join(" • ");
}
