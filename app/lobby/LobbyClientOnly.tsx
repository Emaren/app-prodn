"use client";

import dynamic from "next/dynamic";
import type { HeroPlaylistView } from "@/lib/hero/types";
import type { LobbySnapshot } from "@/lib/lobby";

const HomePageClient = dynamic(() => import("@/app/HomePageClient"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-sm uppercase tracking-[0.35em] text-amber-200/70">
          AoE2HD Bets
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Loading lobby...</h1>
      </div>
    </main>
  ),
});

export default function LobbyClientOnly({
  initialLobby,
  initialHeroPlaylist,
}: {
  initialLobby: LobbySnapshot;
  initialHeroPlaylist: HeroPlaylistView;
}) {
  return (
    <HomePageClient
      initialLobby={initialLobby}
      initialHeroPlaylist={initialHeroPlaylist}
    />
  );
}
