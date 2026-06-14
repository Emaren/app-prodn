import type { Metadata, Viewport } from "next";
import Script from "next/script";

import "./globals.css";
import AppShell from "./AppShell";
import PwaRegister from "@/components/pwa/PwaRegister";

export const metadata: Metadata = {
  metadataBase: new URL("https://aoe2war.com"),
  applicationName: "AoE2HDBets",
  title: {
    default: "AoE2HDBets",
    template: "%s | AoE2HDBets",
  },
  description:
    "AoE2HD tournament lobby with live chat, replay-backed results, rivalry pages, and the trust layer for competitive bets.",
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AoE2HDBets",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "AoE2HDBets",
    description:
      "Tournament lobby, replay proof, rivalry pages, and live chat for AoE2HD players.",
    url: "https://aoe2war.com",
    siteName: "AoE2HDBets",
    type: "website",
    images: [
      {
        url: "/social/aoe2hdbets-card-war-room.png",
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
        url: "/social/aoe2hdbets-card-war-room.png",
        alt: "AoE2HDBets tournament lobby social card",
      },
    ],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#07111f" },
    { media: "(prefers-color-scheme: dark)", color: "#07111f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="bg-[#050814] text-white min-h-screen flex flex-col"
        suppressHydrationWarning
      >
        <Script
          defer
          data-domain="aoe2war.com"
          src="https://plausible.io/js/script.js"
        />
        <Script
          defer
          src="https://traffic.tokentap.ca/api/beacon.js"
          data-project="aoe2hdbets"
        />
        <AppShell>{children}</AppShell>
        <PwaRegister />
      </body>
    </html>
  );
}
