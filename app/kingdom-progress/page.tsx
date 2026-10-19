import type { Metadata } from "next";
import KingdomProgressClient from "./KingdomProgressClient";

export const metadata: Metadata = {
  title: "Kingdom Progress · AoE2WAR",
  description: "Evidence-bound feature campaigns, engineering milestones and release progress.",
  alternates: { canonical: "/kingdom-progress" },
};

export default function KingdomProgressPage() {
  return <KingdomProgressClient />;
}
