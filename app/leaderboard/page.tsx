import type { Metadata } from "next";

import { ModernLeaderboardPage } from "@/components/leaderboard/ModernLeaderboardPage";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HD Leaderboard · AoE2WAR",
  description: "AoE2WAR's ranked Age of Empires II HD warriors, ratings, records, and streaks.",
};

export default async function LeaderboardPage() {
  let initialLeaderboard = null;
  try {
    initialLeaderboard = await loadLobbyLeaderboard(getPrisma(), {
      lane: "rm",
      offset: 0,
      limit: 50,
      includePendingClaimed: false,
    });
  } catch (error) {
    console.error("Failed to render HD leaderboard:", error);
  }

  return (
    <>
      <SpeedReadyMarker route="/leaderboard" />
      <ModernLeaderboardPage initialLeaderboard={initialLeaderboard} />
    </>
  );
}
