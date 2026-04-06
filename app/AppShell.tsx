"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserExperienceTracker from "@/components/analytics/UserExperienceTracker";
import HeaderInboxControl from "@/components/contact/HeaderInboxControl";
import HeaderMenu from "@/components/HeaderMenu";
import SteamLoginButton from "@/components/SteamLoginButton";
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
  { href: "/bets", label: "Bets" },
  { href: "/players", label: "Players" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/wolo", label: "$WOLO" },
  { href: "/requests", label: "Requests", countKey: "requests" },
];

function HeaderPillLink({
  href,
  label,
  className,
  requestCount,
}: {
  href: string;
  label: string;
  className: string;
  requestCount?: number;
}) {
  const displayLabel = href === "/requests" ? `${requestCount ?? 0} Requests` : label;

  return (
    <Link
      href={href}
      className={`relative inline-flex items-center justify-center overflow-visible rounded-full border px-3 py-1.5 text-xs transition ${className}`}
    >
      <span className="relative z-10">{displayLabel}</span>
    </Link>
  );
}

function HeaderLiveGamesLink({ liveGamesCount }: { liveGamesCount: number }) {
  return (
    <Link
      href="/live-games"
      className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-100 transition hover:border-red-300/40 hover:bg-red-500/15"
    >
      {liveGamesCount} Live Games🔥
    </Link>
  );
}

function InnerShell({ children }: { children: React.ReactNode }) {
  const { uid, playerName, isAdmin } = useUserAuth();
  const pathname = usePathname();
  const { themeKey, setThemeKey, viewMode, textColor, pageStyle } = useLobbyAppearance();
  const [liveGamesCount, setLiveGamesCount] = React.useState(0);
  const [requestCount, setRequestCount] = React.useState(0);
  const isContactPage = pathname?.startsWith("/contact-emaren");
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
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div
      className={`flex w-full flex-col overflow-x-hidden text-white transition-[background-image,background-color] duration-500 ${
        isContactPage ? "h-[100dvh] overflow-y-hidden" : "min-h-screen"
      }`}
      style={pageStyle}
      data-text-tone={textColor}
      data-theme-key={themeKey}
    >
      <UserExperienceTracker />
      <header
        className={`relative z-[90] border-b px-3 py-4 backdrop-blur-xl transition-[background-color,border-color] duration-500 sm:px-4 ${headerSkin.shell}`}
      >
        <div className="mx-auto max-w-6xl overflow-visible">
          <div className="space-y-3 lg:hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 pt-1">
                <Link href="/lobby" className="inline-block min-w-0">
                  <div className={`text-[11px] uppercase tracking-[0.35em] transition ${headerTone.eyebrow}`}>
                    AoE2HD Bets
                  </div>
                  <h1 className="text-2xl font-semibold leading-tight text-white transition hover:text-amber-100">
                    Tournament Lobby
                  </h1>
                </Link>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
                {uid ? (
                  <div className="flex items-center justify-end gap-2">
                    <HeaderInboxControl buttonClassName={headerSkin.surface} />
                    <HeaderMenu
                      playerName={playerName}
                      uid={uid}
                      liveGamesCount={liveGamesCount}
                      requestCount={requestCount}
                      buttonClassName={headerSkin.surface}
                      menuClassName={headerSkin.popover}
                      linkClassName={headerSkin.menuItem}
                      logoutClassName={headerSkin.logout}
                    />
                  </div>
                ) : (
                  <SteamLoginButton
                    label="Steam Sign In"
                    className="inline-flex min-w-[10.5rem] items-center justify-center rounded-full bg-amber-300 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.18)] transition hover:bg-amber-200"
                  />
                )}

                <LobbyThemePicker
                  themeKey={themeKey}
                  onThemeChange={setThemeKey}
                  tone={headerTone}
                  size="sm"
                  className="justify-end self-end"
                  trackClassName="justify-end gap-2.5"
                />
              </div>
            </div>

            <nav className="w-full overflow-x-auto overflow-y-visible pb-1 pt-2 [scrollbar-width:none] [-ms-overflow-style:none]">
              <div className="flex min-w-max items-center gap-2 pr-1 whitespace-nowrap">
                {HEADER_LINKS.map((link, index) => (
                  <React.Fragment key={link.href}>
                    <HeaderPillLink
                      href={link.href}
                      label={link.label}
                      className={headerSkin.surface}
                      requestCount={link.countKey === "requests" ? requestCount : undefined}
                    />
                    {index === 0 ? <HeaderLiveGamesLink liveGamesCount={liveGamesCount} /> : null}
                  </React.Fragment>
                ))}
                {isAdmin ? (
                  <Link
                    href="/admin/user-list"
                    className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-500/15"
                  >
                    Admin
                  </Link>
                ) : null}
              </div>
            </nav>
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

            <nav className="flex max-w-full items-center gap-2 overflow-x-auto overflow-y-visible whitespace-nowrap pb-1 pt-2 [scrollbar-width:none] [-ms-overflow-style:none] lg:justify-self-center lg:pb-0">
              {HEADER_LINKS.map((link, index) => (
                <React.Fragment key={link.href}>
                  <HeaderPillLink
                    href={link.href}
                    label={link.label}
                    className={headerSkin.surface}
                    requestCount={link.countKey === "requests" ? requestCount : undefined}
                  />
                  {index === 0 ? <HeaderLiveGamesLink liveGamesCount={liveGamesCount} /> : null}
                </React.Fragment>
              ))}
            </nav>

            <div className="flex flex-col items-end gap-2 lg:justify-self-end">
              <div className="flex items-center justify-end gap-3">
                {uid ? <HeaderInboxControl buttonClassName={headerSkin.surface} /> : null}
                <HeaderMenu
                  playerName={playerName}
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
                className="justify-end self-end"
                trackClassName="justify-end gap-2.5"
              />
            </div>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-3 py-4 sm:px-4 ${
          isContactPage ? "overflow-hidden" : "overflow-x-hidden"
        }`}
      >
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
