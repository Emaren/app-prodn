"use client";

import Image from "next/image";
import { formatLobbyMoment } from "@/components/lobby/utils";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
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
import { avatarThumbUrlForUser } from "@/lib/avatarAssets";

const TYPING_HUD_MODE_STORAGE_KEY = "aoe2war:typing-hud-mode";

type ChatAudienceMember = {
  uid: string;
  name: string;
  aliases: string[];
  avatarSrc: string;
  latestAt: string;
  messageCount: number;
};

function normalizedChatToken(value: string | null | undefined) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\[\]\-\s]+/g, " ")
    .replace(/\s+/g, " ");
}

function uniqueChatAliases(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const aliases: string[] = [];

  for (const value of values) {
    const normalized = normalizedChatToken(value);
    if (!normalized || normalized.length < 2 || seen.has(normalized)) continue;

    seen.add(normalized);
    aliases.push(normalized);

    for (const part of normalized.split(" ")) {
      if (part.length >= 3 && !seen.has(part)) {
        seen.add(part);
        aliases.push(part);
      }
    }
  }

  return aliases;
}

const CHAT_AUDIENCE_PRESETS: ChatAudienceMember[] = [
  {
    uid: "preset:emaren",
    name: "Emaren",
    aliases: uniqueChatAliases("Emaren"),
    avatarSrc: avatarThumbUrlForUser("preset:emaren", "Emaren"),
    latestAt: "1970-01-01T00:00:00.000Z",
    messageCount: 0,
  },
  {
    uid: "preset:sniper",
    name: "Sniper",
    aliases: uniqueChatAliases("Sniper"),
    avatarSrc: avatarThumbUrlForUser("preset:sniper", "Sniper"),
    latestAt: "1970-01-01T00:00:00.000Z",
    messageCount: 0,
  },
  {
    uid: "preset:jim",
    name: "Jim",
    aliases: uniqueChatAliases("Jim"),
    avatarSrc: avatarThumbUrlForUser("preset:jim", "Jim"),
    latestAt: "1970-01-01T00:00:00.000Z",
    messageCount: 0,
  },
  {
    uid: "preset:zodiac",
    name: "Zodiac",
    aliases: uniqueChatAliases("Zodiac"),
    avatarSrc: avatarThumbUrlForUser("preset:zodiac", "Zodiac"),
    latestAt: "1970-01-01T00:00:00.000Z",
    messageCount: 0,
  },
];


