import type { Metadata } from "next";
import KingdomBetters from "@/components/kingdom-betters/KingdomBetters";
import {loadKingdomBetters} from "@/lib/kingdomBetters";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";

export const dynamic="force-dynamic";
export const metadata:Metadata={
  title:"Kingdom Betters · AoE2WAR",
  description:"The Kingdom's bettors, challenge arena, championship belts and evidence-backed betting records.",
  alternates:{canonical:"/kingdom-betters"}
};
export default async function KingdomBettersPage(){
  const snapshot=await loadKingdomBetters();
  return <><SpeedReadyMarker route="/kingdom-betters"/><KingdomBetters initial={snapshot}/></>;
}
