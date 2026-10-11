import type { Metadata } from "next";

import ChampionsV2Experience from "@/components/champions/ChampionsV2Experience";
import { ChampionsPreferredViewRedirect } from "@/components/champions/ChampionsDisplayRail";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChampionsV2State } from "@/lib/champions/championsV2";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Championship Belts",
  description:
    "AoE2WAR Championship Belts E5: choose a championship, view contenders, and issue challenges.",
};

export default async function ChampionsPage() {
  const state = await loadChampionsV2State(getPrisma());

  return (
    <>
      <SpeedReadyMarker route="/champions" />
      <ChampionsPreferredViewRedirect />
      <ChampionsV2Experience state={state} variant="e5" />
    </>
  );
}
