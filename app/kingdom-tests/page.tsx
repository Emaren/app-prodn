import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";
import KingdomTestProofPanel from "@/components/kingdom-tests/KingdomTestProofPanel";

export const metadata: Metadata = {
  title: "Kingdom Tests · AoE2WAR",
  description: "Engineering proof lanes from canonical inspection checks and route certification.",
  alternates: { canonical: "/kingdom-tests" },
};

export default function KingdomTestsPage() {
  return <>
    <KingdomTestProofPanel />
    <KingdomInstruments kind="tests" />
  </>;
}
