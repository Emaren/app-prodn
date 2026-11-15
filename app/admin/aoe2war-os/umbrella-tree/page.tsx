import type { Metadata } from "next";
import { requireServerAdmin } from "@/lib/adminSession";
import sourceRegistry from "@/config/aoe2war-os-registry.v1.json";
import { buildUmbrellaTree } from "@/lib/umbrellaTreeModel";
import UmbrellaTreeClient from "@/components/umbrella-tree/UmbrellaTreeClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "The Umbrella Tree · AoE2WAR OS",
  description: "Private source-taxonomy constellation with evidence-scoped lights and nested work environments.",
  robots: { index: false, follow: false },
};

export default async function UmbrellaTreePage() {
  await requireServerAdmin();
  const graph = buildUmbrellaTree(sourceRegistry);
  return <UmbrellaTreeClient graph={graph} />;
}
