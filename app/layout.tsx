// app/layout.tsx
"use client";

import React from "react";
import "./globals.css";
import WalletConnector from "@/components/WalletConnector";
import EarlyPatches from "@/components/EarlyPatches";
import HeaderMenu from "@/components/HeaderMenu";
import { Toaster } from "sonner";
import { Providers } from "./Providers";
import { UserAuthProvider, useUserAuth } from "@/context/UserAuthContext";

function InnerLayout({ children }: { children: React.ReactNode }) {
  const { uid, playerName, setPlayerName } = useUserAuth(); // ✅ fixed
  const [pendingBetsCount, setPendingBetsCount] = React.useState(0);

  return (
    <>
      <header className="w-full p-4 border-b border-gray-700">
        <div className="max-w-4xl mx-auto flex flex-wrap justify-between items-center gap-4 overflow-visible">
          <h1 className="text-xl font-semibold">AoE2 Betting</h1>
          <div className="flex items-center gap-4">
            <WalletConnector />
            <HeaderMenu
              pendingBetsCount={pendingBetsCount}
              playerName={playerName}
              setPlayerName={setPlayerName}
              uid={uid} // ✅ now valid
            />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto p-4">{children}</main>
    </>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head />
      <body className="bg-gray-900 text-white min-h-screen flex flex-col">
        <EarlyPatches />
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
