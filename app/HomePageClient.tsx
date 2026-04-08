"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LobbyChat } from "@/components/lobby/LobbyChat";
import { LobbyHero } from "@/components/lobby/LobbyHero";
import { getLobbyHeroBackground } from "@/components/lobby/lobbyPresentation";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { OnlinePlayersPanel } from "@/components/lobby/OnlinePlayersPanel";
import { RecentMatchesPanel } from "@/components/lobby/RecentMatchesPanel";
import { TopWoloEarnersTile } from "@/components/lobby/TopWoloEarnersTile";
import { TournamentPanel } from "@/components/lobby/TournamentPanel";
import { buildChatItems } from "@/components/lobby/utils";
import { useUserAuth } from "@/context/UserAuthContext";
import { type AiVisibilityOption } from "@/lib/aiConciergeConfig";
import {
  getFallbackLeaderboard,
  getFallbackTournament,
  type LobbyMessage,
  type LobbySnapshot,
} from "@/lib/lobby";

const EMPTY_MESSAGES: LobbyMessage[] = [];

type HomePageClientProps = {
  initialLobby: LobbySnapshot | null;
};

export default function HomePageClient({ initialLobby }: HomePageClientProps) {
  const { uid, isAdmin, isAuthenticated, loading, loginWithSteam, playerName, user } = useUserAuth();
  const { themeKey, tileThemeKey, viewMode, setViewMode } = useLobbyAppearance();

  const [lobby, setLobby] = useState<LobbySnapshot | null>(initialLobby);
  const [liveConnected, setLiveConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authDetail, setAuthDetail] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [chatCardHeight, setChatCardHeight] = useState<number | null>(null);
  const [heroRailHeight, setHeroRailHeight] = useState<number | null>(null);
  const [reactingMessageId, setReactingMessageId] = useState<number | null>(null);
  const [moderatingMessageId, setModeratingMessageId] = useState<number | null>(null);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiVisibility, setAiVisibility] = useState<AiVisibilityOption>("public");
  const [aiScribeEnabled, setAiScribeEnabled] = useState(true);
  const [aiGrimerEnabled, setAiGrimerEnabled] = useState(true);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);

  const loadLobby = useCallback(async () => {
    try {
      const response = await fetch("/api/lobby", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Lobby request failed: ${response.status}`);
      }

      const payload = (await response.json()) as LobbySnapshot;
      setLobby(payload);
      setLobbyError(null);
    } catch (error) {
      console.warn("Failed to load lobby:", error);
      setLobbyError("Lobby data is temporarily unavailable.");
    }
  }, []);

  useEffect(() => {
    void loadLobby();

    const interval = window.setInterval(() => {
      void loadLobby();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [loadLobby]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return;
    }

    const source = new EventSource("/api/lobby/stream");

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const snapshot = JSON.parse(event.data) as LobbySnapshot;
        setLobby(snapshot);
        setLobbyError(null);
        setLiveConnected(true);
      } catch (error) {
        console.warn("Failed to parse live lobby snapshot:", error);
      }
    };

    const handleStreamError = () => {
      setLiveConnected(false);
    };

    source.addEventListener("snapshot", handleSnapshot as EventListener);
    source.addEventListener("error", handleStreamError as EventListener);

    source.onopen = () => {
      setLiveConnected(true);
    };

    source.onerror = () => {
      setLiveConnected(false);
    };

    return () => {
      source.removeEventListener("snapshot", handleSnapshot as EventListener);
      source.removeEventListener("error", handleStreamError as EventListener);
      source.close();
      setLiveConnected(false);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("auth") === "steam-error");
    setAuthDetail(params.get("detail"));
  }, []);

  const tournament = lobby?.tournament ?? getFallbackTournament(false);
  const leaderboard = lobby?.leaderboard ?? getFallbackLeaderboard();
  const onlineUsers = lobby?.onlineUsers ?? [];
  const recentMatches = lobby?.recentMatches ?? [];
  const messages = lobby?.messages ?? EMPTY_MESSAGES;
  const wolo = lobby?.wolo ?? null;
  const woloEarners = lobby?.woloEarners ?? null;

  const chatItems = buildChatItems(messages);
  const latestChatMessageKey = useMemo(
    () =>
      messages.length > 0
        ? `${messages[messages.length - 1]?.id ?? "last"}:${messages[messages.length - 1]?.createdAt ?? ""}`
        : "empty",
    [messages]
  );

  const chatRoomTitle =
    messages.length > 0 && messages[0]?.roomSlug === tournament.roomSlug && !tournament.isFallback
      ? `${tournament.title} Chat`
      : "Live Chat";

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const node = chatScrollRef.current;
    if (!node) return;

    node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (chatItems.length === 0) return;

    let secondFrame = 0;
    const timeout = window.setTimeout(() => {
      scrollChatToBottom();
    }, 140);

    const frame = window.requestAnimationFrame(() => {
      scrollChatToBottom();
      secondFrame = window.requestAnimationFrame(() => {
        scrollChatToBottom();
      });
    });

    return () => {
      window.clearTimeout(timeout);
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [chatCardHeight, latestChatMessageKey, chatItems.length, scrollChatToBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncHeroRailHeight = () => {
      if (window.innerWidth < 1024) {
        setHeroRailHeight(null);
        return;
      }

      const heroStack =
        document.querySelector<HTMLElement>("[data-lobby-hero-stack='true']") ||
        document.querySelector<HTMLElement>("[data-lobby-leaderboard-panel='true']");
      const nextHeight = heroStack?.getBoundingClientRect().height ?? 0;
      setHeroRailHeight(nextHeight > 0 ? Math.ceil(nextHeight) : null);
    };

    syncHeroRailHeight();

    const handleResize = () => {
      syncHeroRailHeight();
    };

    window.addEventListener("resize", handleResize);

    const heroStack =
      document.querySelector<HTMLElement>("[data-lobby-hero-stack='true']") ||
      document.querySelector<HTMLElement>("[data-lobby-leaderboard-panel='true']");

    if (typeof ResizeObserver === "undefined" || !heroStack) {
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const observer = new ResizeObserver(() => {
      syncHeroRailHeight();
    });

    observer.observe(heroStack);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [leaderboard.entries.length, leaderboard.trackedPlayers, viewMode, tileThemeKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncChatHeightToRightColumn = () => {
      if (window.innerWidth < 1024) {
        setChatCardHeight(null);
        return;
      }

      const rightHeight = rightColumnRef.current?.getBoundingClientRect().height ?? 0;
      if (rightHeight > 0) {
        setChatCardHeight(Math.ceil(rightHeight));
      }
    };

    syncChatHeightToRightColumn();

    const handleResize = () => {
      syncChatHeightToRightColumn();
    };

    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver === "undefined" || !rightColumnRef.current) {
      return () => {
        window.removeEventListener("resize", handleResize);
      };
    }

    const observer = new ResizeObserver(() => {
      syncChatHeightToRightColumn();
    });

    observer.observe(rightColumnRef.current);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  async function handleJoinTournament() {
    if (!tournament.id) return;

    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setJoinPending(true);
      setJoinError(null);

      const response = await fetch("/api/lobby/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tournamentId: tournament.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; tournament?: LobbySnapshot["tournament"] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Join failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              tournament: (payload.tournament as LobbySnapshot["tournament"]) || current.tournament,
            }
          : current
      );

      await loadLobby();
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Join failed.");
    } finally {
      setJoinPending(false);
    }
  }

  async function handleSendMessage() {
    const trimmed = messageBody.trim();
    if (!trimmed) return;

    if (!isAuthenticated) {
      loginWithSteam("/");
      return;
    }

    try {
      setChatPending(true);
      setChatError(null);

      const response = await fetch("/api/lobby/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          roomSlug: tournament.roomSlug,
          aiEnabled,
          aiVisibility,
          aiScribeEnabled,
          aiGrimerEnabled,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[]; aiWarning?: string | null }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Message failed.");
      }

      setMessageBody("");
      setChatNotice(typeof payload.aiWarning === "string" ? payload.aiWarning : null);
      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message failed.");
      setChatNotice(null);
    } finally {
      setChatPending(false);
    }
  }

  async function handleToggleReaction(messageId: number, emoji: string) {
    try {
      setReactingMessageId(messageId);
      setChatError(null);

      const response = await fetch("/api/lobby/chat/reaction", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messageId, emoji }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Reaction failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Reaction failed.");
    } finally {
      setReactingMessageId(null);
    }
  }

  async function handleModerateMessage(
    action: "edit_message" | "delete_message",
    messageId: number,
    body?: string
  ) {
    try {
      setModeratingMessageId(messageId);
      setChatError(null);

      const response = await fetch("/api/lobby/chat", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          messageId,
          body,
          roomSlug: tournament.roomSlug,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Message update failed.");
      }

      setLobby((current) =>
        current
          ? {
              ...current,
              messages: Array.isArray(payload.messages) ? payload.messages : current.messages,
            }
          : current
      );
    } catch (error) {
      setChatError(error instanceof Error ? error.message : "Message update failed.");
    } finally {
      setModeratingMessageId(null);
    }
  }

  const chatCardStyle: CSSProperties | undefined =
    chatCardHeight && typeof window !== "undefined" && window.innerWidth >= 1024
      ? { height: `${chatCardHeight}px` }
      : undefined;
  const heroRailStyle: CSSProperties | undefined =
    heroRailHeight && typeof window !== "undefined" && window.innerWidth >= 1024
      ? { height: `${heroRailHeight}px` }
      : undefined;

  const heroStyle: CSSProperties = {
    backgroundImage: getLobbyHeroBackground(themeKey, viewMode),
  };

  const heroShellClassName =
    viewMode === "field"
      ? "border-emerald-400/20 shadow-[0_28px_80px_rgba(5,46,22,0.32)]"
      : "border-white/10 shadow-[0_28px_80px_rgba(15,23,42,0.4)]";

  return (
    <div className="space-y-4 overflow-x-hidden py-2 text-white sm:space-y-6 sm:py-3">
      <section
        className={`overflow-hidden rounded-[1.75rem] border p-4 transition-all duration-500 sm:rounded-[2rem] sm:p-6 lg:p-8 ${heroShellClassName}`}
        style={heroStyle}
      >
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.95fr] lg:items-start lg:gap-7">
          <LobbyHero
            liveConnected={liveConnected}
            authError={authError}
            authDetail={authDetail}
            lobbyError={lobbyError}
            isAuthenticated={isAuthenticated}
            loading={loading}
            leaderboard={leaderboard}
            wolo={wolo}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

          <div
            className="grid min-h-0 min-w-0 overflow-hidden gap-3.5 lg:grid-rows-[auto_minmax(0,1fr)] lg:self-start lg:pt-4"
            style={heroRailStyle}
          >
            <TournamentPanel
              tournament={tournament}
              themeKey={tileThemeKey}
              viewMode={viewMode}
              isAdmin={isAdmin}
              isAuthenticated={isAuthenticated}
              joinPending={joinPending}
              joinError={joinError}
              onJoinTournament={() => {
                void handleJoinTournament();
              }}
              onLogin={() => loginWithSteam("/")}
            />

            <div className="h-full min-h-0 overflow-hidden">
              <TopWoloEarnersTile
                wolo={wolo}
                board={woloEarners}
                themeKey={tileThemeKey}
                viewMode={viewMode}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <LobbyChat
          style={chatCardStyle}
          themeKey={tileThemeKey}
          viewMode={viewMode}
          chatRoomTitle={chatRoomTitle}
          messagesCount={messages.length}
          chatItems={chatItems}
          chatScrollRef={chatScrollRef}
          chatError={chatError}
          chatNotice={chatNotice}
          isAuthenticated={isAuthenticated}
          playerName={playerName}
          currentUserInGameName={user?.inGameName ?? null}
          currentUserSteamPersonaName={user?.steamPersonaName ?? null}
          currentUserUid={uid ?? null}
          currentUserIsAdmin={isAdmin}
          messageBody={messageBody}
          chatPending={chatPending}
          reactingMessageId={reactingMessageId}
          moderatingMessageId={moderatingMessageId}
          aiEnabled={aiEnabled}
          aiVisibility={aiVisibility}
          aiScribeEnabled={aiScribeEnabled}
          aiGrimerEnabled={aiGrimerEnabled}
          onMessageBodyChange={setMessageBody}
          onSendMessage={() => {
            void handleSendMessage();
          }}
          onAiEnabledChange={setAiEnabled}
          onAiVisibilityChange={setAiVisibility}
          onAiScribeEnabledChange={setAiScribeEnabled}
          onAiGrimerEnabledChange={setAiGrimerEnabled}
          onToggleReaction={(messageId, emoji) => {
            void handleToggleReaction(messageId, emoji);
          }}
          onEditMessage={(messageId, nextBody) => {
            void handleModerateMessage("edit_message", messageId, nextBody);
          }}
          onDeleteMessage={(messageId) => {
            void handleModerateMessage("delete_message", messageId);
          }}
          onLogin={() => loginWithSteam("/")}
        />

        <div ref={rightColumnRef} className="flex min-w-0 flex-col gap-6">
          <OnlinePlayersPanel
            onlineUsers={onlineUsers}
            themeKey={tileThemeKey}
            viewMode={viewMode}
          />
          <RecentMatchesPanel
            recentMatches={recentMatches}
            themeKey={tileThemeKey}
            viewMode={viewMode}
          />
        </div>
      </section>
    </div>
  );
}
