import type { Metadata } from "next";

import ChampionsE3Experience from "@/components/champions/ChampionsE3Experience";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { loadChampionsV2State } from "@/lib/champions/championsV2";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Championship Belts",
  description:
    "AoE2WAR Champions E3: the preserved E1 war-table layout with the complete E2 championship ledger.",
};

export default async function ChampionsPage() {
  const state = await loadChampionsV2State(getPrisma());

  return (
    <>
      <SpeedReadyMarker route="/champions" />
      <ChampionsE3Experience state={state} />
    </>
  );
}
