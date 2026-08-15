import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ModernLeaderboardPage } from "@/components/leaderboard/ModernLeaderboardPage";
import { LeaderboardViewPreferenceMarker } from "@/components/leaderboard/LeaderboardViewPreferenceMarker";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import {
  LEADERBOARD_VIEW_COOKIE_KEY,
  normalizeLeaderboardView,
} from "@/lib/leaderboardViewPreference";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HD Leaderboard · AoE2WAR",
  description:
    "AoE2WAR's ranked Age of Empires II HD warriors, ratings, records, and streaks.",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[];
  }>;
}) {
  const params = await searchParams;

  const explicitView =
    typeof params.view === "string"
      ? params.view
      : null;

  const cookieStore = await cookies();

  const preferredView =
    normalizeLeaderboardView(
      cookieStore.get(
        LEADERBOARD_VIEW_COOKIE_KEY,
      )?.value,
    );

  if (
    explicitView !== "modern" &&
    preferredView === "og"
  ) {
    redirect("/leaderboard/og");
  }

  let initialLeaderboard = null;

  try {
    initialLeaderboard =
      await loadLobbyLeaderboard(
        getPrisma(),
        {
          lane: "rm",
          offset: 0,
          limit: 50,
          includePendingClaimed: false,
          includeFeaturedClaimed: false,
          scope: "all",
        },
      );
  } catch (error) {
    console.error(
      "Failed to render HD leaderboard:",
      error,
    );
  }

  return (
    <>
      <LeaderboardViewPreferenceMarker
        view="modern"
      />

      <ModernLeaderboardPage
        initialLeaderboard={
          initialLeaderboard
        }
      />
    </>
  );
}
