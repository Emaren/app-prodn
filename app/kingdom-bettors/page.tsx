import type { Metadata } from "next";
import KingdomBettors from "@/components/kingdom-bettors/KingdomBettors";
import {loadKingdomBettors} from "@/lib/kingdomBettors";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import { usesNonfinancialProductionAuth } from "@/lib/productionAuth";
import PublicHistoricalMarketArchive from "@/components/production/PublicHistoricalMarketArchive";
import { loadNonfinancialPublicMarketArchive } from "@/lib/nonfinancialPublicMarketArchive";
import { getPrisma } from "@/lib/prisma";

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
    let records: Awaited<ReturnType<typeof loadNonfinancialPublicMarketArchive>> = [];
    let available = false;
    try {
      records = await loadNonfinancialPublicMarketArchive(getPrisma());
      available = true;
    } catch {
      console.error("A05_BETTORS_PUBLISHED_ARCHIVE_UNAVAILABLE");
    }
    return <PublicHistoricalMarketArchive heading="Kingdom Bettors · Published Archive"
      intro="Explore the Kingdom's recorded market history without wagering, payout claims or private bettor records."
      records={records} viewAvailable={available} />;
  }
  const snapshot=await loadKingdomBettors();
  return <><SpeedReadyMarker route="/kingdom-bettors"/><KingdomBettors initial={snapshot}/></>;
}
