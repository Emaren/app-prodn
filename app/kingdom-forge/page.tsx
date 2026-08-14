import type { Metadata } from "next";

import KingdomForgeClient from "@/components/kingdom-forge/KingdomForgeClient";

export const metadata: Metadata = {
  title: "Kingdom Forge",
  description:
    "Direct excess WOLO staking power into named AoE2WAR projects, milestones, patrons, and finite Feature Deeds.",
  alternates: { canonical: "/kingdom-forge" },
  openGraph: {
    title: "Kingdom Forge · The first million earns. The rest builds.",
    description:
      "Choose what AoE2WAR builds next through project campaigns, Forge Power, and 10,000 finite Feature Deeds.",
    url: "https://aoe2war.com/kingdom-forge",
    images: [
      {
        url: "/kingdom-forge/construction.jpg",
        width: 2048,
        height: 682,
        alt: "The Kingdom Forge rising under construction",
      },
    ],
  },
};

export default function KingdomForgePage() {
  return <KingdomForgeClient />;
}
