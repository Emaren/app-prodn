import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Replay Laboratory · AoE2WAR",
  description: "Unresolved HD replay evidence, parsing failure spectrum and laboratory frontier.",
  alternates: { canonical: "/replay-laboratory" },
};

export default function ReplayLaboratoryPage() {
  return <KingdomInstruments kind="replay" />;
}
