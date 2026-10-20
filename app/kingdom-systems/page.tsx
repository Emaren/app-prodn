import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Kingdom Systems · AoE2WAR",
  description: "The running Next.js machine rack, route templates and policy coverage.",
  alternates: { canonical: "/kingdom-systems" },
};

export default function KingdomSystemsPage() {
  return <KingdomInstruments kind="systems" />;
}
