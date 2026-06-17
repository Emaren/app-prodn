import type { Metadata } from "next";

import WolomaniaPageClient from "./WolomaniaPageClient";

export const metadata: Metadata = {
  title: "Wolomania I",
  description:
    "Wolomania I — the first AoE2WAR world championship event. Jim vs Julio Alvarez. 100,000 WOLO winner takes all.",
  alternates: {
    canonical: "/wolomania",
  },
  openGraph: {
    title: "Wolomania I | AoE2WAR",
    description:
      "The first AoE2WAR world championship event. July 10, 2026. 100,000 WOLO winner takes all.",
    url: "https://aoe2war.com/wolomania",
    siteName: "AoE2WAR",
    type: "website",
  },
};

export default function WolomaniaPage() {
  return <WolomaniaPageClient />;
}
