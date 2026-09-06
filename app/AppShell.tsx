"use client";

import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Anvil, BarChart3, Bot, BrainCircuit, Castle, Crown, Eye, Globe2, GraduationCap, Hammer, MessageSquare, Radio, Scale, Store, Target, UsersRound, X, Zap } from "lucide-react";
import { createPortal } from "react-dom";
import SpeedRuntime from "@/components/speed/SpeedRuntime";
import SpeedWebVitals from "@/components/speed/SpeedWebVitals";
import AoE2WarIntlProvider from "@/components/i18n/AoE2WarIntlProvider";
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
import { getTileViewMode } from "@/lib/tileViewPreferences";
import { trackLeaderboardEvent } from "@/lib/leaderboardTelemetry";
import {
  PAGE_CHANGE_NOTICE_STORAGE_KEY,
  getUnseenPageChangeHrefs,
  markPageChangeNoticeSeen,
  pageChangeNoticeForPathname,
  parseSeenPageChangeVersions,
} from "@/lib/pageChangeNotices";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";
import { UniversalLanguageProvider } from "@/context/UniversalLanguageContext";
import { livingKingdomRealmForPath } from "@/lib/livingKingdom/realms";

const HeaderInboxControl = dynamic(
  () => import("@/components/contact/HeaderInboxControl"),
  { ssr: false }
);
const SpeedProof = dynamic(() => import("@/components/speed/SpeedProof"), {
  ssr: false,
});
const UserExperienceTracker = dynamic(
  () => import("@/components/analytics/UserExperienceTracker"),
  { ssr: false }
);
const ClientFlightRecorder = dynamic(
  () => import("@/components/analytics/ClientFlightRecorder"),
  { ssr: false }
);
const LivingKingdomClient = dynamic(
  () => import("@/components/presence/LivingKingdomClient"),
  { ssr: false }
);
const MobileFloatingNav = dynamic(
  () => import("@/components/pwa/MobileFloatingNav"),
  { ssr: false }
);
const AoE2WarFooter = dynamic(
  () => import("@/components/pwa/AoE2WarFooter"),
  { ssr: false }
);
const ClanWarhouseFooter = dynamic(
  () => import("@/components/clans/ClanWarhouseFooter"),
  { ssr: false }
);
const GlobalInstallAppPrompt = dynamic(
  () =>
    import("@/components/pwa/InstallAppPrompt").then(
      (module) => module.GlobalInstallAppPrompt
    ),
  { ssr: false }
);
const Toaster = dynamic(
  () => import("sonner").then((module) => module.Toaster),
  { ssr: false }
);

const RadioWoloGlobalPlayer = dynamic(
  () => import("@/components/radio/RadioWoloGlobalPlayer"),
  { ssr: false }
);

const HEADER_LINKS: ReadonlyArray<{
  href: string;
  label: string;
  countKey?: "requests";
}> = [
  { href: "/wargraph", label: "WarGraphs" },
  { href: "/bets", label: "Bets" },
  { href: "/watch", label: "Watch" },
  { href: "/players", label: "Players" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/wolo", label: "$WOLO" },
  { href: "/staking", label: "Staking" },
];

const NAV_ACTIVE_EFFECT_STORAGE_KEY =
  "aoe2war:header-active-effect:v1";

const NAV_ACTIVE_EFFECTS = [
  "shadow-[0_10px_28px_-19px_rgba(251,191,36,0.35)]",
  "shadow-[0_0_24px_-16px_rgba(253,230,138,0.24)]",
  "shadow-[0_0_20px_-15px_rgba(226,232,240,0.20)]",
  "shadow-[0_9px_28px_-19px_rgba(125,211,252,0.28)]",
  "shadow-[0_9px_28px_-19px_rgba(196,181,253,0.24)]",
] as const;

function isModifiedHeaderNavClick(
  event: React.MouseEvent<HTMLElement>
) {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

const KINGDOM_LINKS = [
  { href: "/kingdom", label: "Kingdom", icon: Castle, body: "The realm, crowns, and league map" },
  { href: "/oracle", label: "The Oracle", icon: Eye, body: "Price the future of the Kingdom" },
  { href: "/leaderboard", label: "Leaderboard", icon: BarChart3, body: "Ratings, records, and ranked warriors" },
  { href: "/champions", label: "Champions", icon: Crown, body: "Belts, reigns, title rules" },
  { href: "/national-champions", label: "Nations", icon: Globe2, body: "Beacon map and national bounties" },
  { href: "/clans", label: "Clans", icon: UsersRound, body: "Teams, houses, and clan halls" },
  { href: "/academy", label: "Academy", icon: GraduationCap, body: "Lessons, build orders, replay study" },
  { href: "/market", label: "Marketplace", icon: Store, body: "Player shops, craft, and commissions" },
  { href: "/ai", label: "AI Council", icon: Bot, body: "Ask the public house council" },
  { href: "/kingdom-intelligence", label: "Kingdom Intelligence", icon: BrainCircuit, body: "Watch the kingdom reason about itself" },
  { href: "/bounties", label: "Bounties", icon: Target, body: "Open opportunities and payout proof" },
  { href: "/forum", label: "Forum", icon: MessageSquare, body: "War Room threads and community" },
  { href: "/radio", label: "Radio WOLO", icon: Radio, body: "Kingdom music and creator submissions" },
  { href: "/workshop", label: "The Workshop", icon: Hammer, body: "Watch the kingdom being forged in public" },
  { href: "/game-stats", label: "Parser Observatory", icon: BarChart3, body: "Replay corpus, coverage, and unknowns" },
  { href: "/traffic", label: "Traffic Observatory", icon: Globe2, body: "Traffic, suspected humans, and confirmed humans" },
  { href: "/kingdom-forge", label: "Kingdom Forge", icon: Anvil, body: "Forge Power, projects, milestones, and deeds" },
  { href: "/round-chamber", label: "The Chamber", icon: Scale, body: "Proposals, civic ballots, and public mandates" },
  { href: "/statistics", label: "Kingdom Statistics", icon: BarChart3, body: "WOLO, users, bets, games, watchers, and growth" },
  { href: "/speed", label: "Speed", icon: Zap, body: "Your live performance and readiness measurements" },
] as const;

const PAGE_HEADINGS: ReadonlyArray<{ prefix: string; title: string }> = [
  { prefix: "/admin/ai", title: "AI Command Center" },
  { prefix: "/admin/bounties", title: "Bounty Command Center" },
  { prefix: "/admin/radio", title: "Radio WOLO Desk" },
  { prefix: "/admin/workshop", title: "Workshop Command Center" },
  { prefix: "/admin/hero-studio", title: "Hero Studio" },
  { prefix: "/admin/events", title: "Featured Event Studio" },
  { prefix: "/admin", title: "Operator Command" },
  { prefix: "/staking/stakers", title: "Staking Hall" },
  { prefix: "/staking", title: "WOLO Staking" },
  { prefix: "/leaderboard/og", title: "Game Stats" },
  { prefix: "/leaderboard", title: "HD Leaderboard" },
  { prefix: "/national-champions", title: "National Champions" },
  { prefix: "/clans", title: "Clan Halls" },
  { prefix: "/academy", title: "Academy" },
  { prefix: "/market", title: "Marketplace" },
  { prefix: "/champions", title: "Championship Belts" },
  { prefix: "/kingdom-forge", title: "Kingdom Forge" },
  { prefix: "/kingdom-intelligence", title: "Kingdom Intelligence" },
  { prefix: "/kingdom", title: "The Kingdom" },
  { prefix: "/wargraph", title: "WarGraph" },
  { prefix: "/round-chamber", title: "The Chamber" },
  { prefix: "/oracle", title: "The Oracle" },
  { prefix: "/forum", title: "War Room Forum" },
  { prefix: "/live-games", title: "Live Games" },
  { prefix: "/game-stats", title: "Parser Observatory" },
  { prefix: "/bounties", title: "Bounty Board" },
  { prefix: "/ai", title: "AI Council" },
  { prefix: "/radio", title: "Radio WOLO" },
  { prefix: "/workshop", title: "The Workshop" },
  { prefix: "/submit", title: "Submit to Radio WOLO" },
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
  { prefix: "/traffic", title: "Traffic Observatory" },
  { prefix: "/statistics", title: "Kingdom Statistics" },
  { prefix: "/speed", title: "Speed Observatory" },
];

function getPageHeading(pathname: string | null) {
  if (!pathname || pathname === "/") return "Tournament Lobby";
  return PAGE_HEADINGS.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)
  )?.title ?? "AoE2WAR";
}


