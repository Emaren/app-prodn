import type { Metadata } from "next";
import KingdomBrainClient from "./KingdomBrainClient";

export const metadata: Metadata = {
  title: "Kingdom Brain · AoE2WAR",
  description: "Live source-of-truth constellation: authorities, consumers, inspectors and provenance.",
  alternates: { canonical: "/kingdom-brain" },
};

export default function KingdomBrainPage() {
  return <KingdomBrainClient />;
}
