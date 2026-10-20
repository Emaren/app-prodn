import type { Metadata } from "next";
import KingdomInstruments from "@/components/kingdom-instruments/KingdomInstruments";

export const metadata: Metadata = {
  title: "Kingdom Sensors · AoE2WAR",
  description: "Read-only telemetry sensors from existing kingdom inspections and intelligence.",
  alternates: { canonical: "/kingdom-sensors" },
};

export default function KingdomSensorsPage() {
  return <KingdomInstruments kind="sensors" />;
}
