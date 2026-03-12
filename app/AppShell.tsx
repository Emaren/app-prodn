"use client";

import React from "react";
import HeaderMenu from "@/components/HeaderMenu";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";

function InnerShell({ children }: { children: React.ReactNode }) {
  const { uid, playerName, setPlayerName } = useUserAuth();
  const [pendingBetsCount] = React.useState(0);

  return (
    <>
      <header className="border-b border-white/10 bg-slate-950/90 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 overflow-visible">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">
              AoE2HD Bets
            </div>
            <h1 className="text-xl font-semibold text-white">Tournament Lobby</h1>
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
