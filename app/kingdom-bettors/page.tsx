import type { Metadata } from "next";
import KingdomBettors from "@/components/kingdom-bettors/KingdomBettors";
import {loadKingdomBettors} from "@/lib/kingdomBettors";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";

export const dynamic="force-dynamic";
export const metadata:Metadata={
  title:"Kingdom Bettors · AoE2WAR",
  description:"The Kingdom's bettors, challenge arena, championship belts and evidence-backed betting records.",
  alternates:{canonical:"/kingdom-bettors"}
};
export default async function KingdomBettorsPage(){
  const snapshot=await loadKingdomBettors();
  return <><SpeedReadyMarker route="/kingdom-bettors"/><KingdomBettors initial={snapshot}/></>;
}
