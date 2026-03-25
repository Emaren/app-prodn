"use client";

import React from "react";
import Link from "next/link";
import HeaderMenu from "@/components/HeaderMenu";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";

const HEADER_LINKS = [
  { href: "/", label: "Lobby" },
  { href: "/players", label: "Players" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/wolo", label: "$WOLO" },
  { href: "/roadmap", label: "Roadmap" },
  { href: "/about", label: "About" },
] as const;

function InnerShell({ children }: { children: React.ReactNode }) {
  const { uid, playerName, setPlayerName } = useUserAuth();
  const [pendingBetsCount] = React.useState(0);

  return (
    <>
      <header className="border-b border-white/10 bg-slate-950/90 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 overflow-visible">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">
              AoE2HD Bets
            </div>
            <h1 className="text-xl font-semibold text-white">Tournament Lobby</h1>
            <nav className="flex flex-wrap gap-2">
              {HEADER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-white/25 hover:text-white"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <HeaderMenu
              pendingBetsCount={pendingBetsCount}
              playerName={playerName}
              setPlayerName={setPlayerName}
              uid={uid}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto flex-1 max-w-6xl p-4">{children}</main>
      <Toaster richColors />
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <UserAuthProvider>
      <Providers>
        <InnerShell>{children}</InnerShell>
      </Providers>
    </UserAuthProvider>
  );
}