type LobbyChatProps = {
  style?: CSSProperties;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  chatRoomTitle: string;
  messagesCount: number;
  chatItems: ChatRenderItem[];
  chatScrollRef: RefObject<HTMLDivElement | null>;
  onLoadOlderMessages?: () => void;
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
    messagesCount,
    chatItems,
    chatScrollRef,
    onLoadOlderMessages,
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
  const lastChatViewportScrollTopRef = useRef(0);
  const [selectedChatAudienceUids, setSelectedChatAudienceUids] = useState<string[]>([]);
  const [chatFilterDockVisible, setChatFilterDockVisible] = useState(false);
  const [typingHudMode, setTypingHudMode] = useState<"steady" | "pulse">("steady");
  const [ownTypingPulse, setOwnTypingPulse] = useState(false);
  const ownTypingPulseTimerRef = useRef<number | null>(null);
  const lastMessageBodyForTypingPulseRef = useRef(messageBody);

  const chatAudience = useMemo(() => {
    const audience = new Map<string, ChatAudienceMember>();

    for (const item of chatItems) {
      if (item.type !== "message") continue;
      if (item.message.user.isAi) continue;

      const uid = item.message.user.uid;
      if (!uid) continue;

      const name =
        displayName(item.message.user.inGameName, item.message.user.steamPersonaName) || "Player";
      const aliases = uniqueChatAliases(
        name,
        item.message.user.inGameName,
        item.message.user.steamPersonaName,
        uid
      );

      const existing = audience.get(uid);
      if (existing) {
        existing.messageCount += 1;

        if (new Date(item.message.createdAt).getTime() > new Date(existing.latestAt).getTime()) {
          existing.latestAt = item.message.createdAt;
        }

        continue;
      }

      audience.set(uid, {
        uid,
        name,
        aliases,
        avatarSrc: avatarThumbUrlForUser(uid, name),
        latestAt: item.message.createdAt,
        messageCount: 1,
      });
    }

    for (const preset of CHAT_AUDIENCE_PRESETS) {
      const existing = Array.from(audience.values()).find((member) =>
        member.aliases.some((alias) => preset.aliases.includes(alias))
      );

      if (!existing) {
        audience.set(preset.uid, preset);
      }
    }

    return Array.from(audience.values()).sort((left, right) => {
      const leftPreset = left.uid.startsWith("preset:");
      const rightPreset = right.uid.startsWith("preset:");

      if (leftPreset !== rightPreset) {
        return leftPreset ? 1 : -1;
      }

      const latestDelta = new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime();
      return latestDelta !== 0 ? latestDelta : left.name.localeCompare(right.name);
    });
  }, [chatItems]);

  useEffect(() => {
    if (selectedChatAudienceUids.length === 0) return;

    const available = new Set(chatAudience.map((member) => member.uid));
    setSelectedChatAudienceUids((current) =>
      current.filter((uid) => available.has(uid) || uid.startsWith("preset:"))
    );
  }, [chatAudience, selectedChatAudienceUids.length]);

  const selectedChatAudience = useMemo(
    () => chatAudience.filter((member) => selectedChatAudienceUids.includes(member.uid)),
    [chatAudience, selectedChatAudienceUids]
  );

  const filteredChatItems = useMemo(() => {
    if (selectedChatAudience.length === 0) return chatItems;

    const selectedUids = new Set(selectedChatAudience.map((member) => member.uid));
    const selectedAliases = selectedChatAudience.flatMap((member) => member.aliases);
    const filtered: ChatRenderItem[] = [];
    let pendingDivider: Extract<ChatRenderItem, { type: "divider" }> | null = null;

    for (const item of chatItems) {
      if (item.type === "divider") {
        pendingDivider = item;
        continue;
      }

      const body = normalizedChatToken(item.message.body);
      const authorUid = item.message.user.uid;
      const authorName =
        displayName(item.message.user.inGameName, item.message.user.steamPersonaName) || "";
      const authorAliases = uniqueChatAliases(
        authorName,
        item.message.user.inGameName,
        item.message.user.steamPersonaName,
        authorUid
      );

      const authoredBySelected =
        (authorUid ? selectedUids.has(authorUid) : false) ||
        selectedAliases.some((alias) => authorAliases.includes(alias));

      const mentionsSelected = selectedAliases.some(
        (alias) => alias.length >= 3 && body.includes(alias)
      );

      if (!authoredBySelected && !mentionsSelected) {
        continue;
      }

      if (pendingDivider) {
        filtered.push(pendingDivider);
        pendingDivider = null;
      }

      filtered.push(item);
    }

    return filtered;
  }, [chatItems, selectedChatAudience]);

  const displayedMessagesCount = filteredChatItems.filter((item) => item.type === "message").length;

  function toggleChatAudienceUid(uid: string) {
    setSelectedChatAudienceUids((current) =>
      current.includes(uid) ? current.filter((existing) => existing !== uid) : [...current, uid]
    );
  }

  function handleChatShellClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (
      target.closest(
        '[data-chat-viewscreen="true"], [data-chat-input-zone="true"], button, a, input, textarea, select, [role="dialog"]'
      )
    ) {
      return;
    }

    setChatFilterDockVisible((current) => !current);
  }


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
    const viewport = chatScrollRef.current;

    if (viewport) {
      const currentTop = viewport.scrollTop;
      const wasUserScrollingUp = currentTop < lastChatViewportScrollTopRef.current;

      if (wasUserScrollingUp && currentTop <= 96) {
        onLoadOlderMessages?.();
      }

      lastChatViewportScrollTopRef.current = currentTop;
    }

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
      onClick={handleChatShellClick}
      className={`flex h-[min(76dvh,46rem)] min-h-[28rem] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-[1.75rem] border p-4 sm:h-[min(78dvh,48rem)] sm:min-h-[30rem] sm:p-5 lg:h-full lg:min-h-0 lg:max-h-full lg:p-6 ${
        isExtreme
          ? "border-amber-200/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] shadow-[0_26px_88px_rgba(0,0,0,0.28)]"
          : tone.panelShell
      }`}
      style={style}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Chat</div>
        </div>

        <div className={`shrink-0 rounded-full border border-white/[0.06] px-3 py-1 text-xs ${tone.neutralPill}`}>
          {selectedChatAudienceUids.length > 0 ? `${displayedMessagesCount} shown` : `${messagesCount} recent`}
        </div>
      </div>

      {chatFilterDockVisible && chatAudience.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-white/[0.055] bg-[#081322]/52 px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <div className="flex items-center justify-between gap-3">
                        {selectedChatAudienceUids.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelectedChatAudienceUids([])}
                className="rounded-full border border-white/[0.06] bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="mt-2.5 flex min-w-0 items-center gap-2 overflow-x-auto pb-0.5 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chatAudience.map((member) => {
              const selected = selectedChatAudienceUids.includes(member.uid);

              return (
                <button
                  key={member.uid}
                  type="button"
                  onClick={() => toggleChatAudienceUid(member.uid)}
                  aria-pressed={selected}
                  title={selected ? `Remove ${member.name} filter` : `Filter ${member.name}`}
                  className={`group relative flex h-11 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition ${
                    selected
                      ? "border-amber-200/26 bg-amber-400/12 text-amber-50 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
                      : "border-white/[0.055] bg-white/[0.035] text-slate-300 hover:border-white/[0.11] hover:bg-white/[0.07] hover:text-white"
                  }`}
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-black/30 shadow-[0_0_0_1px_rgba(255,255,255,0.10)]">
                    <Image
                      src={member.avatarSrc}
                      alt={member.name}
                      fill
                      unoptimized
                      sizes="36px"
                      className="object-cover object-top"
                    />
                  </span>

                  <span className="max-w-[7.5rem] truncate text-[11px] font-semibold tracking-[0.08em]">
                    {member.name}
                  </span>

                  <span
                    className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                      selected ? "bg-amber-300" : "bg-emerald-300/70"
                    }`}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}


      <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden">
        <div
          className={`relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] border p-3 sm:p-4 ${tone.insetPanel}`}
        >
          <div ref={chatScrollRef} onScroll={handleChatScroll} className="min-h-0 min-w-0 flex-1 overscroll-contain space-y-2 overflow-x-hidden overflow-y-auto pb-12 pr-1">
            {filteredChatItems.length === 0 ? (
              <div className={`rounded-xl border px-4 py-5 text-sm text-slate-300 ${tone.subduedCard}`}>
                No messages yet. The first tournament chatter starts here.
              </div>
            ) : (
              filteredChatItems.map((item) =>
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

const APPLE_STYLE_LOBBY_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const APPLE_STYLE_LOBBY_MORE_REACTIONS = [
  "🔥", "👀", "🐐", "💀", "⚔️", "🏆", "👑", "✨",
  "👏", "🤯", "🥶", "😎", "😭", "🤣", "😈", "🫡",
  "🤝", "💪", "🙌", "🎯", "🧠", "🗿", "🚀", "💰",
  "📜", "🏰", "🛡️", "🪓", "🐺", "🦅", "🍻", "🧙",
  "🪄", "⚡", "🌎", "🫶",
];

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
  const [reactionDockOpen, setReactionDockOpen] = useState(false);
  const [reactionMoreOpen, setReactionMoreOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const isAi = item.message.user.isAi;
  const canManageMessage =
    currentUserIsAdmin || (currentUserUid !== null && item.message.user.uid === currentUserUid);
  const aiLabel =
    displayName(item.message.user.inGameName, item.message.user.steamPersonaName) || "The AI Scribe";
  const authorName = displayName(item.message.user.inGameName, item.message.user.steamPersonaName) || aiLabel;
  const avatarSrc = avatarThumbUrlForUser(item.message.user.uid, authorName);
  const isBusy = reactingMessageId === item.message.id || moderatingMessageId === item.message.id;

  useEffect(() => {
    if (!reactionDockOpen || typeof document === "undefined") return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) {
        setReactionDockOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setReactionDockOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [reactionDockOpen]);

  useEffect(() => {
    if (!reactionDockOpen) {
      setReactionMoreOpen(false);
    }
  }, [reactionDockOpen]);

  function handleReactionToggle(event: MouseEvent<HTMLButtonElement>, emoji: string) {
    event.stopPropagation();
    onToggleReaction(item.message.id, emoji);
    setReactionMoreOpen(false);
    setReactionDockOpen(false);
  }

  function handleReactionDockToggle(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setReactionDockOpen((current) => !current);
  }

  function handleEditClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const nextBody = window.prompt("Edit lobby message", item.message.body);
    if (nextBody === null) return;
    onEditMessage(item.message.id, nextBody);
    setReactionDockOpen(false);
  }

  function handleDeleteClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const confirmed = window.confirm("Delete this lobby message?");
    if (!confirmed) return;
    onDeleteMessage(item.message.id);
    setReactionDockOpen(false);
  }

  return (
    <div
      ref={cardRef}
      className={`relative rounded-xl border px-4 py-4 ${tone.subduedCard}`}
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

        <div className="shrink-0 text-xs text-slate-400">
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

      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
        {item.message.body}
      </p>

      <div className="mt-4 flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pb-0.5 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {item.message.reactions.length > 0 ? (
            item.message.reactions.map((reaction) => {
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
                  className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition ${
                    reaction.viewerReacted
                      ? "border-transparent bg-amber-400/14 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.035)]"
                      : "border-transparent bg-white/[0.035] text-slate-300 hover:border-transparent hover:bg-white/[0.075] hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              );
            })
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleReactionDockToggle}
          aria-label={reactionDockOpen ? "Close reaction dock" : "Open reaction dock"}
          aria-expanded={reactionDockOpen}
          disabled={isBusy}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base font-semibold transition ${
            reactionDockOpen
              ? "border-transparent bg-amber-400/16 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.10)]"
              : "border-transparent bg-white/[0.035] text-slate-300 hover:border-transparent hover:bg-white/[0.075] hover:text-white"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span aria-hidden="true">{reactionDockOpen ? "×" : "+"}</span>
        </button>
      </div>

      <div
        className={`absolute inset-x-3 bottom-14 z-30 origin-bottom rounded-[1.15rem] border border-white/[0.035] bg-[#07111f]/96 p-2.5 shadow-[0_22px_58px_rgba(0,0,0,0.48),inset_0_0_0_1px_rgba(255,255,255,0.035)] backdrop-blur-xl transition duration-150 ${
          reactionDockOpen
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-[0.98] opacity-0"
        }`}
        role="dialog"
        aria-label="Message reactions"
        aria-hidden={!reactionDockOpen}
      >
        <div className="rounded-full border border-white/[0.035] bg-white/[0.045] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
          <div className="flex items-center gap-1">
            {APPLE_STYLE_LOBBY_QUICK_REACTIONS.map((emoji) => {
              const existing = item.message.reactions.find((reaction) => reaction.emoji === emoji);
              const isActive = Boolean(existing?.viewerReacted);

              return (
                <button
                  key={`${item.message.id}-${emoji}-quick`}
                  type="button"
                  onClick={(event) => handleReactionToggle(event, emoji)}
                  aria-pressed={isActive}
                  disabled={reactingMessageId === item.message.id}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-[18px] transition ${
                    isActive
                      ? "bg-amber-400/18 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.04)]"
                      : "bg-transparent text-slate-200 hover:bg-white/[0.09] hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>{emoji}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setReactionMoreOpen((current) => !current);
              }}
              aria-label={reactionMoreOpen ? "Hide more reactions" : "Show more reactions"}
              aria-expanded={reactionMoreOpen}
              disabled={reactingMessageId === item.message.id}
              className={`flex h-10 w-10 items-center justify-center rounded-full text-[15px] font-black tracking-[-0.16em] transition ${
                reactionMoreOpen
                  ? "bg-white/[0.12] text-white"
                  : "bg-transparent text-slate-300 hover:bg-white/[0.09] hover:text-white"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span aria-hidden="true">•••</span>
            </button>
          </div>
        </div>

        <div
          className={`overflow-hidden transition-all duration-200 ${
            reactionMoreOpen ? "mt-2 max-h-64 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="grid grid-cols-8 gap-1 rounded-[1rem] border border-white/[0.035] bg-white/[0.035] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
            {APPLE_STYLE_LOBBY_MORE_REACTIONS.map((emoji) => {
              const existing = item.message.reactions.find((reaction) => reaction.emoji === emoji);
              const isActive = Boolean(existing?.viewerReacted);

              return (
                <button
                  key={`${item.message.id}-${emoji}-more`}
                  type="button"
                  onClick={(event) => handleReactionToggle(event, emoji)}
                  aria-pressed={isActive}
                  disabled={reactingMessageId === item.message.id}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[16px] transition ${
                    isActive
                      ? "bg-amber-400/18 text-amber-50 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.04)]"
                      : "bg-transparent text-slate-200 hover:bg-white/[0.09] hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span>{emoji}</span>
                </button>
              );
            })}
          </div>
        </div>

        {canManageMessage ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={handleEditClick}
              disabled={moderatingMessageId === item.message.id}
              className="inline-flex h-9 items-center justify-center rounded-full border border-white/[0.055] bg-white/[0.045] px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:border-white/[0.11] hover:bg-white/[0.1] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Edit
            </button>

            <button
              type="button"
              onClick={handleDeleteClick}
              disabled={moderatingMessageId === item.message.id}
              className="inline-flex h-9 items-center justify-center rounded-full border border-rose-300/14 bg-rose-500/10 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-50 transition hover:border-rose-200/20 hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        ) : null}
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
