import type { Metadata } from "next";

import ChampionsV2Experience from "@/components/champions/ChampionsV2Experience";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChampionsV2State } from "@/lib/champions/championsV2";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Championship Belts",
  description:
    "AoE2WAR championship belts, RM and DM contenders, team crowns, national titles, and ELO divisions.",
};

export default async function ChampionsPage() {
  const state = await loadChampionsV2State(getPrisma());

  return (
    <>
      <SpeedReadyMarker route="/champions" />
      <ChampionsV2Experience state={state} />
    </>
  );
}
