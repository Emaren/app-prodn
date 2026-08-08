import type { Metadata } from "next";

import RoundChamberClient from "@/components/round-chamber/RoundChamberClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Round Chamber",
  description:
    "Propose, deliberate, and cast one equal civic ballot in the public AoE2WAR Round Chamber.",
  alternates: {
    canonical: "/round-chamber",
  },
  openGraph: {
    title: "The Round Chamber | AoE2WAR",
    description:
      "Bring an idea to the oak table. Debate it in public. Let the Chronicle remember what the Kingdom chose.",
    images: [
      {
        url: "/kingdom/kingdom-hero-bg.webp",
        alt: "The AoE2WAR Kingdom Round Chamber",
      },
    ],
  },
};

export default function RoundChamberPage() {
  return <RoundChamberClient />;
}
