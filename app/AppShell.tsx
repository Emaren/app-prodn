"use client";

import React from "react";
import Link from "next/link";
import UserExperienceTracker from "@/components/analytics/UserExperienceTracker";
import HeaderInboxControl from "@/components/contact/HeaderInboxControl";
import HeaderMenu from "@/components/HeaderMenu";
import { LobbyThemePicker } from "@/components/lobby/LobbyAppearanceControls";
import {
  getLobbyHeaderSkin,
  getLobbyPresentationTone,
} from "@/components/lobby/lobbyPresentation";
import {
  LobbyAppearanceProvider,
  useLobbyAppearance,
} from "@/components/lobby/LobbyAppearanceContext";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";

const HEADER_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  countKey?: "requests";
}> = [
  { href: "/players", label: "Players" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/wolo", label: "$WOLO" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/about", label: "About" },
  { href: "/requests", label: "Requests", countKey: "requests" },
];

function InnerShell({ children }: { children: React.ReactNode }) {
  const { uid, playerName, setPlayerName, isAdmin } = useUserAuth();
  const { themeKey, setThemeKey, viewMode, textColor, pageStyle } = useLobbyAppearance();
  const [pendingBetsCount] = React.useState(0);
  const [liveGamesCount, setLiveGamesCount] = React.useState(0);
  const [requestCount, setRequestCount] = React.useState(0);
  const headerSkin = getLobbyHeaderSkin(themeKey);
  const headerTone = React.useMemo(
    () => getLobbyPresentationTone(themeKey, viewMode),
    [themeKey, viewMode]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function loadHeaderCounts() {
      try {
        const [liveResponse, requestsResponse] = await Promise.all([
          fetch("/api/live-games?summary=1", { cache: "no-store" }),
          fetch("/api/requests?summary=1", { cache: "no-store" }),
        ]);

        const livePayload = liveResponse.ok
          ? ((await liveResponse.json()) as { liveCount?: number })
          : {};
        const requestsPayload = requestsResponse.ok
          ? ((await requestsResponse.json()) as { openCount?: number })
          : {};

        if (!cancelled) {
          setLiveGamesCount(typeof livePayload.liveCount === "number" ? livePayload.liveCount : 0);
          setRequestCount(
            typeof requestsPayload.openCount === "number" ? requestsPayload.openCount : 0
          );
        }
      } catch (error) {
        console.warn("Failed to load header counts:", error);
      }
    }

    void loadHeaderCounts();
    const interval = window.setInterval(() => {
      void loadHeaderCounts();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      className="flex min-h-screen flex-col overflow-x-clip text-white transition-[background-image,background-color] duration-500"
      style={pageStyle}
      data-text-tone={textColor}
      data-theme-key={themeKey}
    >
      <UserExperienceTracker />
      <header
        className={`border-b px-3 py-4 backdrop-blur-xl transition-[background-color,border-color] duration-500 sm:px-4 ${headerSkin.shell}`}
      >
        <div className="mx-auto max-w-6xl overflow-visible">
          <div className="space-y-3 lg:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href="/lobby" className="inline-block min-w-0">
                  <div className={`text-[11px] uppercase tracking-[0.35em] transition ${headerTone.eyebrow}`}>
                    AoE2HD Bets
                  </div>
                  <h1 className="text-2xl font-semibold text-white transition hover:text-amber-100">
                    Tournament Lobby
                  </h1>
                </Link>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <HeaderInboxControl buttonClassName={headerSkin.surface} />
                <HeaderMenu
                  pendingBetsCount={pendingBetsCount}
                  playerName={playerName}
                  setPlayerName={setPlayerName}
                  uid={uid}
                  liveGamesCount={liveGamesCount}
                  requestCount={requestCount}
                  buttonClassName={headerSkin.surface}
                  menuClassName={headerSkin.popover}
                  linkClassName={headerSkin.menuItem}
                  logoutClassName={headerSkin.logout}
                />
              </div>
            </div>

            <nav className="flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
              <Link
                href="/live-games"
                className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-100 transition hover:border-red-300/40 hover:bg-red-500/15"
              >
                {liveGamesCount} Live Games🔥
              </Link>
              {HEADER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full border px-3 py-1.5 text-xs transition ${headerSkin.surface}`}
                >
                  {link.countKey === "requests" ? `${requestCount} ${link.label}` : link.label}
                </Link>
              ))}
              {isAdmin ? (
                <Link
                  href="/admin/user-list"
                  className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-500/15"
                >
                  Admin
                </Link>
              ) : null}
            </nav>

            <div className="flex justify-end">
              <LobbyThemePicker
                themeKey={themeKey}
                onThemeChange={setThemeKey}
                tone={headerTone}
                size="sm"
                className="gap-1.5"
              />
            </div>
          </div>

          <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-3">
            <div className="min-w-0">
              <Link href="/lobby" className="inline-block min-w-0">
                <div className={`text-xs uppercase tracking-[0.35em] transition ${headerTone.eyebrow}`}>
                  AoE2HD Bets
                </div>
                <h1 className="text-xl font-semibold text-white transition hover:text-amber-100">
                  Tournament Lobby
                </h1>
              </Link>
            </div>

            <nav className="flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [-ms-overflow-style:none] lg:justify-self-center lg:pb-0">
              <Link
                href="/live-games"
                className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs text-red-100 transition hover:border-red-300/40 hover:bg-red-500/15"
              >
                {liveGamesCount} Live Games🔥
              </Link>
              {HEADER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full border px-3 py-1 text-xs transition ${headerSkin.surface}`}
                >
                  {link.countKey === "requests" ? `${requestCount} ${link.label}` : link.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-col items-start gap-2 lg:justify-self-end lg:items-end">
              <div className="flex items-center justify-start gap-3 lg:justify-end">
                <HeaderInboxControl buttonClassName={headerSkin.surface} />
                <HeaderMenu
                  pendingBetsCount={pendingBetsCount}
                  playerName={playerName}
                  setPlayerName={setPlayerName}
                  uid={uid}
                  liveGamesCount={liveGamesCount}
                  requestCount={requestCount}
                  buttonClassName={headerSkin.surface}
                  menuClassName={headerSkin.popover}
                  linkClassName={headerSkin.menuItem}
                  logoutClassName={headerSkin.logout}
                />
              </div>
              <LobbyThemePicker
                themeKey={themeKey}
                onThemeChange={setThemeKey}
                tone={headerTone}
                size="sm"
                className="gap-1.5"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 py-4 sm:px-4">
        {children}
      </main>
      <Toaster richColors />
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <UserAuthProvider>
      <Providers>
        <LobbyAppearanceProvider>
          <InnerShell>{children}</InnerShell>
        </LobbyAppearanceProvider>
      </Providers>
    </UserAuthProvider>
  );
}
