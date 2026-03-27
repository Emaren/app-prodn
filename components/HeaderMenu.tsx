"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { UserCircle } from "lucide-react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useUserAuth } from "@/context/UserAuthContext";
import SteamLoginButton from "@/components/SteamLoginButton";

interface Props {
  pendingBetsCount: number;
  playerName: string;
  setPlayerName: (name: string) => void;
  uid: string | null;
  liveGamesCount?: number;
  requestCount?: number;
  buttonClassName?: string;
  menuClassName?: string;
  linkClassName?: string;
  logoutClassName?: string;
}

export default function HeaderMenu({
  pendingBetsCount,
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
  const { logout, isAdmin } = useUserAuth();

  useClickOutside(menuRef as React.RefObject<HTMLElement>, () => setMenuOpen(false));

  if (!uid) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/live-games"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
        >
          {liveGamesCount} Live Games🔥
        </Link>
        <SteamLoginButton
          className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        />
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      <button
        className={[
          "flex min-w-0 items-center gap-2 rounded-full border px-4 py-2 text-sm text-white transition",
          buttonClassName || "border-white/15 bg-white/5 hover:border-white/30 hover:bg-white/10",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <UserCircle className="h-5 w-5" />
        <span className="max-w-[8.5rem] truncate sm:max-w-none">{playerName || "Account"}</span>
      </button>

      {menuOpen && (
        <div
          className={[
            "absolute right-0 top-14 z-50 w-64 rounded-2xl border p-2 shadow-2xl backdrop-blur",
            menuClassName || "border-white/10 bg-slate-950/95",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <MenuLink href="/profile" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Profile
          </MenuLink>
          <MenuLink href="/contact-emaren" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Contact Emaren
          </MenuLink>
          <MenuLink href="/players" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Players
          </MenuLink>
          <MenuLink href="/requests" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Requests ({requestCount})
          </MenuLink>
          <MenuLink href="/live-games" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Live Games ({liveGamesCount})
          </MenuLink>
          <MenuLink href="/rivalries" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Rivalries
          </MenuLink>
          <MenuLink href="/upload" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Upload Replay
          </MenuLink>
          <MenuLink href="/replay-parser" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Replay Watcher
          </MenuLink>
          <MenuLink href="/game-stats" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Game Stats
          </MenuLink>
          <MenuLink href="/download" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Download Watcher
          </MenuLink>
          <MenuLink href="/wolo" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            $WOLO
          </MenuLink>
          <MenuLink href="/roadmap" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Roadmap
          </MenuLink>
          <MenuLink href="/about" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            About
          </MenuLink>
          <MenuLink href="/pending-bets" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
            Pending Bets ({pendingBetsCount})
          </MenuLink>

          {isAdmin && (
            <MenuLink href="/admin/user-list" linkClassName={linkClassName} onNavigate={() => setMenuOpen(false)}>
              Admin
            </MenuLink>
          )}

          <button
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
      )}
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
        "block rounded-xl px-3 py-2 text-sm transition",
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
