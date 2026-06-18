"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  BadgeDollarSign,
  Castle,
  ChevronDown,
  Coins,
  Crown,
  Download,
  Globe2,
  HandCoins,
  ListChecks,
  MessageSquareMore,
  Radio,
  Shield,
  Swords,
  Upload,
  UserCircle,
  Users,
  X,
} from "lucide-react";

import { useUserAuth } from "@/context/UserAuthContext";
import SteamLoginButton from "@/components/SteamLoginButton";

interface Props {
  playerName: string;
  uid: string | null;
  liveGamesCount?: number;
  requestCount?: number;
  buttonClassName?: string;
  menuClassName?: string;
  linkClassName?: string;
  logoutClassName?: string;
}

type MenuEntry = {
  href: string;
  label: string;
  icon: typeof UserCircle;
  badge?: string | null;
  adminOnly?: boolean;
  featured?: boolean;
};

type MenuPosition = {
  top: number;
  right: number;
  maxHeight: number;
};

export default function HeaderMenu({
  playerName,
  uid,
  liveGamesCount = 0,
  requestCount = 0,
  buttonClassName,
  menuClassName,
  linkClassName,
  logoutClassName,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { logout, isAdmin } = useUserAuth();

  const menuEntries = useMemo<MenuEntry[]>(
    () => [
      { href: "/profile", label: "Profile", icon: UserCircle, featured: true },
      { href: "/wallet", label: "Wallet", icon: Coins, featured: true },
      { href: "/wolo", label: "$WOLO", icon: Coins, featured: true },
      { href: "/staking", label: "Staking", icon: HandCoins, featured: true },
      { href: "/bets", label: "Bets", icon: BadgeDollarSign, featured: true },
      { href: "/kingdom", label: "Kingdom", icon: Castle, featured: true },
      { href: "/watch", label: "Watcher / Streaming", icon: Radio, featured: true },
      { href: "/admin/user-list", label: "Admin", icon: Shield, adminOnly: true, featured: true },
      {
        href: "/live-games",
        label: "Live Games",
        icon: Radio,
        badge: liveGamesCount > 0 ? String(liveGamesCount) : null,
        featured: true,
      },
      { href: "/players", label: "Players", icon: Users, featured: true },
      {
        href: "/requests",
        label: "Requests",
        icon: ListChecks,
        badge: requestCount > 0 ? String(requestCount) : null,
        featured: true,
      },
      { href: "/contact-emaren", label: "Contact", icon: MessageSquareMore },
      { href: "/champions", label: "Champions", icon: Crown },
      { href: "/national-champions", label: "National Champions", icon: Globe2 },
      { href: "/forum", label: "Forum", icon: MessageSquareMore },
      { href: "/rivalries", label: "Rivalries", icon: Swords },
      { href: "/upload", label: "Upload Replay", icon: Upload },
      { href: "/game-stats", label: "Game Stats", icon: BarChart3 },
      { href: "/download", label: "Download Watcher", icon: Download },
    ],
    [liveGamesCount, requestCount]
  );

  const visibleEntries = menuEntries.filter((entry) => !entry.adminOnly || isAdmin);
  const primaryEntries = visibleEntries.filter((entry) => entry.featured);
  const secondaryEntries = visibleEntries.filter((entry) => !entry.featured);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current || window.innerWidth < 640) {
      setMenuPosition(null);
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const top = Math.min(rect.bottom + 10, window.innerHeight - 160);
    setMenuPosition({
      top,
      right: Math.max(12, window.innerWidth - rect.right),
      maxHeight: Math.max(220, window.innerHeight - top - 12),
    });
  }, []);

  useEffect(() => {
    setPortalReady(true);
    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const syncDesktop = () => setDesktop(mediaQuery.matches);
    syncDesktop();
    mediaQuery.addEventListener("change", syncDesktop);
    return () => mediaQuery.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const frame = window.requestAnimationFrame(updateMenuPosition);

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen || desktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [desktop, menuOpen]);

  if (!uid) {
    return (
      <div className="flex min-w-0">
        <SteamLoginButton
          label="Steam Sign In"
          className="inline-flex min-h-10 max-w-full items-center justify-center truncate rounded-full bg-amber-300 px-4 py-2 text-xs font-semibold text-slate-950 shadow-[0_10px_30px_rgba(251,191,36,0.16)] transition hover:bg-amber-200 sm:text-sm"
        />
      </div>
    );
  }

  const panelStyle: CSSProperties | undefined =
    desktop && menuPosition
      ? {
          top: menuPosition.top,
          right: menuPosition.right,
          maxHeight: menuPosition.maxHeight,
        }
      : undefined;

  return (
    <div className="relative flex min-w-0 items-center gap-2">
      <button
        ref={triggerRef}
        type="button"
        className={[
          "flex min-w-0 items-center gap-2 rounded-full border px-4 py-2 text-sm text-white transition duration-200",
          buttonClassName || "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
        aria-controls={panelId}
      >
        <UserCircle className="h-5 w-5 shrink-0" />
        <span className="max-w-[5.4rem] truncate min-[430px]:max-w-[7.5rem] sm:max-w-[9rem]">
          {playerName || "Account"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-70 transition ${menuOpen ? "rotate-180" : ""}`}
        />
      </button>

      {portalReady && menuOpen
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Close account menu"
                onClick={() => setMenuOpen(false)}
                className="fixed inset-0 z-[250] bg-[#02060f]/80 backdrop-blur-[3px] sm:hidden"
              />

              <div
                ref={panelRef}
                id={panelId}
                style={panelStyle}
                className={[
                  "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] top-[calc(env(safe-area-inset-top)+0.75rem)] z-[260] min-h-0 overflow-hidden rounded-[1.85rem] border p-2 shadow-[0_34px_120px_rgba(0,0,0,0.72)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-auto sm:top-auto sm:w-[30rem] sm:max-w-[calc(100vw-1.5rem)]",
                  menuClassName || "border-white/10 bg-[#0b1324]/98",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="dialog"
                aria-modal={!desktop}
                aria-label="Account menu"
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div className="rounded-[1.45rem] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-amber-100/55">
                        Command Deck
                      </div>
                      <button
                        type="button"
                        onClick={() => setMenuOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white"
                        aria-label="Close menu"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xl font-semibold text-white">
                          {playerName || "Account"}
                        </div>
                        <div className="mt-1 text-sm leading-5 text-slate-400">
                          {isAdmin
                            ? "Operator routes, community, stats, and tools."
                            : "Community, stats, watcher, and tools."}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-100">
                        {isAdmin ? "Admin" : "Online"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                    <MenuSection label="Command routes">
                      {primaryEntries.map((entry) => (
                        <MenuTile
                          key={entry.href}
                          entry={entry}
                          linkClassName={linkClassName}
                          onNavigate={() => setMenuOpen(false)}
                        />
                      ))}
                    </MenuSection>

                    <div className="mt-3 rounded-[1.45rem] border border-white/10 bg-white/[0.025] p-3">
                      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
                        The full realm
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {secondaryEntries.map((entry) => (
                          <MenuTile
                            key={entry.href}
                            entry={entry}
                            compact
                            linkClassName={linkClassName}
                            onNavigate={() => setMenuOpen(false)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className={[
                      "mt-3 w-full rounded-[1.25rem] border border-red-400/15 bg-red-500/[0.07] px-4 py-3 text-left text-sm font-medium text-red-200 transition hover:border-red-300/25 hover:bg-red-500/12 hover:text-red-100",
                      logoutClassName,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={async () => {
                      setMenuOpen(false);
                      await logout();
                    }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </div>
  );
}

function MenuSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="px-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function MenuTile({
  entry,
  onNavigate,
  compact = false,
  linkClassName,
}: {
  entry: MenuEntry;
  onNavigate: () => void;
  compact?: boolean;
  linkClassName?: string;
}) {
  const Icon = entry.icon;

  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      className={[
        `group/tile rounded-[1.15rem] border border-white/10 bg-white/[0.04] px-3 py-3 transition duration-200 hover:border-amber-200/20 hover:bg-amber-300/[0.065] ${
          compact ? "min-h-[4.75rem]" : "min-h-[5.7rem]"
        }`,
        linkClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl border border-white/10 bg-slate-950/45 p-2 text-slate-100 transition group-hover/tile:border-amber-200/20 group-hover/tile:text-amber-100">
          <Icon className="h-4 w-4" />
        </div>
        {entry.badge ? (
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">
            {entry.badge}
          </div>
        ) : null}
      </div>
      <div className={`mt-3 font-medium text-white ${compact ? "text-sm" : "text-[15px]"}`}>
        {entry.label}
      </div>
    </Link>
  );
}
