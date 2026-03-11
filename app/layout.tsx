// app/layout.tsx
"use client";

import React from "react";
import "./globals.css";
import HeaderMenu from "@/components/HeaderMenu";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";

function InnerLayout({ children }: { children: React.ReactNode }) {
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
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Plausible */}
        <script
          defer
          data-domain="aoe2hdbets.com"
          src="https://plausible.io/js/script.js"
        ></script>
      </head>

      <body className="bg-gray-900 text-white min-h-screen flex flex-col">
        <UserAuthProvider>
          <Providers>
            <InnerLayout>{children}</InnerLayout>
          </Providers>
        </UserAuthProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
