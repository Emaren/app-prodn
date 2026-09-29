import type { Metadata } from "next";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import LeaguesPageClient from "@/components/leagues/LeaguesPageClient";
import { loadPublicLeagues } from "@/lib/leagues";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leagues",
  description:
    "AoE2WAR 1v1, 2v2, 3v3, and 4v4 RM and DM leagues, including player-founded 100 WOLO league charters.",
};

export default async function LeaguesPage() {
  const leagues = await loadPublicLeagues(getPrisma());

  return (
    <>
      <SpeedReadyMarker route="/leagues" />
      <LeaguesPageClient leagues={leagues} />
    </>
  );
}
