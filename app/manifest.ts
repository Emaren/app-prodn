import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AoE2HDBets",
    short_name: "AoE2Bets",
    description: "Age of Empires II HD live games, challenges, WOLO, and wagers.",
    start_url: "/app?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#f5c95f",
    orientation: "natural",
    categories: ["games", "sports", "finance", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Live Games",
        short_name: "Live",
        description: "Open the live AoE2HD board.",
        url: "/live-games",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Schedule Game",
        short_name: "Challenge",
        description: "Create or manage a scheduled match.",
        url: "/challenge",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "WOLO Wallet",
        short_name: "WOLO",
        description: "Open the WOLO wallet surface.",
        url: "/wolo",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Profile",
        short_name: "Profile",
        description: "Open your AoE2HDBets profile.",
        url: "/profile",
        icons: [{ src: "/icons/icon-192x192.png", sizes: "192x192" }],
      },
    ],
  };
}
