"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Castle, Crown, Globe2, GraduationCap, MessageSquare, Store, UsersRound, X } from "lucide-react";
import { createPortal } from "react-dom";
import UserExperienceTracker from "@/components/analytics/UserExperienceTracker";
import HeaderInboxControl from "@/components/contact/HeaderInboxControl";
import UniversalTranslator from "@/components/i18n/UniversalTranslator";
import HeaderMenu from "@/components/HeaderMenu";
import SteamLoginButton from "@/components/SteamLoginButton";
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
import { getTileViewMode } from "@/lib/tileViewPreferences";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";
import { UniversalLanguageProvider } from "@/context/UniversalLanguageContext";

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
  { href: "/kingdom", label: "Kingdom", icon: Castle, body: "The realm, crowns, and league map" },
  { href: "/champions", label: "Champions", icon: Crown, body: "Belts, reigns, title rules" },
  { href: "/national-champions", label: "Nations", icon: Globe2, body: "Beacon map and national bounties" },
  { href: "/clans", label: "Clans", icon: UsersRound, body: "Teams, houses, and clan halls" },
  { href: "/academy", label: "Academy", icon: GraduationCap, body: "Lessons, build orders, replay study" },
  { href: "/market", label: "Marketplace", icon: Store, body: "Player shops, craft, and commissions" },
  { href: "/forum", label: "Forum", icon: MessageSquare, body: "War Room threads and community" },
] as const;

const PAGE_HEADINGS: ReadonlyArray<{ prefix: string; title: string }> = [
  { prefix: "/admin/hero-studio", title: "Hero Studio" },
  { prefix: "/admin/events", title: "Featured Event Studio" },
  { prefix: "/admin", title: "Operator Command" },
  { prefix: "/staking/stakers", title: "Staking Hall" },
  { prefix: "/staking", title: "WOLO Staking" },
  { prefix: "/national-champions", title: "National Champions" },
  { prefix: "/clans", title: "Clan Halls" },
  { prefix: "/academy", title: "Academy" },
  { prefix: "/market", title: "Marketplace" },
  { prefix: "/champions", title: "Championship Belts" },
  { prefix: "/kingdom", title: "The Kingdom" },
  { prefix: "/forum", title: "War Room Forum" },
  { prefix: "/live-games", title: "Live Games" },
  { prefix: "/game-stats", title: "Battle Archive" },
  { prefix: "/matchups", title: "Rivalry Matchup" },
  { prefix: "/rivalries", title: "Rivalries" },
  { prefix: "/players", title: "Player Registry" },
  { prefix: "/tournaments", title: "Tournament Grounds" },
  { prefix: "/watch", title: "Watch Arena" },
  { prefix: "/challenge", title: "Challenge Hall" },
  { prefix: "/zodiac", title: "Train Under Zodiac" },
  { prefix: "/bets", title: "Betting Hall" },
  { prefix: "/war-chest", title: "War Chest" },
  { prefix: "/wolochain", title: "WoloChain" },
  { prefix: "/wolo", title: "WOLO Economy" },
  { prefix: "/wallet", title: "WOLO Wallet" },
  { prefix: "/profile", title: "Player Profile" },
  { prefix: "/requests", title: "Match Requests" },
  { prefix: "/contact-emaren", title: "Command Inbox" },
  { prefix: "/download", title: "Download Watcher" },
  { prefix: "/upload", title: "Upload Replay" },
  { prefix: "/app", title: "Today’s War Room" },
  { prefix: "/lobby", title: "Tournament Lobby" },
];

function getPageHeading(pathname: string | null) {
  if (!pathname || pathname === "/") return "Tournament Lobby";
  return PAGE_HEADINGS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  )?.title ?? "AoE2WAR";
}

