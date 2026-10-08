import type { Metadata } from "next";

import ChampionsV2Experience from "@/components/champions/ChampionsV2Experience";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChampionsV2State } from "@/lib/champions/championsV2";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Championship Belts · E4",
  description:
    "AoE2WAR Champions E4: the E3 throne-room opening with the cleaner E2 championship rails, challenge shortcuts, and RM/DM/Both team views.",
};

export default async function ChampionsE4Page() {
  const state = await loadChampionsV2State(getPrisma());

  return (
    <>
      <SpeedReadyMarker route="/champions/e4" />
      <ChampionsV2Experience state={state} variant="e4" />
    </>
  );
}
