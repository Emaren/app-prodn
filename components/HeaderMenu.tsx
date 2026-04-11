"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type ReactNode, useId } from "react";
import {
  BarChart3,
  BadgeDollarSign,
  Coins,
  ChevronDown,
  Download,
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

import { useClickOutside } from "@/hooks/useClickOutside";
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
  const menuRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { logout, isAdmin } = useUserAuth();

  useClickOutside(menuRef as React.RefObject<HTMLElement>, () => setMenuOpen(false));

  const menuEntries = useMemo<MenuEntry[]>(
    () => [
      { href: "/profile", label: "Profile", icon: UserCircle, featured: true },
      { href: "/admin/user-list", label: "Admin", icon: Shield, adminOnly: true, featured: true },
      { href: "/contact-emaren", label: "Contact", icon: MessageSquareMore, featured: true },
      { href: "/bets", label: "Bets", icon: BadgeDollarSign, featured: true },
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
      { href: "/rivalries", label: "Rivalries", icon: Swords },
      { href: "/upload", label: "Upload Replay", icon: Upload },
      { href: "/game-stats", label: "Game Stats", icon: BarChart3 },
      { href: "/download", label: "Download Watcher", icon: Download },
      { href: "/wolo", label: "$WOLO", icon: Coins },
    ],
    [liveGamesCount, requestCount]
  );

  const primaryMobileEntries = menuEntries.filter((entry) => entry.featured && (!entry.adminOnly || isAdmin));
  const secondaryMobileEntries = menuEntries.filter(
    (entry) => !entry.featured && (!entry.adminOnly || isAdmin)
  );
  const desktopEntries = menuEntries.filter((entry) => !entry.adminOnly || isAdmin);

  if (!uid) {
    return (
      <div className="flex w-full">
        <SteamLoginButton
          label="Steam Sign In"
          className="inline-flex w-full items-center justify-center rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 sm:w-auto sm:px-4 sm:py-2"
        />
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      <button
        type="button"
        className={[
          "flex min-w-0 items-center gap-2 rounded-full border px-4 py-2 text-sm text-white transition",
          buttonClassName || "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen ? "true" : "false"}
        aria-haspopup="dialog"
        aria-controls={panelId}
      >
        <UserCircle className="h-5 w-5" />
        <span className="max-w-[8.5rem] truncate sm:max-w-none">{playerName || "Account"}</span>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </button>

      {menuOpen ? (
        <div
          id={panelId}
          className={[
            "fixed inset-x-2 bottom-2 top-[4.75rem] z-50 overflow-hidden rounded-[1.85rem] border p-2 shadow-2xl sm:absolute sm:bottom-auto sm:left-auto sm:right-0 sm:top-14 sm:max-h-[min(42rem,calc(100dvh-7rem))] sm:w-72",
            menuClassName || "border-white/10 bg-[#0b1324]",
          ]
            .filter(Boolean)
            .join(" ")}
          role="dialog"
          aria-modal="false"
          aria-label="Account menu"
        >
          <div className="flex h-full flex-col sm:hidden">
            <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">Command Deck</div>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-slate-300 transition hover:border-white/20 hover:text-white"
                  aria-label="Close menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-xl font-semibold text-white">{playerName || "Account"}</div>
                  <div className="mt-1 text-sm text-slate-400">
                    {isAdmin ? "Admin routes, community, stats, and tools." : "Community, stats, watcher, and tools."}
                  </div>
                </div>
                <div className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-100">
                  {isAdmin ? "Admin" : "Live"}
                </div>
              </div>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-2">
                {primaryMobileEntries.map((entry) => (
                  <MobileMenuTile key={entry.href} entry={entry} onNavigate={() => setMenuOpen(false)} />
                ))}
              </div>

              <div className="mt-4 rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-3">
                <div className="px-1 text-[11px] uppercase tracking-[0.32em] text-slate-400">All Routes</div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {secondaryMobileEntries.map((entry) => (
                    <MobileMenuTile
                      key={entry.href}
                      entry={entry}
                      compact
                      onNavigate={() => setMenuOpen(false)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <button
              type="button"
              className={[
                "mt-3 w-full rounded-[1.35rem] px-4 py-3 text-left text-sm transition",
                logoutClassName ||
                  "border border-red-400/20 bg-red-500/10 text-red-200 hover:bg-red-500/16 hover:text-red-100",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={async () => {
                setMenuOpen(false);
                await logout();
              }}
            >
              Log Out
            </button>
          </div>

          <div className="hidden sm:block">
            {desktopEntries.map((entry) => (
              <MenuLink
                key={entry.href}
                href={entry.href}
                linkClassName={linkClassName}
                onNavigate={() => setMenuOpen(false)}
              >
                <span>{entry.label}</span>
                {entry.badge ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300">
                    {entry.badge}
                  </span>
                ) : null}
              </MenuLink>
            ))}

            <button
              type="button"
              className={[
                "mt-2 w-full rounded-xl px-3 py-2 text-left text-sm transition",
                logoutClassName || "text-red-300 hover:bg-red-500/10 hover:text-red-200",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={async () => {
                setMenuOpen(false);
                await logout();
              }}
            >
              Log Out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  children,
  linkClassName,
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  linkClassName?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      className={[
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition",
        linkClassName || "text-white/85 hover:bg-white/8 hover:text-white",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}

function MobileMenuTile({
  entry,
  onNavigate,
  compact = false,
}: {
  entry: MenuEntry;
  onNavigate: () => void;
  compact?: boolean;
}) {
  const Icon = entry.icon;

  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      className={`rounded-[1.25rem] border border-white/10 bg-white/[0.045] px-3 py-3 transition hover:border-white/20 hover:bg-white/[0.08] ${compact ? "min-h-[4.6rem]" : "min-h-[5.6rem]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-2 text-slate-100">
          <Icon className="h-4 w-4" />
        </div>
        {entry.badge ? (
          <div className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] font-medium text-amber-100">
            {entry.badge}
          </div>
        ) : null}
      </div>
      <div className={`mt-3 font-medium text-white ${compact ? "text-sm" : "text-[15px]"}`}>{entry.label}</div>
    </Link>
  );
}
