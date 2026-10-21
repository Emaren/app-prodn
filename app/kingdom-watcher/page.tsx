import type { Metadata } from "next";
import { loadKingdomWatcherPublic } from "@/lib/kingdomWatcherPublic";
import KingdomWatcherClient from "./KingdomWatcherClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Kingdom Watcher | AoE2WAR",
  description: "The public Watcher mission control: authenticated activity, release provenance, real fleet signals and code qualification.",
  alternates: { canonical: "/kingdom-watcher" },
};

export default async function KingdomWatcherPage() {
  const initial = await loadKingdomWatcherPublic();
  return <KingdomWatcherClient initial={initial} />;
}
