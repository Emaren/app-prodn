import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  metadataBase: new URL("https://aoe2hdbets.com"),
  title: {
    default: "AoE2HDBets",
    template: "%s | AoE2HDBets",
  },
  description:
    "AoE2HD tournament lobby with live chat, replay-backed results, rivalry pages, and the trust layer for competitive bets.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "AoE2HDBets",
    description:
      "Tournament lobby, replay proof, rivalry pages, and live chat for AoE2HD players.",
    url: "https://aoe2hdbets.com",
    siteName: "AoE2HDBets",
    type: "website",
    images: [
      {
        url: "/social/aoe2hdbets-card.png",
        width: 1200,
        height: 630,
        alt: "AoE2HDBets tournament lobby social card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@AoE2HDBets",
    creator: "@AoE2HDBets",
    title: "AoE2HDBets",
    description:
      "Tournament lobby, replay proof, rivalry pages, and live chat for AoE2HD players.",
    images: [
      {
        url: "/social/aoe2hdbets-card.png",
        alt: "AoE2HDBets tournament lobby social card",
      },
    ],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192x192.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-white min-h-screen flex flex-col">
        <Script
          defer
          data-domain="aoe2hdbets.com"
          src="https://plausible.io/js/script.js"
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}