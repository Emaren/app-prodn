"use client";

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { LobbyChat } from "@/components/lobby/LobbyChat";
import { LobbyHero } from "@/components/lobby/LobbyHero";
import { LiveTickerStrip } from "@/components/lobby/LiveTickerStrip";
import { getLobbyHeroBackground } from "@/components/lobby/lobbyPresentation";
import { useLobbyAppearance } from "@/components/lobby/LobbyAppearanceContext";
import { OnlinePlayersPanel } from "@/components/lobby/OnlinePlayersPanel";
import { RecentMatchesPanel } from "@/components/lobby/RecentMatchesPanel";
import { TopWoloEarnersTile } from "@/components/lobby/TopWoloEarnersTile";
import { TournamentPanel } from "@/components/lobby/TournamentPanel";
import { WatchAndChatHero } from "@/components/lobby/WatchAndChatHero";
import { WoloMarketTile } from "@/components/lobby/WoloMarketTile";
import { WolomaniaPromoTile } from "@/components/lobby/WolomaniaPromoTile";
import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import { buildChatItems } from "@/components/lobby/utils";
import { useUserAuth } from "@/context/UserAuthContext";
import { type AiVisibilityOption } from "@/lib/aiConciergeConfig";
import type { EventTileView } from "@/lib/events/types";
import {
  getFallbackLeaderboard,
  getFallbackTournament,
  type LobbyMessage,
  type LobbySnapshot,
} from "@/lib/lobby";
import { avatarCardUrlForName } from "@/lib/avatarAssets";

const EMPTY_MESSAGES: LobbyMessage[] = [];

const EXTREME_WARRIORS = [
  {
    name: "Sniper",
    role: "The Sharpshooter",
    href: "/players/by-name/Sniper",
  },
  {
    name: "Julio",
    lookupName: "Julio Alvarez",
    role: "The Conquistador",
    href: "/players/by-name/Julio%20Alvarez",
  },
  {
    name: "Jim",
    role: "The General",
    href: "/players/by-name/Jim",
  },
  {
    name: "Emaren",
    role: "The Tactician",
    href: "/players/by-name/Emaren",
  },
] as const;

type HomePageClientProps = {
  initialLobby: LobbySnapshot | null;
  initialEventTile: EventTileView;
};

