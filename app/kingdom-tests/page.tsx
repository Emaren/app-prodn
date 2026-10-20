import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Kingdom Tests · AoE2WAR",
  description: "Engineering proof lanes from canonical inspection checks and route certification.",
  alternates: { canonical: "/kingdom-tests" },
};

export default function KingdomTestsPage() {
  return <KingdomInstruments kind="tests" />;
}
