import type { Metadata } from "next";
import { loadKingdomIndex } from "@/lib/kingdomIndex";
import KingdomIndex from "@/components/kingdom-index/KingdomIndex";
export const dynamic="force-dynamic";
export const metadata:Metadata={
  title:"Kingdom Index · AoE2WAR",
  description:"A living map of the Kingdom's public routes, measured engineering maturity and source-bound inspection drift.",
  alternates:{canonical:"/kingdom-index"}
};
export default async function KingdomIndexPage(){
  const snapshot=await loadKingdomIndex();
  return <KingdomIndex initial={snapshot}/>;
}
