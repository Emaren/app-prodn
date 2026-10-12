import type { Metadata } from "next";
import KingdomTreasury from "@/components/treasury/KingdomTreasury";
import "./treasury.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kingdom Treasury · AoE2WAR",
  description: "Public WOLO Chain treasury accounts, Osmosis liquidity, kingdom-origin transfer evidence, and founder-reported running costs.",
};

export default function KingdomTreasuryPage() {
  return <KingdomTreasury />;
}