const HEADER_LINK_KEYS: Readonly<Partial<Record<string, string>>> = {
  "/bets": "nav.bets",
  "/watch": "nav.watch",
  "/players": "nav.players",
  "/rivalries": "nav.rivalries",
  "/wolo": "nav.wolo",
  "/staking": "nav.staking",
};

const KINGDOM_COPY_KEYS: Readonly<
  Record<
    string,
    {
      label: string;
      body: string;
    }
  >
> = {
  "/kingdom": {
    label: "kingdomEntries.kingdom.label",
    body: "kingdomEntries.kingdom.body",
  },
  "/leaderboard": {
    label: "kingdomEntries.leaderboard.label",
    body: "kingdomEntries.leaderboard.body",
  },
  "/champions": {
    label: "kingdomEntries.champions.label",
    body: "kingdomEntries.champions.body",
  },
  "/national-champions": {
    label: "kingdomEntries.nations.label",
    body: "kingdomEntries.nations.body",
  },
  "/clans": {
    label: "kingdomEntries.clans.label",
    body: "kingdomEntries.clans.body",
  },
  "/academy": {
    label: "kingdomEntries.academy.label",
    body: "kingdomEntries.academy.body",
  },
  "/market": {
    label: "kingdomEntries.marketplace.label",
    body: "kingdomEntries.marketplace.body",
  },
  "/forum": {
    label: "kingdomEntries.forum.label",
    body: "kingdomEntries.forum.body",
  },
  "/bounties": {
    label: "kingdomEntries.bounties.label",
    body: "kingdomEntries.bounties.body",
  },
  "/ai": {
    label: "kingdomEntries.aiCouncil.label",
    body: "kingdomEntries.aiCouncil.body",
  },
  "/radio": {
    label: "kingdomEntries.radio.label",
    body: "kingdomEntries.radio.body",
  },
  "/workshop": {
    label: "kingdomEntries.workshop.label",
    body: "kingdomEntries.workshop.body",
  },
  "/game-stats": {
    label: "kingdomEntries.parser.label",
    body: "kingdomEntries.parser.body",
  },
  "/traffic": {
    label: "kingdomEntries.traffic.label",
    body: "kingdomEntries.traffic.body",
  },
  "/statistics": {
    label: "kingdomEntries.statistics.label",
    body: "kingdomEntries.statistics.body",
  },
  "/speed": {
    label: "kingdomEntries.speed.label",
    body: "kingdomEntries.speed.body",
  },
};

const PAGE_HEADING_KEYS: Readonly<Record<string, string>> = {
  "AI Command Center": "pages.aiCommandCenter",
  "Bounty Command Center": "pages.bountyCommandCenter",
  "Radio WOLO Desk": "pages.radioDesk",
  "Workshop Command Center": "pages.workshopCommandCenter",
  "Hero Studio": "pages.heroStudio",
  "Featured Event Studio": "pages.featuredEventStudio",
  "Operator Command": "pages.operatorCommand",
  "Staking Hall": "pages.stakingHall",
  "WOLO Staking": "pages.woloStaking",
  "Game Stats": "pages.gameStats",
  "HD Leaderboard": "pages.hdLeaderboard",
  "National Champions": "pages.nationalChampions",
  "Clan Halls": "pages.clanHalls",
  "Academy": "pages.academy",
  "Marketplace": "pages.marketplace",
  "Championship Belts": "pages.championshipBelts",
  "The Kingdom": "pages.kingdom",
  "War Room Forum": "pages.warRoomForum",
  "Live Games": "pages.liveGames",
  "Parser Observatory": "pages.parserObservatory",
  "Bounty Board": "pages.bountyBoard",
  "AI Council": "pages.aiCouncil",
  "Radio WOLO": "pages.radioWolo",
  "The Workshop": "pages.workshop",
  "Submit to Radio WOLO": "pages.submitRadio",
  "Rivalry Matchup": "pages.rivalryMatchup",
  "Rivalries": "pages.rivalries",
  "Player Registry": "pages.playerRegistry",
  "Tournament Grounds": "pages.tournamentGrounds",
  "Watch Arena": "pages.watchArena",
  "Challenge Hall": "pages.challengeHall",
  "Train Under Zodiac": "pages.trainUnderZodiac",
  "Betting Hall": "pages.bettingHall",
  "War Chest": "pages.warChest",
  "WoloChain": "pages.woloChain",
  "WOLO Economy": "pages.woloEconomy",
  "WOLO Wallet": "pages.woloWallet",
  "Player Profile": "pages.playerProfile",
  "Match Requests": "pages.matchRequests",
  "Command Inbox": "pages.commandInbox",
  "Download Watcher": "pages.downloadWatcher",
  "Upload Replay": "pages.uploadReplay",
  "Today’s War Room": "pages.todaysWarRoom",
  "Tournament Lobby": "pages.tournamentLobby",
  "Traffic Observatory": "pages.trafficObservatory",
  "Kingdom Statistics": "pages.kingdomStatistics",
  "Speed Observatory": "pages.speedObservatory",
  "AoE2WAR": "pages.aoe2war",
};

function getPageHeadingKey(
  pathname: string | null
) {
  const englishHeading =
    getPageHeading(pathname);

  return PAGE_HEADING_KEYS[englishHeading] ?? null;
}

