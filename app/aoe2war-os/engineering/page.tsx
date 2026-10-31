import type { Metadata } from "next";
import { buildEngineeringProjection } from "@/lib/kingdomEngineeringProjection";
import EngineeringObservatory from "@/components/kingdom-engineering/EngineeringObservatory";

export const metadata: Metadata = {
  title: "Engineering Observatory · AoE2WAR OS",
  description: "Source-backed neural graphs, bounded loops, swarms, armies, engineering hierarchy, composer and Kingdom Run-Up.",
};
export const dynamic = "force-static";

export default function EngineeringObservatoryPublicPage() {
  return <EngineeringObservatory initial={buildEngineeringProjection("public")} />;
}
