import type { Metadata } from "next";
import { buildKingdomAgentsPublicSnapshot } from "@/lib/kingdomAgentsPublic";
import KingdomAgentsClient from "./KingdomAgentsClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Kingdom Agents · AoE2WAR",
  description: "The living sentinel network: verified OS activity, inspections, proof signals and operational telemetry across the kingdom.",
};

export default async function KingdomAgentsPage() {
  const initial = await buildKingdomAgentsPublicSnapshot();
  return <KingdomAgentsClient initial={initial} />;
}
