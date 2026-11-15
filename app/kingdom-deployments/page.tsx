import type { Metadata } from "next";
import KingdomDeploymentsClient from "./KingdomDeploymentsClient";

export const metadata: Metadata = {
  title: "Kingdom Deployments · AoE2WAR",
  description: "Source-linked, read-only website release activity, stopwatch measurements and deployment proof.",
  alternates: { canonical: "/kingdom-deployments" },
};

export default function KingdomDeploymentsPage() {
  return <KingdomDeploymentsClient />;
}
