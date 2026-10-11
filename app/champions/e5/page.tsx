import type { Metadata } from "next";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import ChampionsV2Experience from "@/components/champions/ChampionsV2Experience";
import { loadChampionsV2State } from "@/lib/champions/championsV2";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Championship Belts · E5",
  description: "AoE2WAR E5 championship hall, ten contender slots, and every title challengeable.",
};

export default async function ChampionsE5Page() {
  const state = await loadChampionsV2State(getPrisma());
  return <><SpeedReadyMarker route="/champions/e5" /><ChampionsV2Experience state={state} variant="e5" /></>;
}
