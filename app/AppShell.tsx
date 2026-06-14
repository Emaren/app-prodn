"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Crown, Globe2, MessageSquare } from "lucide-react";
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
import { GlobalInstallAppPrompt } from "@/components/pwa/InstallAppPrompt";
import MobileFloatingNav from "@/components/pwa/MobileFloatingNav";
import AoE2WarFooter from "@/components/pwa/AoE2WarFooter";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";

const HEADER_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  countKey?: "requests";
}> = [
  { href: "/bets", label: "Bets" },
  { href: "/watch", label: "Watch" },
  { href: "/players", label: "Players" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/wolo", label: "$WOLO" },
  { href: "/staking", label: "Staking" },
];

const KINGDOM_LINKS = [
  { href: "/champions", label: "Champions", icon: Crown, body: "Belts, reigns, title rules" },
  { href: "/national-champions", label: "Nations", icon: Globe2, body: "Beacon map and national bounties" },
  { href: "/forum", label: "Forum", icon: MessageSquare, body: "War Room threads and community" },
] as const;

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
      className={`relative inline-flex items-center justify-center overflow-visible rounded-full border px-2.5 py-1.5 text-xs transition xl:px-3 ${className}`}
    >
      <span className="relative z-10">{displayLabel}</span>
    </Link>
  );
}

function KingdomNavItem({
  className,
  compact = false,
}: {
  className: string;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="group relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open Kingdom pages"
        onClick={() => setOpen(true)}
        className={`relative inline-flex items-center justify-center overflow-visible rounded-full border px-2.5 py-1.5 text-xs transition xl:px-3 ${className}`}
      >
        <span className="relative z-10">{compact ? "🏰" : "🏰 Kingdom"}</span>
      </button>

      <div
        className={`absolute right-0 top-full z-[110] w-[min(21rem,calc(100vw-1.5rem))] translate-y-2 opacity-0 transition duration-150 ${
          open
            ? "pointer-events-auto translate-y-3 opacity-100"
            : "pointer-events-none group-hover:pointer-events-auto group-hover:translate-y-3 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-3 group-focus-within:opacity-100"
        }`}
      >
        <div className="overflow-hidden rounded-[1.25rem] border border-amber-200/18 bg-[#07101a]/95 p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] backdrop-blur-xl">
          <div className="grid gap-1">
            {KINGDOM_LINKS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-[1rem] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-amber-100">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                    <div className="mt-0.5 truncate text-xs text-slate-500">{item.body}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
  const isStakingPage = pathname?.startsWith("/staking");
  const headerHref = isStakingPage ? "/staking" : "/lobby";
  const headerTitle = isStakingPage ? "WOLO Staking" : "Tournament Lobby";
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
      className={`flex w-full flex-col overflow-x-hidden text-white transition-[background-image,background-color] duration-500 ${
        isContactPage ? "h-[100dvh] overflow-y-hidden" : "min-h-screen"
      }`}
      style={pageStyle}
      data-text-tone={textColor}
      data-theme-key={themeKey}
    >
      <UserExperienceTracker />
      <header
        className={`relative z-[90] border-b px-3 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur-xl transition-[background-color,border-color] duration-500 sm:px-4 lg:py-4 ${headerSkin.shell}`}
      >
        <div className="mx-auto w-full max-w-6xl overflow-visible">
          <div className="space-y-4 lg:hidden">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Link href={headerHref} className="inline-block min-w-0">
                  <div className={`text-[11px] uppercase tracking-[0.35em] transition ${headerTone.eyebrow}`}>
                    AoE2HD Bets
                  </div>
                  <h1 className="text-2xl font-semibold leading-tight text-white transition hover:text-amber-100">
                    {headerTitle}
                  </h1>
                </Link>
              </div>

              <div className="flex min-w-0 max-w-[48%] shrink-0 flex-col items-end gap-2">
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
                    className="inline-flex max-w-full min-w-0 items-center justify-center truncate rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.18)] transition hover:bg-amber-200 sm:min-w-[10.5rem] sm:px-4 sm:py-2.5 sm:text-sm"
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

            <nav className="w-full overflow-visible pb-1 pt-2">
              <div className="flex flex-wrap items-center gap-2 pr-1">
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
                <KingdomNavItem className={headerSkin.surface} />
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

          <div className="hidden lg:grid lg:grid-cols-[minmax(9rem,1fr)_minmax(0,44rem)_minmax(9rem,1fr)] lg:items-center lg:gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <div className="min-w-0">
              <Link href={headerHref} className="inline-block min-w-0">
                <div className={`text-xs uppercase tracking-[0.35em] transition ${headerTone.eyebrow}`}>
                  AoE2HD Bets
                </div>
                <h1 className="text-xl font-semibold text-white transition hover:text-amber-100">
                  {headerTitle}
                </h1>
              </Link>
            </div>

            <nav className="flex max-w-full flex-wrap items-center justify-center gap-1.5 overflow-visible pb-1 pt-2 lg:justify-self-center lg:pb-0 xl:gap-2">
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
              <KingdomNavItem className={headerSkin.surface} compact />
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
        className={`mx-auto flex min-h-0 min-w-0 w-full max-w-6xl flex-1 flex-col px-3 py-4 pb-32 sm:px-4 lg:pb-4 ${
          isContactPage ? "overflow-hidden" : "overflow-x-hidden"
        }`}
      >
        <GlobalInstallAppPrompt />
        {children}
      </main>
      {!isContactPage ? <AoE2WarFooter /> : null}
      <MobileFloatingNav />
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
