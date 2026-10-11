import type { Metadata } from "next";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import ChampionsE3Experience from "@/components/champions/ChampionsE3Experience";
import { loadChampionsV2State } from "@/lib/champions/championsV2";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Championship Belts · E3",
  description: "The preserved E3 throne-room championship presentation.",
};

export default async function ChampionsE3Page() {
  const state = await loadChampionsV2State(getPrisma());
  return <><SpeedReadyMarker route="/champions/e3" /><ChampionsE3Experience state={state} /></>;
}
