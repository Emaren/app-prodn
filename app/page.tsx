"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { LobbyChat } from "@/components/lobby/LobbyChat";
import { LobbyHero } from "@/components/lobby/LobbyHero";
import { OnlinePlayersPanel } from "@/components/lobby/OnlinePlayersPanel";
import { RecentMatchesPanel } from "@/components/lobby/RecentMatchesPanel";
import { TournamentPanel } from "@/components/lobby/TournamentPanel";
import { buildChatItems } from "@/components/lobby/utils";
import { useUserAuth } from "@/context/UserAuthContext";
import {
  getFallbackLeaderboard,
  getFallbackTournament,
  type LobbyMessage,
  type LobbySnapshot,
} from "@/lib/lobby";

const EMPTY_MESSAGES: LobbyMessage[] = [];
const CHAT_AUTO_SCROLL_GRACE_MS = 4000;
const CHAT_BOTTOM_THRESHOLD_PX = 48;

export default function HomePage() {
  const { isAdmin, isAuthenticated, loading, loginWithSteam, playerName, user } = useUserAuth();

  const [lobby, setLobby] = useState<LobbySnapshot | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [authDetail, setAuthDetail] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [chatPending, setChatPending] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [chatCardHeight, setChatCardHeight] = useState<number | null>(null);

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const rightColumnRef = useRef<HTMLDivElement | null>(null);
  const chatAutoScrollHoldUntilRef = useRef(0);
  const chatAutoScrollTimerRef = useRef<number | null>(null);

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
  const chatItems = buildChatItems(messages);

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

    const node = chatScrollRef.current;
    if (!node) return;

    const handleScroll = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;

      if (chatAutoScrollTimerRef.current) {
        window.clearTimeout(chatAutoScrollTimerRef.current);
        chatAutoScrollTimerRef.current = null;
      }

      if (distanceFromBottom > CHAT_BOTTOM_THRESHOLD_PX) {
        chatAutoScrollHoldUntilRef.current = Date.now() + CHAT_AUTO_SCROLL_GRACE_MS;
        return;
      }

      chatAutoScrollHoldUntilRef.current = 0;
    };

    node.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      node.removeEventListener("scroll", handleScroll);
      if (chatAutoScrollTimerRef.current) {
        window.clearTimeout(chatAutoScrollTimerRef.current);
        chatAutoScrollTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const node = chatScrollRef.current;
    if (!node) return;

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    const holdRemaining = chatAutoScrollHoldUntilRef.current - Date.now();

    if (distanceFromBottom <= CHAT_BOTTOM_THRESHOLD_PX || holdRemaining <= 0) {
      scrollChatToBottom();
      return;
    }

    if (chatAutoScrollTimerRef.current) {
      window.clearTimeout(chatAutoScrollTimerRef.current);
    }

    chatAutoScrollTimerRef.current = window.setTimeout(() => {
      if (Date.now() < chatAutoScrollHoldUntilRef.current) {
        return;
      }

      scrollChatToBottom("smooth");
      chatAutoScrollTimerRef.current = null;
    }, holdRemaining);

    return () => {
      if (chatAutoScrollTimerRef.current) {
        window.clearTimeout(chatAutoScrollTimerRef.current);
        chatAutoScrollTimerRef.current = null;
      }
    };
  }, [chatItems.length, scrollChatToBottom]);

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
        body: JSON.stringify({ message: trimmed, roomSlug: tournament.roomSlug }),
      });

      const payload = (await response.json().catch(() => ({}))) as
        | { detail?: string; messages?: LobbyMessage[] }
        | Record<string, unknown>;

      if (!response.ok) {
        throw new Error(typeof payload.detail === "string" ? payload.detail : "Message failed.");
      }

      setMessageBody("");
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
    } finally {
      setChatPending(false);
    }
  }

  const chatCardStyle: CSSProperties | undefined =
    chatCardHeight && typeof window !== "undefined" && window.innerWidth >= 1024
      ? { height: `${chatCardHeight}px` }
      : undefined;

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_30%),linear-gradient(135deg,_#0f172a,_#111827_55%,_#0b1120)] p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.95fr]">
          <LobbyHero
            liveConnected={liveConnected}
            authError={authError}
            authDetail={authDetail}
            lobbyError={lobbyError}
            isAuthenticated={isAuthenticated}
            loading={loading}
            leaderboard={leaderboard}
          />

          <TournamentPanel
            tournament={tournament}
            isAdmin={isAdmin}
            isAuthenticated={isAuthenticated}
            joinPending={joinPending}
            joinError={joinError}
            onJoinTournament={() => {
              void handleJoinTournament();
            }}
            onLogin={() => loginWithSteam("/")}
          />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <LobbyChat
          style={chatCardStyle}
          chatRoomTitle={chatRoomTitle}
          messagesCount={messages.length}
          chatItems={chatItems}
          chatScrollRef={chatScrollRef}
          chatError={chatError}
          isAuthenticated={isAuthenticated}
          playerName={playerName}
          currentUserInGameName={user?.inGameName ?? null}
          currentUserSteamPersonaName={user?.steamPersonaName ?? null}
          messageBody={messageBody}
          chatPending={chatPending}
          onMessageBodyChange={setMessageBody}
          onSendMessage={() => {
            void handleSendMessage();
          }}
          onLogin={() => loginWithSteam("/")}
        />

        <div ref={rightColumnRef} className="flex min-w-0 flex-col gap-6">
          <OnlinePlayersPanel onlineUsers={onlineUsers} />
          <RecentMatchesPanel recentMatches={recentMatches} />
        </div>
      </section>
    </main>
  );
}
