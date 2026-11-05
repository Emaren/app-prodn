import type { Metadata } from "next";
import KingdomBettors from "@/components/kingdom-bettors/KingdomBettors";
import {loadKingdomBettors} from "@/lib/kingdomBettors";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";
import RestrictedPublicPreview from "@/components/production/RestrictedPublicPreview";

export const dynamic="force-dynamic";
export const metadata:Metadata={
  title:"Kingdom Bettors · AoE2WAR",
  description:"The Kingdom's bettors, challenge arena, championship belts and evidence-backed betting records.",
  alternates:{canonical:"/kingdom-bettors"}
};
export default async function KingdomBettorsPage(){
  // The funded bettors tables and bot configuration are not approved for
  // nonfinancial production. Never expose raw bet balances through the web role.
  if (usesNonfinancialProductionAuth()) {
    return <RestrictedPublicPreview title="Kingdom Bettors" description="The bettors arena is in nonfinancial preview. Wager histories, bot configurations and payout ledgers remain unavailable until separately authorized." />;
  }
  const snapshot=await loadKingdomBettors();
  return <><SpeedReadyMarker route="/kingdom-bettors"/><KingdomBettors initial={snapshot}/></>;
}