function isRouteActive(pathname: string | null, href: string) {
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

function presenceDoorForHref(href: string) {
  return livingKingdomRealmForPath(href) ?? undefined;
}

function usePageChangeNotices() {
  const pathname = usePathname();
  const { uid } = useUserAuth();
  const [unseenHrefs, setUnseenHrefs] = React.useState<Set<string>>(new Set());

  const syncAnonymous = React.useCallback(() => {
    try {
      const seen = parseSeenPageChangeVersions(
        window.localStorage.getItem(PAGE_CHANGE_NOTICE_STORAGE_KEY)
      );
      setUnseenHrefs(new Set(getUnseenPageChangeHrefs(seen)));
    } catch {
      setUnseenHrefs(new Set());
    }
  }, []);

  const syncAuthenticated = React.useCallback(async () => {
    try {
      const response = await fetch("/api/page-change-notices", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        unseen?: string[];
      };
      if (!response.ok) throw new Error("Page-change state failed");
      setUnseenHrefs(new Set(payload.unseen || []));
    } catch {
      // Keep current in-memory truth rather than manufacturing dots.
    }
  }, []);

  React.useEffect(() => {
    if (uid) {
      void syncAuthenticated();
      const handleFocus = () => void syncAuthenticated();
      window.addEventListener("focus", handleFocus);
      return () => window.removeEventListener("focus", handleFocus);
    }

    syncAnonymous();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === PAGE_CHANGE_NOTICE_STORAGE_KEY) {
        syncAnonymous();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [syncAnonymous, syncAuthenticated, uid]);

  React.useEffect(() => {
    const visitedNotice = pageChangeNoticeForPathname(pathname);
    if (!visitedNotice || !unseenHrefs.has(visitedNotice.href)) return;

    if (uid) {
      setUnseenHrefs((current) => {
        const next = new Set(current);
        next.delete(visitedNotice.href);
        return next;
      });
      void fetch("/api/page-change-notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ href: visitedNotice.href }),
      }).then((response) => {
        if (!response.ok) void syncAuthenticated();
      });
      return;
    }

    try {
      const seen = parseSeenPageChangeVersions(
        window.localStorage.getItem(PAGE_CHANGE_NOTICE_STORAGE_KEY)
      );
      const next = markPageChangeNoticeSeen(
        seen,
        visitedNotice.href,
        visitedNotice.version
      );
      window.localStorage.setItem(
        PAGE_CHANGE_NOTICE_STORAGE_KEY,
        JSON.stringify(next)
      );
      setUnseenHrefs(new Set(getUnseenPageChangeHrefs(next)));
    } catch {
      setUnseenHrefs((current) => {
        const next = new Set(current);
        next.delete(visitedNotice.href);
        return next;
      });
    }
  }, [pathname, syncAuthenticated, uid, unseenHrefs]);

  return unseenHrefs;
}

function HeaderPillLink({
  href,
  label,
  className,
  active,
  requestCount,
  activeEffectClass = "",
  onCycleActiveEffect,
}: {
  href: string;
  label: string;
  className: string;
  active?: boolean;
  requestCount?: number;
  activeEffectClass?: string;
  onCycleActiveEffect: () => void;
}) {
  const t = useTranslations("Shell");
  const router = useRouter();
  const displayLabel =
    href === "/requests"
      ? t("requests", {
          count:
            requestCount ?? 0,
        })
      : label;

  return (
    <Link
      href={href}
      data-presence-door={presenceDoorForHref(href)}
      prefetch={false}
      onMouseEnter={() => router.prefetch(href)}
      onFocus={() => router.prefetch(href)}
      onClick={(event) => {
        if (isModifiedHeaderNavClick(event)) return;
        onCycleActiveEffect();
        if (active) event.preventDefault();
      }}
      aria-current={active ? "page" : undefined}
      className={`relative inline-flex min-h-8 shrink-0 items-center justify-center overflow-visible rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.01em] transition duration-200 lg:px-2.5 xl:min-h-9 xl:px-3.5 xl:py-1.5 xl:text-[11px] ${className} ${
        active ? activeEffectClass : ""
      }`}
    >
      <span className="relative z-10">{displayLabel}</span>
    </Link>
  );
}

function KingdomNavItem({
  className,
  active,
  unseenPageChanges,
  activeEffectClass = "",
}: {
  className: string;
  active?: boolean;
  unseenPageChanges: ReadonlySet<string>;
  activeEffectClass?: string;
}) {
  const t = useTranslations("Shell");
  const hasUnseenPageChanges = unseenPageChanges.size > 0;
  const [open, setOpen] = React.useState(false);
  const [portalReady, setPortalReady] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const desktopClickLatchRef = React.useRef(false);

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
    desktopClickLatchRef.current = false;
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
        data-presence-door="kingdom"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("kingdom.openAria")}
        onClick={() => {
          if (window.matchMedia("(hover: none)").matches) {
            setOpen((value) => !value);
            return;
          }

          clearCloseTimer();

          if (!open) {
            desktopClickLatchRef.current = true;
            openMenu();
            return;
          }

          if (!desktopClickLatchRef.current) {
            desktopClickLatchRef.current = true;
            openMenu();
            return;
          }

          desktopClickLatchRef.current = false;
          setOpen(false);
        }}
        className={`relative inline-flex min-h-8 min-w-9 shrink-0 items-center justify-center overflow-visible rounded-full border px-2 py-1 text-xs transition duration-200 xl:min-h-9 xl:min-w-10 xl:px-3 xl:py-1.5 ${className} ${
          active ? activeEffectClass : ""
        }`}
      >
        <span className="relative z-10 text-[16px] leading-none">🏰</span>
        {hasUnseenPageChanges ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 ml-[5px] -mt-[8px] h-[4px] w-[4px] rounded-full bg-slate-300/85 shadow-[0_0_4px_rgba(203,213,225,0.42)]"
          />
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute left-1/2 top-full z-[220] hidden w-[22rem] -translate-x-1/2 pt-7 sm:block"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <KingdomMenuPanel
            onNavigate={() => setOpen(false)}
            unseenPageChanges={unseenPageChanges}
          />
        </div>
      ) : null}

      {portalReady && open
        ? createPortal(
            <div className="fixed inset-0 z-[240] sm:hidden">
              <button
                type="button"
                className="absolute inset-0 bg-[#02060f]/78 backdrop-blur-[3px]"
                onClick={() => setOpen(false)}
                aria-label={t("kingdom.closeAria")}
              />
              <div
                ref={panelRef}
                className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] max-h-[calc(100dvh-env(safe-area-inset-top)-1.5rem)] overflow-y-auto overscroll-contain touch-pan-y [scrollbar-gutter:stable] rounded-[1.65rem] border border-amber-200/18 bg-[#07101a]/98 p-3 shadow-[0_34px_110px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
              >
                <div className="mb-2 flex items-center justify-between gap-3 px-2 py-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.34em] text-amber-100/55">
                      AoE2WAR
                    </div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {t("kingdom.title")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300"
                    aria-label={t("kingdom.closeAria")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <KingdomMenuPanel
                  onNavigate={() => setOpen(false)}
                  unseenPageChanges={unseenPageChanges}
                  mobile
                />
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
  unseenPageChanges,
  mobile = false,
}: {
  onNavigate: () => void;
  unseenPageChanges: ReadonlySet<string>;
  mobile?: boolean;
}) {
  const t = useTranslations("Shell");
  const router = useRouter();

  return (
    <div
      className={`rounded-[1.35rem] border border-amber-200/14 bg-[linear-gradient(145deg,rgba(13,25,42,0.98),rgba(5,12,22,0.98))] p-2 shadow-[0_24px_80px_rgba(0,0,0,0.48)] ${
        mobile
          ? "overflow-hidden border-white/8 shadow-none"
          : "max-h-[calc(100dvh-7.5rem)] overflow-y-auto overscroll-contain touch-pan-y [scrollbar-gutter:stable] [scrollbar-width:thin] backdrop-blur-xl"
      }`}
      role="menu"
      aria-label={t("kingdom.pagesAria")}
    >
      <div className="grid gap-1">
        {KINGDOM_LINKS.map((item) => {
          const Icon = item.icon;
          const copyKeys =
            KINGDOM_COPY_KEYS[item.href];
          const hasPageChange =
            unseenPageChanges.has(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              data-presence-door={presenceDoorForHref(item.href)}
              prefetch={false}
              onMouseEnter={() => router.prefetch(item.href)}
              onFocus={() => router.prefetch(item.href)}
              role="menuitem"
              onClick={() => {
                if (item.href === "/leaderboard") {
                  trackLeaderboardEvent({
                    type: "leaderboard_open_kingdom_menu",
                    metadata: { destination: "modern" },
                  });
                }
                onNavigate();
              }}
              className="group/item relative flex items-center gap-3 rounded-[1rem] px-3 py-3 pr-8 text-left transition hover:bg-white/[0.07]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/12 bg-amber-300/[0.06] text-amber-100 transition group-hover/item:border-amber-200/25 group-hover/item:bg-amber-300/10">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-100">
                  {copyKeys ? t(copyKeys.label) : item.label}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {copyKeys ? t(copyKeys.body) : item.body}
                </div>
              </div>

              {hasPageChange ? (
                <span
                  aria-hidden="true"
                  className="absolute right-3 top-3 h-2 w-2 rounded-full bg-slate-400/75 shadow-[0_0_0_3px_rgba(148,163,184,0.06)]"
                />
              ) : null}
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
  activeEffectClass = "",
  onCycleActiveEffect,
}: {
  liveGamesCount: number;
  active?: boolean;
  activeEffectClass?: string;
  onCycleActiveEffect: () => void;
}) {
  const t = useTranslations("Shell");
  const router = useRouter();

  return (
    <Link
      href="/live-games"
      data-presence-door={presenceDoorForHref("/live-games")}
      prefetch={false}
      onMouseEnter={() => router.prefetch("/live-games")}
      onFocus={() => router.prefetch("/live-games")}
      onClick={(event) => {
        if (isModifiedHeaderNavClick(event)) return;
        onCycleActiveEffect();
        if (active) event.preventDefault();
      }}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-8 shrink-0 items-center rounded-full border border-red-400/25 bg-red-500/10 px-2 py-1 text-[10px] font-semibold text-red-100 transition duration-200 hover:border-red-300/40 hover:bg-red-500/15 xl:min-h-9 xl:px-3 xl:py-1.5 xl:text-[11px] ${
        active ? activeEffectClass : ""
      }`}
    >
      <span className="xl:hidden">
        {liveGamesCount} Live🔥
      </span>
      <span className="hidden xl:inline">
        {t("liveGames", {
          count:
            liveGamesCount,
        })}
      </span>
    </Link>
  );
}

function HeaderWorkshopLiveLink({
  active,
  activeEffectClass = "",
  onCycleActiveEffect,
}: {
  active?: boolean;
  activeEffectClass?: string;
  onCycleActiveEffect: () => void;
}) {
  const t = useTranslations("Shell");
  const router = useRouter();

  return (
    <Link
      href="/workshop"
      data-presence-door={presenceDoorForHref("/workshop")}
      prefetch={false}
      onMouseEnter={() => router.prefetch("/workshop")}
      onFocus={() => router.prefetch("/workshop")}
      onClick={(event) => {
        if (isModifiedHeaderNavClick(event)) return;
        onCycleActiveEffect();
        if (active) event.preventDefault();
      }}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border border-orange-300/25 bg-orange-400/10 px-3 py-1.5 text-[11px] font-bold text-orange-100 transition hover:border-orange-200/40 ${
        active ? activeEffectClass : ""
      }`}
    >
      <span className="h-2 w-2 animate-pulse rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.85)]" />
      {t("workshopLive")}
    </Link>
  );
}

function PlayerProfileViewModeSync({
  onChange,
}: {
  onChange: React.Dispatch<React.SetStateAction<string | null>>;
}) {
  const searchParams = useSearchParams();

  React.useEffect(() => {
    onChange(searchParams.get("view"));
  }, [onChange, searchParams]);

  return null;
}

function InnerShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Shell");
  const { uid, playerName, isAdmin } = useUserAuth();
  const pathname = usePathname();
  const router = useRouter();
  const unseenPageChanges = usePageChangeNotices();
  const [navActiveEffectIndex, setNavActiveEffectIndex] =
    React.useState(0);
  const isPlayerProfileSurface = pathname.startsWith("/players/");
  const [playerProfileViewMode, setPlayerProfileViewMode] = React.useState<string | null>(null);
  const [deferredClientsReady, setDeferredClientsReady] = React.useState(false);
  const [footerReady, setFooterReady] = React.useState(false);
  const footerWarmupRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    try {
      const stored = Number.parseInt(
        window.localStorage.getItem(
          NAV_ACTIVE_EFFECT_STORAGE_KEY
        ) ?? "",
        10
      );

      if (
        Number.isInteger(stored) &&
        stored >= 0 &&
        stored < NAV_ACTIVE_EFFECTS.length
      ) {
        setNavActiveEffectIndex(stored);
      }
    } catch {
      // Navigation remains fully functional without persistence.
    }
  }, []);

  const cycleNavActiveEffect = React.useCallback(() => {
    setNavActiveEffectIndex((current) => {
      const next =
        (current + 1) % NAV_ACTIVE_EFFECTS.length;

      try {
        window.localStorage.setItem(
          NAV_ACTIVE_EFFECT_STORAGE_KEY,
          String(next)
        );
      } catch {
        // Preserve the in-memory interaction if storage is blocked.
      }

      return next;
    });
  }, []);

  const navActiveEffectClass =
    NAV_ACTIVE_EFFECTS[navActiveEffectIndex] ??
    NAV_ACTIVE_EFFECTS[0];

  React.useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let idleHandle: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const revealDeferredClients = () => {
      if (!cancelled) setDeferredClientsReady(true);
    };
    const schedule = () => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(revealDeferredClients, {
          timeout: 1600,
        });
      } else {
        timer = window.setTimeout(revealDeferredClients, 700);
      }
    };

    if (document.readyState === "complete") {
      schedule();
    } else {
      window.addEventListener("load", schedule, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      if (timer !== null) window.clearTimeout(timer);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, []);

  const isExtremePlayerProfileSurface =
    isPlayerProfileSurface && playerProfileViewMode !== "basic" && playerProfileViewMode !== "advanced";
  const { themeKey, viewMode, textColor, pageStyle, tileViewPreferences } =
    useLobbyAppearance();
  const [liveGamesCount, setLiveGamesCount] = React.useState(0);
  const [requestCount, setRequestCount] = React.useState(0);
  const [workshopLive, setWorkshopLive] = React.useState(false);
  // AOE2WAR_CONTACT_VIEWPORT_REFLOW_20260823
  const isContactPage = pathname?.startsWith("/contact-emaren");
  const isLobbySurface = pathname === "/" || pathname?.startsWith("/lobby");
  const isMediaManagerSurface = pathname?.startsWith("/admin/media-assets");
  const isHeroStudioSurface = pathname?.startsWith("/admin/hero-studio");
  const isObservatorySurface =
    pathname === "/traffic" ||
    pathname === "/statistics" ||
    pathname === "/speed";
  const isAcademySurface = pathname?.startsWith("/academy");
  const isClanSurface = pathname?.startsWith("/clans");
  const [clanDisplayTheme, setClanDisplayTheme] =
    React.useState<
      "site" | "premium" | "premium-light" | "premium-dark" | "crimson"
    >("site");

  React.useEffect(() => {
    if (!isClanSurface || typeof window === "undefined") return;

    const normalizeClanDisplayTheme = (value: string | null) => {
      if (value === "premium") return "premium" as const;
      if (value === "premium-light") return "premium-light" as const;
      if (value === "premium-dark" || value === "blue") {
        return "premium-dark" as const;
      }
      if (value === "crimson") return "crimson" as const;
      return "site" as const;
    };

    const syncStoredTheme = () => {
      setClanDisplayTheme(
        normalizeClanDisplayTheme(
          window.localStorage.getItem("aoe2war:clans:theme"),
        ),
      );
    };

    const handleThemeChange = (event: Event) => {
      const theme =
        (
          event as CustomEvent<
            "site" | "premium" | "premium-light" | "premium-dark" | "crimson"
          >
        ).detail;

      if (
        theme === "site" ||
        theme === "premium" ||
        theme === "premium-light" ||
        theme === "premium-dark" ||
        theme === "crimson"
      ) {
        setClanDisplayTheme(theme);
      }
    };

    syncStoredTheme();
    window.addEventListener("storage", syncStoredTheme);
    window.addEventListener(
      "aoe2war:clan-theme-change",
      handleThemeChange,
    );

    return () => {
      window.removeEventListener("storage", syncStoredTheme);
      window.removeEventListener(
        "aoe2war:clan-theme-change",
        handleThemeChange,
      );
    };
  }, [isClanSurface]);
  const isNationalChampionsSurface = pathname?.startsWith("/national-champions");
  const isBetsSurface = pathname === "/bets";
  const isBetDetailSurface = Boolean(pathname?.match(/^\/bets\/[^/]+/));

  const isGameStatsReviewSurface =
    Boolean(
      pathname?.match(
        /^\/game-stats\/\d+\/review(?:\/|$)/
      )
    );

  const isChampionsSurface = pathname === "/champions" || Boolean(pathname?.startsWith("/champions/"));
  const isWarGraphSurface =
    pathname === "/wargraph" || Boolean(pathname?.startsWith("/wargraph/"));
  const isFullWidthPrestigeSurface =
    isBetsSurface ||
    isChampionsSurface ||
    pathname?.startsWith("/academy") ||
    pathname?.startsWith("/market") ||
    pathname?.startsWith("/kingdom") ||
    pathname?.startsWith("/kingdom-intelligence") ||
    pathname?.startsWith("/round-chamber") ||
    pathname?.startsWith("/oracle") ||
    pathname?.startsWith("/leaderboard") ||
    pathname?.startsWith("/workshop") ||
    pathname?.startsWith("/battle-archive") ||
    pathname?.startsWith("/challenge");
  const communityLobbyViewMode = getTileViewMode(
    tileViewPreferences,
    "community_lobby"
  );
  const liveGamesViewMode = getTileViewMode(tileViewPreferences, "live_games");
  const isLiveGamesSurface = pathname?.startsWith("/live-games");
  const forumViewMode = getTileViewMode(tileViewPreferences, "forum");
  const isForumSurface = pathname?.startsWith("/forum");
  const isBountiesSurface = pathname === "/bounties";
  const rivalriesViewMode = getTileViewMode(
    tileViewPreferences,
    "rivalries"
  );
  const isRivalriesSurface =
    pathname === "/rivalries";
  const isDownloadSurface =
    pathname === "/download";
  const downloadWatcherViewMode = getTileViewMode(
    tileViewPreferences,
    "download_watcher"
  );
  const leaderboardViewMode = getTileViewMode(
    tileViewPreferences,
    "leaderboard"
  );
  const isLivingLeaderboardSurface =
    pathname === "/leaderboard" &&
    leaderboardViewMode === "extreme";

  React.useEffect(() => {
    if (
      footerReady ||
      isContactPage ||
      isHeroStudioSurface ||
      isLivingLeaderboardSurface
    ) return;

    const node = footerWarmupRef.current;
    if (!node) return;

    const fallback = window.setTimeout(() => setFooterReady(true), 5000);
    if (typeof IntersectionObserver === "undefined") {
      return () => window.clearTimeout(fallback);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setFooterReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "3200px 0px", threshold: 0.01 }
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [
    footerReady,
    isContactPage,
    isHeroStudioSurface,
    isLivingLeaderboardSurface,
  ]);


  React.useEffect(() => {
    if (!isContactPage) return;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, behavior: "auto" });
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isContactPage]);
  React.useEffect(() => {
    if (!isLivingLeaderboardSurface) {
      return;
    }

    const previousDocumentOverflow =
      document.documentElement.style.overflow;

    const previousBodyOverflow =
      document.body.style.overflow;

    document.documentElement.style.overflow =
      "hidden";

    document.body.style.overflow =
      "hidden";

    if (window.scrollY !== 0) {
      window.scrollTo({
        top: 0,
        behavior: "auto",
      });
    }

    return () => {
      document.documentElement.style.overflow =
        previousDocumentOverflow;

      document.body.style.overflow =
        previousBodyOverflow;
    };
  }, [isLivingLeaderboardSurface]);

  const activeSurfaceViewMode = isLiveGamesSurface
    ? liveGamesViewMode
    : isForumSurface
      ? forumViewMode
      : isRivalriesSurface
        ? rivalriesViewMode
        : communityLobbyViewMode;
  const immersiveShellMaxWidth =
    activeSurfaceViewMode === "extreme"
      ? "max-w-[96rem]"
      : activeSurfaceViewMode === "advanced"
        ? "max-w-[75rem]"
        : "max-w-[65rem]";

  const downloadShellMaxWidth =
    downloadWatcherViewMode === "extreme"
      ? "max-w-[96rem]"
      : downloadWatcherViewMode === "advanced"
        ? "max-w-[82rem]"
        : "max-w-6xl";

  const bountyShellMaxWidth = "max-w-[96rem]";

  const pageHeadingKey = getPageHeadingKey(pathname);
  const headerTitle = pageHeadingKey ? t(pageHeadingKey) : getPageHeading(pathname);
  const shellThemeKey =
    isClanSurface
      ? clanDisplayTheme === "crimson"
        ? "crimson"
        : "midnight"
      : themeKey;

  const clanPageStyle: React.CSSProperties =
    clanDisplayTheme === "site" ||
    clanDisplayTheme === "premium"
      ? pageStyle
      : clanDisplayTheme === "premium-light"
        ? {
            backgroundColor: "#0f172a",
            backgroundImage:
              "radial-gradient(72rem 38rem at 12% 0%, rgba(59,130,246,0.16), transparent 62%), radial-gradient(62rem 34rem at 90% 2%, rgba(147,197,253,0.09), transparent 64%), linear-gradient(180deg, #111827 0%, #0f172a 43%, #050814 100%)",
          }
        : clanDisplayTheme === "premium-dark"
          ? {
              backgroundColor: "#02040a",
              backgroundImage:
                "radial-gradient(72rem 38rem at 10% 0%, rgba(56,189,248,0.16), transparent 62%), radial-gradient(62rem 34rem at 92% 2%, rgba(30,64,175,0.16), transparent 64%), linear-gradient(180deg, #081428 0%, #030812 46%, #02040a 100%)",
            }
          : {
              backgroundColor: "#060403",
              backgroundImage:
                "radial-gradient(74rem 38rem at 8% 0%, rgba(127,29,29,0.22), transparent 62%), radial-gradient(62rem 34rem at 92% 0%, rgba(180,83,9,0.10), transparent 64%), repeating-linear-gradient(92deg, rgba(255,255,255,0.012) 0 1px, transparent 1px 48px), linear-gradient(180deg, #0d0806 0%, #060505 38%, #020304 100%)",
            };
  const headerSkin =
    getLobbyHeaderSkin(shellThemeKey);
  const headerTone = React.useMemo(
    () =>
      getLobbyPresentationTone(
        shellThemeKey,
        viewMode
      ),
    [shellThemeKey, viewMode]
  );

  const clanHeaderStyle: React.CSSProperties | undefined =
    !isClanSurface || clanDisplayTheme === "site"
      ? undefined
      : clanDisplayTheme === "premium"
        ? {
            backgroundColor: "rgba(8, 17, 34, 0.975)",
            backgroundImage:
              "radial-gradient(44rem 12rem at 12% -20%, rgba(96,165,250,0.16), transparent 64%), radial-gradient(38rem 11rem at 88% -20%, rgba(59,130,246,0.09), transparent 66%), linear-gradient(180deg, rgba(13,27,52,0.99), rgba(7,15,29,0.98))",
            borderColor: "rgba(96,165,250,0.15)",
            boxShadow: "0 18px 56px rgba(3,18,38,0.36)",
          }
        : clanDisplayTheme === "premium-light"
          ? {
              backgroundColor: "rgba(18, 35, 65, 0.975)",
              backgroundImage:
                "radial-gradient(44rem 12rem at 12% -20%, rgba(147,197,253,0.22), transparent 64%), radial-gradient(38rem 11rem at 88% -20%, rgba(59,130,246,0.15), transparent 66%), linear-gradient(180deg, rgba(28,49,84,0.99), rgba(13,27,51,0.98))",
              borderColor: "rgba(147,197,253,0.19)",
              boxShadow: "0 18px 58px rgba(15,38,75,0.34)",
            }
          : clanDisplayTheme === "premium-dark"
            ? {
                backgroundColor: "rgba(2, 8, 18, 0.985)",
                backgroundImage:
                  "radial-gradient(44rem 12rem at 12% -20%, rgba(56,189,248,0.16), transparent 64%), radial-gradient(38rem 11rem at 88% -20%, rgba(30,64,175,0.19), transparent 66%), linear-gradient(180deg, rgba(5,18,38,0.995), rgba(2,7,17,0.99))",
                borderColor: "rgba(56,189,248,0.13)",
                boxShadow: "0 18px 62px rgba(0,0,0,0.48)",
              }
            : {
                backgroundColor: "rgba(12, 7, 5, 0.975)",
                backgroundImage:
                  "radial-gradient(44rem 12rem at 12% -20%, rgba(153,27,27,0.25), transparent 64%), radial-gradient(38rem 11rem at 88% -20%, rgba(245,158,11,0.10), transparent 66%), linear-gradient(180deg, rgba(22,12,9,0.99), rgba(8,7,7,0.98))",
                borderColor: "rgba(248,113,113,0.14)",
                boxShadow: "0 18px 60px rgba(0,0,0,0.46)",
              };

  const clanHeaderLeftGlow =
    clanDisplayTheme === "crimson"
      ? "bg-red-700/[0.14]"
      : clanDisplayTheme === "premium-dark"
        ? "bg-sky-500/[0.10]"
        : clanDisplayTheme === "premium-light"
          ? "bg-blue-300/[0.10]"
          : clanDisplayTheme === "premium"
            ? "bg-blue-500/[0.085]"
            : "bg-amber-300/[0.055]";

  const clanHeaderRightGlow =
    clanDisplayTheme === "crimson"
      ? "bg-amber-500/[0.07]"
      : clanDisplayTheme === "premium-dark"
        ? "bg-blue-800/[0.13]"
        : clanDisplayTheme === "premium-light"
          ? "bg-sky-300/[0.09]"
          : clanDisplayTheme === "premium"
            ? "bg-sky-300/[0.075]"
            : "bg-sky-300/[0.065]";

  const clanHeaderDivider =
    clanDisplayTheme === "crimson"
      ? "via-red-200/25"
      : clanDisplayTheme === "premium-dark"
        ? "via-sky-300/20"
        : clanDisplayTheme === "premium-light"
          ? "via-blue-200/24"
          : clanDisplayTheme === "premium"
            ? "via-sky-200/22"
            : "via-amber-100/25";

  function handleContactShellWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (!isContactPage || event.deltaY === 0) return;

    const target = event.target as HTMLElement;
    if (target.closest('[data-contact-chat-scroll="page"]')) return;

    const timeline = event.currentTarget.querySelector<HTMLElement>(
      '[data-contact-chat-scroll="page"]'
    );
    if (!timeline || timeline.scrollHeight <= timeline.clientHeight) return;

    const previousScrollTop = timeline.scrollTop;
    timeline.scrollTop += event.deltaY;
    if (timeline.scrollTop !== previousScrollTop) {
      event.preventDefault();
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    let initialTimer: number | null = null;
    let idleHandle: number | null = null;
    let lastLoadedAt = 0;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    async function loadHeaderCounts() {
      if (document.visibilityState !== "visible") return;
      lastLoadedAt = Date.now();

      try {
        const response = await fetch("/api/header-summary");
        const payload = response.ok
          ? ((await response.json()) as {
              liveCount?: number;
              openRequestCount?: number;
              workshopLive?: boolean;
            })
          : {};

        if (!cancelled) {
          setLiveGamesCount(typeof payload.liveCount === "number" ? payload.liveCount : 0);
          setRequestCount(
            typeof payload.openRequestCount === "number" ? payload.openRequestCount : 0
          );
          setWorkshopLive(payload.workshopLive === true);
        }
      } catch (error) {
        console.warn("Failed to load header counts:", error);
      }
    }

    const scheduleInitialLoad = () => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(
          () => void loadHeaderCounts(),
          { timeout: 2200 }
        );
      } else {
        initialTimer = window.setTimeout(() => void loadHeaderCounts(), 900);
      }
    };
    const refreshWhenVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastLoadedAt >= 30_000
      ) {
        void loadHeaderCounts();
      }
    };

    if (document.readyState === "complete") {
      scheduleInitialLoad();
    } else {
      window.addEventListener("load", scheduleInitialLoad, { once: true });
    }

    const interval = window.setInterval(() => {
      void loadHeaderCounts();
    }, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      window.removeEventListener("load", scheduleInitialLoad);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(interval);
      if (initialTimer !== null) window.clearTimeout(initialTimer);
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
    };
  }, []);

  return (
    <div
      className={`${isAcademySurface ? "academy-route-shell" : ""} flex w-full flex-col overflow-x-hidden text-white transition-[background-image,background-color] duration-500 ${isContactPage
        ? "h-[100dvh] min-h-0 max-h-[100dvh] overflow-hidden"
        : isLivingLeaderboardSurface
          ? "h-[100dvh] min-h-0 overflow-y-hidden"
          : "min-h-screen"}`}
      onWheel={handleContactShellWheel}
      style={
        isClanSurface
          ? clanPageStyle
          : isObservatorySurface
          ? pathname === "/traffic"
            ? {
                backgroundColor: "#01070b",
                backgroundImage:
                  "radial-gradient(72rem 38rem at 12% 0%, rgba(16,185,129,0.10), transparent 62%), radial-gradient(68rem 36rem at 88% 0%, rgba(59,130,246,0.09), transparent 64%), linear-gradient(180deg, #02090f 0%, #01070c 46%, #01050a 100%)",
              }
            : {
                backgroundColor: "#05040d",
                backgroundImage:
                  "radial-gradient(72rem 38rem at 12% 0%, rgba(245,158,11,0.085), transparent 62%), radial-gradient(68rem 38rem at 88% 0%, rgba(139,92,246,0.12), transparent 64%), linear-gradient(180deg, #090713 0%, #05040d 48%, #03030a 100%)",
              }
        : isAcademySurface
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
      {isPlayerProfileSurface ? (
        <React.Suspense fallback={null}>
          <PlayerProfileViewModeSync onChange={setPlayerProfileViewMode} />
        </React.Suspense>
      ) : null}
      <SpeedRuntime />
      <SpeedWebVitals />
      <LivingKingdomClient />
      {deferredClientsReady ? (
        <>
          <SpeedProof />
          <UserExperienceTracker />
          <ClientFlightRecorder />
        </>
      ) : null}
      <header
        data-app-shell-header
        className={`sticky top-0 z-[180] shrink-0 overflow-visible border-b px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.7rem)] backdrop-blur-md transition-[background-color,border-color] duration-500 sm:px-4 sm:backdrop-blur-xl lg:py-3 lg:backdrop-blur-2xl ${headerSkin.shell}`}
        style={
          isClanSurface
            ? clanHeaderStyle
            : isObservatorySurface
            ? pathname === "/traffic"
              ? {
                  backgroundColor: "rgba(2, 9, 15, 0.97)",
                  backgroundImage:
                    "linear-gradient(180deg, rgba(3,14,21,0.99), rgba(2,8,14,0.97))",
                  borderColor: "rgba(94,234,212,0.08)",
                }
              : {
                  backgroundColor: "rgba(7, 5, 15, 0.97)",
                  backgroundImage:
                    "linear-gradient(180deg, rgba(12,8,22,0.99), rgba(6,5,14,0.97))",
                  borderColor: "rgba(196,181,253,0.08)",
                }
            : undefined
        }
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className={`absolute -left-16 -top-20 h-44 w-72 rounded-full blur-3xl ${
              isClanSurface
                ? clanHeaderLeftGlow
                : "bg-amber-300/[0.055]"
            }`}
          />
          <div
            className={`absolute -right-20 -top-20 h-44 w-72 rounded-full blur-3xl ${
              isClanSurface
                ? clanHeaderRightGlow
                : "bg-sky-300/[0.065]"
            }`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent ${
              isClanSurface
                ? clanHeaderDivider
                : "via-amber-100/25"
            } to-transparent`}
          />
        </div>

        <div className={`relative mx-auto w-full overflow-visible ${
          isNationalChampionsSurface || isBetDetailSurface ? "max-w-[96rem]" : "max-w-[90rem]"
        }`}>
          <div className="md:hidden">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Link
                href="/"
                data-presence-door="home"
                prefetch={false}
                onMouseEnter={() => router.prefetch("/")}
                onFocus={() => router.prefetch("/")}
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
                <UniversalTranslator tone={
                      isAcademySurface ||
                      (isClanSurface &&
                        clanDisplayTheme === "crimson")
                        ? "academy"
                        : "blue"
                    } />
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
                  {t("currentPage")}
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
                  unseenPageChanges={unseenPageChanges}
                  activeEffectClass={navActiveEffectClass}
                />
                {HEADER_LINKS.map((link) => (
                  <React.Fragment key={link.href}>
                    <HeaderPillLink
                      href={link.href}
                      label={HEADER_LINK_KEYS[link.href] ? t(HEADER_LINK_KEYS[link.href]!) : link.label}
                      className={headerSkin.surface}
                      active={isRouteActive(pathname, link.href)}
                      requestCount={link.countKey === "requests" ? requestCount : undefined}
                      activeEffectClass={navActiveEffectClass}
                      onCycleActiveEffect={cycleNavActiveEffect}
                    />
                    {link.href === "/bets" ? (
                      <>
                        <HeaderLiveGamesLink
                          liveGamesCount={liveGamesCount}
                          active={isRouteActive(pathname, "/live-games")}
                          activeEffectClass={navActiveEffectClass}
                          onCycleActiveEffect={cycleNavActiveEffect}
                        />
                        {workshopLive ? (
                          <HeaderWorkshopLiveLink
                            active={isRouteActive(pathname, "/workshop")}
                            activeEffectClass={navActiveEffectClass}
                            onCycleActiveEffect={cycleNavActiveEffect}
                          />
                        ) : null}
                      </>
                    ) : null}
                  </React.Fragment>
                ))}
                <KingdomNavItem
                  className={headerSkin.surface}
                  active={KINGDOM_LINKS.some((link) => isRouteActive(pathname, link.href))}
                  unseenPageChanges={unseenPageChanges}
                  activeEffectClass={navActiveEffectClass}
                />
                {isAdmin ? (
                  <Link
                    href="/admin/user-list"
                    className="inline-flex min-h-9 shrink-0 items-center rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 transition hover:border-emerald-200/40 hover:bg-emerald-500/15"
                  >
                    {t("admin")}
                  </Link>
                ) : null}
              </div>
            </nav>
          </div>

          <div className="hidden md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-2 lg:gap-3 xl:grid-cols-[minmax(12rem,0.85fr)_minmax(0,2fr)_auto] xl:gap-4">
            <div className="flex min-w-0 items-center gap-2 xl:gap-3">
              <Link
                href="/"
                data-presence-door="home"
                prefetch={false}
                onMouseEnter={() => router.prefetch("/")}
                onFocus={() => router.prefetch("/")}
                className="group relative flex shrink-0 items-center rounded-xl px-1 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/40"
                aria-label="AOE2WAR home"
              >
                <Image
                  src="/brand/aoe2war-logo.webp"
                  alt="AOE2WAR"
                  width={972}
                  height={155}
                  priority
                  className="h-auto w-[5.6rem] drop-shadow-[0_5px_18px_rgba(251,191,36,0.16)] transition duration-200 group-hover:brightness-110 lg:w-[6.5rem] xl:w-[8.7rem]"
                />
              </Link>
              <div className="hidden min-w-0 border-l border-white/10 pl-2.5 xl:block xl:pl-3">
                <div className={`whitespace-nowrap text-[8px] font-semibold uppercase tracking-[0.24em] xl:text-[9px] xl:tracking-[0.3em] ${headerTone.eyebrow}`}>
                  {t("currentPage")}
                </div>
                <h1 className="mt-0.5 truncate text-sm font-semibold text-white xl:text-base">
                  {headerTitle}
                </h1>
              </div>
            </div>

            <nav className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 md:justify-self-stretch xl:gap-2">
              <KingdomNavItem
                className={`${headerSkin.surface} -mr-2`}
                active={KINGDOM_LINKS.some((link) => isRouteActive(pathname, link.href))}
                unseenPageChanges={unseenPageChanges}
                activeEffectClass={navActiveEffectClass}
              />

              <div className="aoe2-nav-scroll min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="flex min-w-max items-center justify-start gap-1 px-0.5 lg:gap-1.5 xl:justify-center xl:gap-2">
                  {HEADER_LINKS.map((link) => (
                    <React.Fragment key={link.href}>
                      <HeaderPillLink
                        href={link.href}
                        label={HEADER_LINK_KEYS[link.href] ? t(HEADER_LINK_KEYS[link.href]!) : link.label}
                        className={headerSkin.surface}
                        active={isRouteActive(pathname, link.href)}
                        requestCount={link.countKey === "requests" ? requestCount : undefined}
                        activeEffectClass={navActiveEffectClass}
                        onCycleActiveEffect={cycleNavActiveEffect}
                      />

                      {link.href === "/bets" ? (
                        <>
                          <HeaderLiveGamesLink
                            liveGamesCount={liveGamesCount}
                            active={isRouteActive(pathname, "/live-games")}
                            activeEffectClass={navActiveEffectClass}
                            onCycleActiveEffect={cycleNavActiveEffect}
                          />

                          {workshopLive ? (
                            <HeaderWorkshopLiveLink
                              active={isRouteActive(pathname, "/workshop")}
                              activeEffectClass={navActiveEffectClass}
                              onCycleActiveEffect={cycleNavActiveEffect}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <KingdomNavItem
                className={`${headerSkin.surface} -ml-2`}
                active={KINGDOM_LINKS.some((link) => isRouteActive(pathname, link.href))}
                unseenPageChanges={unseenPageChanges}
                activeEffectClass={navActiveEffectClass}
              />
            </nav>

            <div className="flex min-w-0 items-center justify-end gap-1.5 md:justify-self-end xl:gap-2">
              {uid ? (
                <>
                  <UniversalTranslator
                    tone={
                      isAcademySurface ||
                      (isClanSurface &&
                        clanDisplayTheme === "crimson")
                        ? "academy"
                        : "blue"
                    }
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
                    tone={
                      isAcademySurface ||
                      (isClanSurface &&
                        clanDisplayTheme === "crimson")
                        ? "academy"
                        : "blue"
                    }
                  />
                  <SteamLoginButton
                    label={t("steamSignIn")}
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.18)] transition hover:bg-amber-200"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        className={`mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col py-4 pb-32 lg:pb-4 ${
          isContactPage
            ? "max-w-[96rem] px-2 sm:px-3"
          : isMediaManagerSurface
            ? "max-w-none px-3 sm:px-4 2xl:px-6"
            : isHeroStudioSurface
              ? "max-w-none px-1 sm:px-2 2xl:px-3"
            : isGameStatsReviewSurface
              ? "max-w-none px-3 sm:px-4 2xl:px-6"
            : isObservatorySurface
              ? "max-w-none px-0"
            : isLivingLeaderboardSurface
              ? "max-w-[118rem] px-3 sm:px-4 2xl:px-5"
            : `px-3 sm:px-4 ${
                isBountiesSurface
                  ? bountyShellMaxWidth
                  : isDownloadSurface
                    ? downloadShellMaxWidth
                    : isLobbySurface || isLiveGamesSurface || isForumSurface || isRivalriesSurface
                    ? immersiveShellMaxWidth
                    : isWarGraphSurface
                      ? "max-w-[118rem]"
                    : isFullWidthPrestigeSurface || isClanSurface
                      ? "max-w-[90rem]"
                    : isNationalChampionsSurface || isBetDetailSurface
                      ? "max-w-[96rem]"
                      : pathname === "/profile"
                        ? "max-w-[96rem]"
                        : isExtremePlayerProfileSurface
                          ? "max-w-[90rem]"
                          : "max-w-6xl"
              }`
        } ${isAcademySurface ? "academy-shell-skin" : ""} ${
          isContactPage
            ? "!py-2 !pb-2 overflow-hidden sm:!py-3 sm:!pb-3"
            : isLivingLeaderboardSurface
              ? "!py-2 !pb-2 overflow-hidden"
              : isMediaManagerSurface || isHeroStudioSurface
                ? "overflow-x-visible"
                : "overflow-x-hidden"
        }`}
      >
        {deferredClientsReady ? <GlobalInstallAppPrompt /> : null}
        {children}
      </main>
      {!isContactPage &&
      !isHeroStudioSurface &&
      !isLivingLeaderboardSurface ? (
        <div ref={footerWarmupRef} className={footerReady ? undefined : "h-px"}>
          {footerReady ? (
            isClanSurface ? (
              <ClanWarhouseFooter />
            ) : (
              <AoE2WarFooter />
            )
          ) : null}
        </div>
      ) : null}
      {deferredClientsReady ? <RadioWoloGlobalPlayer /> : null}
      {!isContactPage ? <MobileFloatingNav /> : null}
      {deferredClientsReady ? <Toaster richColors /> : null}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <UserAuthProvider>
      <UniversalLanguageProvider>
        <AoE2WarIntlProvider>
          <LobbyAppearanceProvider>
            <InnerShell>{children}</InnerShell>
          </LobbyAppearanceProvider>
        </AoE2WarIntlProvider>
      </UniversalLanguageProvider>
    </UserAuthProvider>
  );
}
