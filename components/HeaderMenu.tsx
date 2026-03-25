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
}

export default function HeaderMenu({ pendingBetsCount, playerName, uid }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { logout, isAdmin } = useUserAuth();

  useClickOutside(menuRef as React.RefObject<HTMLElement>, () => setMenuOpen(false));

  if (!uid) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/game-stats"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/80 transition hover:border-white/30 hover:text-white"
        >
          Live Matches
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
        className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-white/30 hover:bg-white/10"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <UserCircle className="h-5 w-5" />
        <span>{playerName || "Account"}</span>
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-14 z-50 w-64 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-2xl backdrop-blur">
          <MenuLink href="/profile" onNavigate={() => setMenuOpen(false)}>
            Profile
          </MenuLink>
          <MenuLink href="/players" onNavigate={() => setMenuOpen(false)}>
            Players
          </MenuLink>
          <MenuLink href="/rivalries" onNavigate={() => setMenuOpen(false)}>
            Rivalries
          </MenuLink>
          <MenuLink href="/upload" onNavigate={() => setMenuOpen(false)}>
            Upload Replay
          </MenuLink>
          <MenuLink href="/replay-parser" onNavigate={() => setMenuOpen(false)}>
            Replay Watcher
          </MenuLink>
          <MenuLink href="/game-stats" onNavigate={() => setMenuOpen(false)}>
            Game Stats
          </MenuLink>
          <MenuLink href="/download" onNavigate={() => setMenuOpen(false)}>
            Download Watcher
          </MenuLink>
          <MenuLink href="/wolo" onNavigate={() => setMenuOpen(false)}>
            $WOLO
          </MenuLink>
          <MenuLink href="/roadmap" onNavigate={() => setMenuOpen(false)}>
            Roadmap
          </MenuLink>
          <MenuLink href="/about" onNavigate={() => setMenuOpen(false)}>
            About
          </MenuLink>
          <MenuLink href="/pending-bets" onNavigate={() => setMenuOpen(false)}>
            Pending Bets ({pendingBetsCount})
          </MenuLink>

          {isAdmin && (
            <MenuLink href="/admin/user-list" onNavigate={() => setMenuOpen(false)}>
              Admin
            </MenuLink>
          )}

          <button
            className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
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
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      className="block rounded-xl px-3 py-2 text-sm text-white/85 transition hover:bg-white/8 hover:text-white"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
