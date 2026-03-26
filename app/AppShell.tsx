"use client";

import React from "react";
import Link from "next/link";
import UserExperienceTracker from "@/components/analytics/UserExperienceTracker";
import HeaderInboxControl from "@/components/contact/HeaderInboxControl";
import HeaderMenu from "@/components/HeaderMenu";
import { LobbyThemePicker } from "@/components/lobby/LobbyAppearanceControls";
import { getLobbyHeaderSkin } from "@/components/lobby/lobbyPresentation";
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
  const headerSkin = getLobbyHeaderSkin(themeKey);

  return (
    <div className="min-h-screen text-white transition-[background-image,background-color] duration-500" style={pageStyle}>
      <UserExperienceTracker />
      <header
        className={`border-b px-3 py-4 backdrop-blur-xl transition-[background-color,border-color] duration-500 sm:px-4 ${headerSkin.shell}`}
      >
        <div className="mx-auto max-w-6xl overflow-visible">
          <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0">
              <div className={`text-xs uppercase tracking-[0.35em] ${presentationTone.eyebrow}`}>
                AoE2HD Bets
              </div>
              <h1 className="text-xl font-semibold text-white">Tournament Lobby</h1>
            </div>

            <nav className="flex max-w-full items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [-ms-overflow-style:none] lg:justify-self-center lg:pb-0">
              {HEADER_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full border px-3 py-1 text-xs transition ${headerSkin.surface}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="flex flex-col items-start gap-2 lg:justify-self-end lg:items-end">
              <div className="flex items-center justify-start gap-3 lg:justify-end">
                <HeaderInboxControl buttonClassName={headerSkin.surface} />
                <HeaderMenu
                  pendingBetsCount={pendingBetsCount}
                  playerName={playerName}
                  setPlayerName={setPlayerName}
                  uid={uid}
                  buttonClassName={headerSkin.surface}
                  menuClassName={headerSkin.popover}
                  linkClassName={headerSkin.menuItem}
                  logoutClassName={headerSkin.logout}
                />
              </div>
              <LobbyThemePicker
                themeKey={themeKey}
                onThemeChange={setThemeKey}
                tone={presentationTone}
                size="sm"
                className="gap-1.5"
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
