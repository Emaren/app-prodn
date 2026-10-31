import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildEngineeringProjection } from "@/lib/kingdomEngineeringProjection";
import EngineeringObservatory from "@/components/kingdom-engineering/EngineeringObservatory";

/**
 * One deliberate visual gallery route; no wildcard publication of unreviewed
 * modes and no new 89th static public Kingdom Index entry.
 */
export const dynamicParams = false;
export function generateStaticParams() {
  return [{ mode: "engineering" }];
}
export const metadata: Metadata = {
  title: "Engineering Observatory · AoE2WAR OS",
  description: "Source-bound neural graphs, bounded loops, swarms and armies, hierarchy, Composer and Kingdom Run-Up.",
};
type PageProps = { params: Promise<{ mode: string }> };
export default async function EngineeringViewPage({ params }: PageProps) {
  const { mode } = await params;
  if (mode !== "engineering") notFound();
  return <EngineeringObservatory initial={buildEngineeringProjection("public")} />;
}
