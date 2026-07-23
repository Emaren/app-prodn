import type { Metadata } from "next";

import { OgBoardPage } from "@/components/leaderboard/OgBoardPage";
import { LeaderboardViewPreferenceMarker } from "@/components/leaderboard/LeaderboardViewPreferenceMarker";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadOgBoardPage } from "@/lib/ogBoard";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "OG Board · AoE2WAR",
  description:
    "AoE2WAR's chronological Age of Empires II HD battle board.",
};

export default async function OgLeaderboardPage() {
  let initialPage = null;

  try {
    initialPage =
      await loadOgBoardPage(
        getPrisma(),
        {
          offset: 0,
          limit: 24,
        },
      );
  } catch (error) {
    console.error(
      "Failed to render OG leaderboard:",
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

      <OgBoardPage
        initialPage={initialPage}
      />
    </>
  );
}
