import type { Metadata } from "next";

import { LeaderboardViewLink } from "@/components/leaderboard/LeaderboardViewLink";
import { LeaderboardViewPreferenceMarker } from "@/components/leaderboard/LeaderboardViewPreferenceMarker";
import { LeaderboardPanel as TrueOgLeaderboardPanel } from "@/components/leaderboard/TrueOgLeaderboardPanel";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OG Leaderboard · AoE2WAR",
  description:
    "The original AoE2WAR leaderboard presentation, restored with current HD leaderboard truth.",
};

export default async function OgLeaderboardPage() {
  let leaderboard = null;

  try {
    leaderboard =
      await loadLobbyLeaderboard(
        getPrisma(),
        {
          lane: "rm",
          offset: 0,
          limit: 100,
          includePendingClaimed: false,
        },
      );
  } catch (error) {
    console.error(
      "Failed to render true OG leaderboard:",
      error,
    );
  }

  return (
    <>
      <LeaderboardViewPreferenceMarker
        view="og"
      />

      <SpeedReadyMarker
        route="/leaderboard/og"
      />

      <main className="py-4 text-white sm:py-7">
        <div className="mx-auto max-w-6xl">
          <div className="mb-5 flex justify-end">
            <LeaderboardViewLink
              from="og"
              to="modern"
              href="/leaderboard?view=modern"
            >
              Modern Board
            </LeaderboardViewLink>
          </div>

          {leaderboard ? (
            <TrueOgLeaderboardPanel
              leaderboard={leaderboard}
            />
          ) : (
            <div className="rounded-[1.85rem] border border-white/10 bg-white/[0.04] px-6 py-12 text-center text-slate-300">
              The original leaderboard is temporarily unavailable.
            </div>
          )}
        </div>
      </main>
    </>
  );
}
