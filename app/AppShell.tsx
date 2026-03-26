"use client";

import React from "react";
import Link from "next/link";
import UserExperienceTracker from "@/components/analytics/UserExperienceTracker";
import HeaderInboxControl from "@/components/contact/HeaderInboxControl";
import HeaderMenu from "@/components/HeaderMenu";
import { LobbyThemePicker } from "@/components/lobby/LobbyAppearanceControls";
import {
  LobbyAppearanceProvider,
  useLobbyAppearance,
} from "@/components/lobby/LobbyAppearanceContext";
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
  const { themeKey, setThemeKey, presentationTone, pageStyle } = useLobbyAppearance();
  const [pendingBetsCount] = React.useState(0);

  return (
    <div className="min-h-screen text-white transition-[background-image,background-color] duration-500" style={pageStyle}>
      <UserExperienceTracker />
      <header className="border-b border-white/10 bg-slate-950/55 px-3 py-4 backdrop-blur sm:px-4">
        <div className="mx-auto max-w-6xl overflow-visible">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-start">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">
                AoE2HD Bets
              </div>
              <h1 className="text-xl font-semibold text-white">Tournament Lobby</h1>
            </div>

            <nav className="flex flex-wrap items-center gap-2 lg:justify-self-center">
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

            <div className="flex flex-col items-start gap-2 lg:justify-self-end lg:items-end">
              <div className="flex w-full items-center justify-start gap-3 sm:w-auto sm:justify-end">
                <HeaderInboxControl />
                <HeaderMenu
                  pendingBetsCount={pendingBetsCount}
                  playerName={playerName}
                  setPlayerName={setPlayerName}
                  uid={uid}
                />
              </div>
              <LobbyThemePicker
                themeKey={themeKey}
                onThemeChange={setThemeKey}
                tone={presentationTone}
                size="sm"
                className="justify-start sm:justify-end"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex-1 w-full max-w-6xl px-3 py-4 sm:px-4">{children}</main>
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