function AdvancedFeaturedWarriors() {
  return (
    <section className="relative px-4 py-5 sm:px-5 bg-transparent overflow-visible bg-transparent shadow-none border-0 ring-0 rounded-none overflow-visible">
      <div className="pointer-events-none absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/28 to-transparent" />
      <div className="grid gap-4 lg:grid-cols-[minmax(9rem,0.42fr)_minmax(0,1fr)_minmax(8rem,0.35fr)] lg:items-center">
        <div className="hidden lg:block">
          <div className="text-[10px] uppercase tracking-[0.38em] text-amber-100/72">
            Featured Warriors
          </div>
          <div className="mt-2 text-sm leading-5 text-slate-400">
            Elite competitors. Legendary rivalries.
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {EXTREME_WARRIORS.map((warrior) => (
            <Link
              key={warrior.name}
              href={warrior.href}
              className="group relative min-h-[13.5rem] overflow-visible rounded-none border border-amber-200/12 bg-black/28 transition hover:border-amber-200/28"
            >
              <Image
                src={avatarCardUrlForName("lookupName" in warrior ? warrior.lookupName : warrior.name)}
                alt=""
                fill
                unoptimized
                sizes="(min-width: 1280px) 250px, (min-width: 640px) 45vw, 90vw"
                className="object-cover object-top opacity-85 transition duration-500 group-hover:scale-[1.035]"
              />
              <div className="absolute inset-0" />
              <div className="absolute inset-x-3 bottom-3 rounded-2xl border border-amber-200/12 bg-black/48 px-3 py-2.5 text-center backdrop-blur">
                <div className="font-serif text-lg font-semibold uppercase tracking-[0.1em] text-white">
                  {warrior.name}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                  {warrior.role}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <Link
          href="/players"
          className="hidden justify-self-end rounded-full border border-amber-200/14 px-4 py-2 text-sm text-slate-300 transition hover:border-amber-200/30 hover:text-amber-100 lg:inline-flex"
        >
          View all warriors
        </Link>
      </div>
    </section>
  );
}

function ExtremeFeaturedWarriors() {
  return (
    <section className="relative rounded-none px-5 pb-4 pt-8 shadow-[0_34px_120px_rgba(0,0,0,0.38)] sm:px-7 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-visible rounded-none">
        <div className="absolute inset-x-10 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/30 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/35 to-transparent" />
        <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black/45 to-transparent" />
        <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black/45 to-transparent" />
      </div>

      <button
        type="button"
        className="absolute left-[18%] top-1/2 z-20 hidden h-16 w-16 -translate-y-1/2 items-center justify-center text-amber-200/42 transition hover:text-amber-100 lg:flex"
        aria-label="Previous featured warriors"
      >
        <ChevronLeft className="h-12 w-12 stroke-[1.15]" />
      </button>
      <button
        type="button"
        className="absolute right-[18%] top-1/2 z-20 hidden h-16 w-16 -translate-y-1/2 items-center justify-center text-amber-200/42 transition hover:text-amber-100 lg:flex"
        aria-label="Next featured warriors"
      >
        <ChevronRight className="h-12 w-12 stroke-[1.15]" />
      </button>

      <div className="relative z-10 grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_10rem] lg:items-center xl:grid-cols-[14rem_minmax(0,1fr)_12rem]">
        <div className="lg:pl-3 xl:pl-6">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.32em] text-amber-100/80">
            <Crown className="h-3.5 w-3.5 fill-amber-200/40 text-amber-200/70" />
            Featured Warriors
          </div>
          <div className="mt-2 max-w-[13rem] text-sm leading-5 text-slate-400">
            Elite competitors. Legendary rivalries.
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:gap-4">
          {EXTREME_WARRIORS.map((warrior) => {
            const avatarSrc = avatarCardUrlForName("lookupName" in warrior ? warrior.lookupName : warrior.name);
            return (
              <Link
                key={warrior.name}
                href={warrior.href}
                className="group relative min-h-[16rem] overflow-visible transition hover:-translate-y-0.5"
              >
                <div className="absolute inset-x-0 bottom-2 top-7 overflow-visible rounded-[1.35rem] border border-amber-100/12 bg-slate-950/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_60px_rgba(0,0,0,0.24)] transition group-hover:border-amber-200/26">
                  <div className="absolute inset-0" />
                  <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
                </div>
                <div className="absolute inset-x-[-14%] -top-5 bottom-6 z-10 transition duration-500 group-hover:-translate-y-1 group-hover:scale-[1.025]">
                  <Image
                    src={avatarSrc}
                    alt=""
                    fill
                    unoptimized
                    sizes="(min-width: 1280px) 280px, (min-width: 640px) 45vw, 90vw"
                    className="object-contain object-top drop-shadow-[0_18px_34px_rgba(0,0,0,0.56)] [mask-image:linear-gradient(180deg,black_0%,black_84%,transparent_100%)]"
                  />
                </div>
                <div className="absolute inset-x-5 bottom-4 z-20 rounded-xl bg-black/58 px-3 py-2.5 text-center shadow-[0_12px_30px_rgba(0,0,0,0.34)] backdrop-blur">
                  <div className="font-serif text-base font-semibold uppercase tracking-[0.10em] text-white">
                    {warrior.name}
                  </div>
                  <div className="mt-0.5 text-[9px] uppercase tracking-[0.16em] text-slate-300">
                    {warrior.role}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          href="/players"
          className="inline-flex justify-self-start text-sm font-semibold text-slate-300 transition hover:text-amber-100 lg:justify-self-end"
        >
          View all warriors <ChevronRight className="ml-2 h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

export default function HomePageClient({
  initialLobby,
  initialEventTile,
}: HomePageClientProps) {
  const { uid, isAdmin, isAuthenticated, loading, loginWithSteam, playerName, user } = useUserAuth();
  const { themeKey, tileThemeKey, viewMode, setViewMode } = useLobbyAppearance();
  const communityLobbyTile = useTileViewPreference("community_lobby");

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
  const aoe2hdPulse = lobby?.aoe2hdPulse ?? null;
  const liveTicker = lobby?.liveTicker ?? null;
  const woloMarket = lobby?.woloMarket ?? null;
  const isAdvancedLobby = communityLobbyTile.viewMode === "advanced";
  const isExtremeLobby = communityLobbyTile.viewMode === "extreme";
  const shouldShowShowcaseLobby = isAdvancedLobby || isExtremeLobby;

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
  }, [
    communityLobbyTile.viewMode,
    leaderboard.entries.length,
    leaderboard.trackedPlayers,
    tileThemeKey,
    viewMode,
  ]);

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
  const lobbyHeroGridClassName = isExtremeLobby
    ? "grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(24rem,0.82fr)] lg:items-start lg:gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(27rem,0.82fr)]"
    : "grid gap-5 lg:grid-cols-[1.2fr_0.95fr] lg:items-start lg:gap-7";

  return (
    <div className="space-y-4 overflow-x-hidden py-2 text-white sm:space-y-6 sm:py-3">
      {shouldShowShowcaseLobby ? (
        <>
          {isExtremeLobby ? <ExtremeFeaturedWarriors /> : <AdvancedFeaturedWarriors />}
          <LiveTickerStrip
            ticker={liveTicker}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
          <WolomaniaPromoTile eventTile={initialEventTile} />
          <WatchAndChatHero
            tournament={tournament}
            recentMatches={recentMatches}
            messages={messages}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            variant={isExtremeLobby ? "extreme" : "standard"}
            isAuthenticated={isAuthenticated}
            messageBody={messageBody}
            chatPending={chatPending}
            onMessageBodyChange={setMessageBody}
            onSendMessage={() => {
              void handleSendMessage();
            }}
            onLogin={() => loginWithSteam("/")}
          />
          <WoloMarketTile
            market={woloMarket}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
        </>
      ) : null}

      <section
        className={`overflow-hidden rounded-[1.75rem] border p-4 transition-all duration-500 sm:rounded-[2rem] sm:p-6 lg:p-8 ${heroShellClassName}`}
        style={heroStyle}
      >
        <div className={lobbyHeroGridClassName}>
          <div data-lobby-hero-stack="true" className={isExtremeLobby ? "flex min-w-0 flex-col gap-5" : "min-w-0"}>
            <LobbyHero
            liveConnected={liveConnected}
            authError={authError}
            authDetail={authDetail}
            lobbyError={lobbyError}
            isAuthenticated={isAuthenticated}
            loading={loading}
            leaderboard={leaderboard}
            recentMatches={recentMatches}
            wolo={wolo}
            aoe2hdPulse={aoe2hdPulse}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            tileViewMode={communityLobbyTile.viewMode}
            onTileViewModeChange={communityLobbyTile.setViewMode}
            onToggleTileViewMode={communityLobbyTile.toggleViewMode}
          />
          </div>

          <div
            className={`grid min-h-0 min-w-0 overflow-hidden gap-3.5 lg:grid-rows-[auto_minmax(0,1fr)] lg:self-start lg:pt-4 ${
              isExtremeLobby ? "lg:min-h-[96rem]" : ""
            }`}
            style={heroRailStyle}
          >
            <TournamentPanel
              tournament={tournament}
              themeKey={tileThemeKey}
              viewMode={viewMode}
              surface={isExtremeLobby ? "extreme" : "standard"}
              isAdmin={isAdmin}
              isAuthenticated={isAuthenticated}
              joinPending={joinPending}
              joinError={joinError}
              onJoinTournament={() => {
                void handleJoinTournament();
              }}
              onLogin={() => loginWithSteam("/")}
            />

            <div
              className={`h-full min-h-0 overflow-hidden ${
                isExtremeLobby ? "lg:h-[80rem] lg:min-h-[80rem] lg:max-h-[80rem]" : ""
              }`}
            >
              <TopWoloEarnersTile
                wolo={wolo}
                board={woloEarners}
                themeKey={tileThemeKey}
                viewMode={viewMode}
                surface={isExtremeLobby ? "extreme" : "standard"}
                className="h-full"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="lobby-chat" className="grid scroll-mt-24 gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
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
          surface={isExtremeLobby ? "extreme" : "standard"}
        />

        <div ref={rightColumnRef} className="flex min-w-0 flex-col gap-6">
          <OnlinePlayersPanel
            onlineUsers={onlineUsers}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
          <RecentMatchesPanel
            recentMatches={recentMatches}
            themeKey={tileThemeKey}
            viewMode={viewMode}
            surface={isExtremeLobby ? "extreme" : "standard"}
          />
        </div>
      </section>
    </div>
  );
}
