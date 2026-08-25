import type { Metadata } from "next";

import WarGraphExperience from "@/components/wargraph/WarGraphExperience";
import { loadWarGraphPublicSnapshot } from "@/lib/wargraph/snapshot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "WarGraph · The Living Tournament · AoE2WAR",
  description:
    "Enter AoE2WAR's persistent WarGraph: verified battles, moving war tables, the Crown, and WOLO glory.",
};

export default async function WarGraphPage() {
  const snapshot = await loadWarGraphPublicSnapshot();

  return <WarGraphExperience initialSnapshot={snapshot} />;
}