function isRouteActive(pathname: string | null, href: string) {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

function HeaderPillLink({
  href,
  label,
  className,
  active,
  requestCount,
}: {
  href: string;
  label: string;
  className: string;
  active?: boolean;
  requestCount?: number;
}) {
  const displayLabel = href === "/requests" ? `${requestCount ?? 0} Requests` : label;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex min-h-9 shrink-0 items-center justify-center overflow-visible rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-[0.01em] transition duration-200 xl:px-3.5 ${
        active
          ? "border-amber-200/35 bg-amber-300/12 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(251,191,36,0.08)]"
          : className
      }`}
    >
      <span className="relative z-10">{displayLabel}</span>
    </Link>
  );
}

function KingdomNavItem({
  className,
  active,
}: {
  className: string;
  active?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [portalReady, setPortalReady] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = React.useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 130);
  }, [clearCloseTimer]);

  React.useEffect(() => {
    setPortalReady(true);
    return clearCloseTimer;
  }, [clearCloseTimer]);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
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
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
      onFocusCapture={openMenu}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open Kingdom pages"
        onClick={() => {
          if (window.matchMedia("(max-width: 639px), (hover: none)").matches) {
            setOpen((value) => !value);
          }
        }}
        className={`relative inline-flex min-h-9 min-w-10 shrink-0 items-center justify-center overflow-visible rounded-full border px-3 py-1.5 text-xs transition duration-200 ${
          active
            ? "border-amber-200/40 bg-amber-300/12 shadow-[0_0_24px_rgba(251,191,36,0.1)]"
            : className
        }`}
      >
        <span className="relative z-10">🏰</span>
      </button>

      <div
        className={`absolute left-1/2 top-full z-[220] hidden w-[22rem] -translate-x-1/2 pt-3 transition duration-150 sm:block ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-1 opacity-0"
        }`}
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
      >
        <KingdomMenuPanel onNavigate={() => setOpen(false)} />
      </div>

      {portalReady && open
        ? createPortal(
            <div className="fixed inset-0 z-[240] sm:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-[#02060f]/78 backdrop-blur-[3px]"
                onClick={() => setOpen(false)}
                aria-label="Close Kingdom menu"
              />
              <div
                ref={panelRef}
                className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] overflow-y-auto rounded-[1.65rem] border border-amber-200/18 bg-[#07101a]/98 p-3 shadow-[0_34px_110px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
              >
                <div className="mb-2 flex items-center justify-between gap-3 px-2 py-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.34em] text-amber-100/55">
                      AoE2WAR
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">The Kingdom</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300"
                    aria-label="Close Kingdom menu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <KingdomMenuPanel onNavigate={() => setOpen(false)} mobile />
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function KingdomMenuPanel({
  onNavigate,
  mobile = false,
}: {
  onNavigate: () => void;
  mobile?: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[1.35rem] border border-amber-200/14 bg-[linear-gradient(145deg,rgba(13,25,42,0.98),rgba(5,12,22,0.98))] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] ${
        mobile ? "border-white/8 shadow-none" : "backdrop-blur-xl"
      }`}
      role="menu"
      aria-label="Kingdom pages"
    >
      <div className="grid gap-1">
        {KINGDOM_LINKS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={onNavigate}
              className="group/item flex items-center gap-3 rounded-[1rem] px-3 py-3 text-left transition hover:bg-white/[0.07]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/12 bg-amber-300/[0.06] text-amber-100 transition group-hover/item:border-amber-200/25 group-hover/item:bg-amber-300/10">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">{item.label}</div>
                <div className="mt-0.5 text-xs text-slate-500">{item.body}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function HeaderLiveGamesLink({
  liveGamesCount,
  active,
}: {
  liveGamesCount: number;
  active?: boolean;
}) {
  return (
    <Link
      href="/live-games"
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold transition duration-200 ${
        active
          ? "border-red-300/45 bg-red-500/18 text-red-50 shadow-[0_0_24px_rgba(248,113,113,0.1)]"
          : "border-red-400/25 bg-red-500/10 text-red-100 hover:border-red-300/40 hover:bg-red-500/15"
      }`}
    >
      {liveGamesCount} Live Games🔥
    </Link>
  );
}

function InnerShell({ children }: { children: React.ReactNode }) {
  const { uid, playerName, isAdmin } = useUserAuth();
  const pathname = usePathname();
  const { themeKey, viewMode, textColor, pageStyle, tileViewPreferences } =
    useLobbyAppearance();
  const [liveGamesCount, setLiveGamesCount] = React.useState(0);
  const [requestCount, setRequestCount] = React.useState(0);
  const isContactPage = pathname?.startsWith("/contact-emaren");
  const isLobbySurface = pathname === "/" || pathname?.startsWith("/lobby");
  const isMediaManagerSurface = pathname?.startsWith("/admin/media-assets");
  const isAcademySurface = pathname?.startsWith("/academy");
  const isClanSurface = pathname?.startsWith("/clans");
  const isNationalChampionsSurface = pathname?.startsWith("/national-champions");
  const isBetsSurface = pathname === "/bets";
  const isBetDetailSurface = Boolean(pathname?.match(/^\/bets\/[^/]+/));
  const isFullWidthPrestigeSurface =
    isBetsSurface ||
    pathname?.startsWith("/academy") ||
    pathname?.startsWith("/market") ||
    pathname?.startsWith("/kingdom") ||
    pathname?.startsWith("/challenge");
  const communityLobbyViewMode = getTileViewMode(
    tileViewPreferences,
    "community_lobby"
  );
  const liveGamesViewMode = getTileViewMode(tileViewPreferences, "live_games");
  const isLiveGamesSurface = pathname?.startsWith("/live-games");
  const forumViewMode = getTileViewMode(tileViewPreferences, "forum");
  const isForumSurface = pathname?.startsWith("/forum");
  const activeSurfaceViewMode = isLiveGamesSurface
    ? liveGamesViewMode
    : isForumSurface
      ? forumViewMode
      : communityLobbyViewMode;
  const immersiveShellMaxWidth =
    activeSurfaceViewMode === "extreme"
      ? "max-w-[96rem]"
      : activeSurfaceViewMode === "advanced"
        ? "max-w-[75rem]"
        : "max-w-[65rem]";
  const headerTitle = getPageHeading(pathname);
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
      className={`${isAcademySurface ? "academy-route-shell" : ""} flex w-full flex-col overflow-x-hidden text-white transition-[background-image,background-color] duration-500 ${
        isContactPage ? "h-[100dvh] overflow-y-hidden" : "min-h-screen"
      }`}
      style={
        isAcademySurface
          ? {
              ...pageStyle,
              backgroundColor: "#06070a",
              backgroundImage:
                "radial-gradient(78rem 38rem at 10% 0%, rgba(68, 9, 21, 0.24), transparent 66%), radial-gradient(58rem 32rem at 90% 0%, rgba(68, 71, 79, 0.12), transparent 70%), linear-gradient(180deg, #05070b 0%, #06070a 42%, #090407 100%)",
            }
          : pageStyle
      }
      data-text-tone={textColor}
      data-theme-key={themeKey}
    >
      <UserExperienceTracker />
      <header
        className={`sticky top-0 z-[180] overflow-visible border-b px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] backdrop-blur-2xl transition-[background-color,border-color] duration-500 sm:px-4 lg:py-3 ${headerSkin.shell}`}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-16 -top-20 h-44 w-72 rounded-full bg-amber-300/[0.055] blur-3xl" />
          <div className="absolute -right-20 -top-20 h-44 w-72 rounded-full bg-sky-300/[0.065] blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-100/25 to-transparent" />
        </div>

        <div className={`relative mx-auto w-full overflow-visible ${
          isNationalChampionsSurface || isBetDetailSurface ? "max-w-[96rem]" : "max-w-[90rem]"
        }`}>
          <div className="lg:hidden">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Link
                href="/"
                className="group relative flex shrink-0 items-center rounded-xl px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40"
                aria-label="AOE2WAR home"
              >
                <Image
                  src="/brand/aoe2war-logo.webp"
                  alt="AOE2WAR"
                  width={972}
                  height={155}
                  priority
                  className="h-auto w-[8.25rem] drop-shadow-[0_5px_18px_rgba(251,191,36,0.16)] transition duration-200 group-hover:brightness-110 min-[430px]:w-[9.25rem]"
                />
              </Link>

              <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
                <UniversalTranslator tone={isAcademySurface ? "academy" : "blue"} />
                {uid ? <HeaderInboxControl buttonClassName={`${headerSkin.surface} h-10 w-10`} /> : null}
                <HeaderMenu
                  playerName={playerName}
                  uid={uid}
                  liveGamesCount={liveGamesCount}
                  requestCount={requestCount}
                  buttonClassName={`${headerSkin.surface} min-h-10 px-3 py-2`}
                  menuClassName={headerSkin.popover}
                  linkClassName={headerSkin.menuItem}
                  logoutClassName={headerSkin.logout}
                />
              </div>
            </div>

            <div className="mt-3 flex min-w-0 items-end justify-between gap-3 border-t border-white/[0.065] pt-3">
              <div className="min-w-0">
                <div className={`text-[9px] font-semibold uppercase tracking-[0.34em] ${headerTone.eyebrow}`}>
                  Current page
                </div>
                <h1 className="mt-0.5 truncate text-lg font-semibold leading-tight text-white">
                  {headerTitle}
                </h1>
              </div>
              <div className="shrink-0 rounded-full border border-amber-200/12 bg-amber-300/[0.055] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-100/65">
                AoE2 HD
              </div>
            </div>

            <nav className="aoe2-nav-scroll -mx-3 mt-3 overflow-x-auto px-3 pb-0.5 sm:-mx-4 sm:px-4">
              <div className="flex min-w-max items-center gap-2 pr-4">
                <KingdomNavItem
                  className={headerSkin.surface}
                  active={KINGDOM_LINKS.some((link) => isRouteActive(pathname, link.href))}
                />
                {HEADER_LINKS.map((link, index) => (
                  <React.Fragment key={link.href}>
                    <HeaderPillLink
                      href={link.href}
                      label={link.label}
                      className={headerSkin.surface}
                      active={isRouteActive(pathname, link.href)}
                      requestCount={link.countKey === "requests" ? requestCount : undefined}
                    />
                    {index === 0 ? (
                      <HeaderLiveGamesLink
                        liveGamesCount={liveGamesCount}
                        active={isRouteActive(pathname, "/live-games")}
                      />
                    ) : null}
                  </React.Fragment>
                ))}
                {isAdmin ? (
                  <Link
                    href="/admin/user-list"
                    className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-500/15"
                  >
                    Admin
                  </Link>
                ) : null}
              </div>
            </nav>
          </div>

          <div className="hidden lg:grid lg:grid-cols-[minmax(12rem,0.85fr)_minmax(0,2fr)_auto] lg:items-center lg:gap-4">
            <div className="flex min-w-0 items-center gap-2 xl:gap-3">
              <Link
                href="/"
                className="group relative flex shrink-0 items-center rounded-xl px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40"
                aria-label="AOE2WAR home"
              >
                <Image
                  src="/brand/aoe2war-logo.webp"
                  alt="AOE2WAR"
                  width={972}
                  height={155}
                  priority
                  className="h-auto w-[6.5rem] drop-shadow-[0_5px_18px_rgba(251,191,36,0.16)] transition duration-200 group-hover:brightness-110 xl:w-[8.7rem]"
                />
              </Link>
              <div className="min-w-0 border-l border-white/10 pl-2.5 xl:pl-3">
                <div className={`whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.24em] xl:text-[9px] xl:tracking-[0.3em] ${headerTone.eyebrow}`}>
                  Current page
                </div>
                <h1 className="mt-0.5 truncate text-sm font-semibold text-white xl:text-base">
                  {headerTitle}
                </h1>
              </div>
            </div>

            <nav className="flex max-w-full items-center justify-center gap-1.5 overflow-visible lg:justify-self-center xl:gap-2">
              {HEADER_LINKS.map((link, index) => (
                <React.Fragment key={link.href}>
                  <HeaderPillLink
                    href={link.href}
                    label={link.label}
                    className={headerSkin.surface}
                    active={isRouteActive(pathname, link.href)}
                    requestCount={link.countKey === "requests" ? requestCount : undefined}
                  />
                  {index === 0 ? (
                    <HeaderLiveGamesLink
                      liveGamesCount={liveGamesCount}
                      active={isRouteActive(pathname, "/live-games")}
                    />
                  ) : null}
                </React.Fragment>
              ))}
              <KingdomNavItem
                className={headerSkin.surface}
                active={KINGDOM_LINKS.some((link) => isRouteActive(pathname, link.href))}
              />
            </nav>

            <div className="flex items-center justify-end gap-2 lg:justify-self-end">
              {uid ? (
                <>
                  <UniversalTranslator
                    tone={isAcademySurface ? "academy" : "blue"}
                  />
                  <HeaderInboxControl buttonClassName={`${headerSkin.surface} h-10 w-10`} />
                  <HeaderMenu
                    playerName={playerName}
                    uid={uid}
                    liveGamesCount={liveGamesCount}
                    requestCount={requestCount}
                    buttonClassName={`${headerSkin.surface} min-h-10 px-3 py-2`}
                    menuClassName={headerSkin.popover}
                    linkClassName={headerSkin.menuItem}
                    logoutClassName={headerSkin.logout}
                  />
                </>
              ) : (
                <>
                  <UniversalTranslator
                    tone={isAcademySurface ? "academy" : "blue"}
                  />
                  <SteamLoginButton
                    label="Steam Sign In"
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.18)] transition hover:bg-amber-200"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col py-4 pb-32 transition-[max-width] duration-300 lg:pb-4 ${
          isMediaManagerSurface
            ? "max-w-none px-3 sm:px-4 2xl:px-6"
            : `px-3 sm:px-4 ${
                isLobbySurface || isLiveGamesSurface || isForumSurface
                  ? immersiveShellMaxWidth
                  : isFullWidthPrestigeSurface || isClanSurface
                    ? "max-w-[90rem]"
                    : isNationalChampionsSurface || isBetDetailSurface
                      ? "max-w-[96rem]"
                      : "max-w-6xl"
              }`
        } ${isAcademySurface ? "academy-shell-skin" : ""} ${
          isContactPage ? "overflow-hidden" : isMediaManagerSurface ? "overflow-x-visible" : "overflow-x-hidden"
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
        <UniversalLanguageProvider>
          <LobbyAppearanceProvider>
            <InnerShell>{children}</InnerShell>
          </LobbyAppearanceProvider>
        </UniversalLanguageProvider>
      </Providers>
    </UserAuthProvider>
  );
}
