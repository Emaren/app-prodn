import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Wolo Machine · AoE2WAR",
  description: "HD-first WoloChain consensus, module graph and protected financial provenance.",
  alternates: { canonical: "/wolo-machine" },
};

export default function WoloMachinePage() {
  return <KingdomInstruments kind="wolo" />;
}
