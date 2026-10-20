import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Kingdom Recovery · AoE2WAR",
  description: "Operational recovery receipts, release source and verified restore boundaries.",
  alternates: { canonical: "/kingdom-recovery" },
};

export default function KingdomRecoveryPage() {
  return <KingdomInstruments kind="recovery" />;
}
