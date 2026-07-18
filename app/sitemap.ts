import type { MetadataRoute } from "next";

const SITE_URL = "https://aoe2war.com";

const PUBLIC_ROUTES = [
  "/",
  "/academy",
  "/ai",
  "/battle-archive",
  "/bets",
  "/betting-mechanics",
  "/bounties",
  "/challenge",
  "/champions",
  "/clans",
  "/download",
  "/forum",
  "/game-stats",
  "/kingdom",
  "/leaderboard",
  "/leaderboard/og",
  "/live-games",
  "/lobby",
  "/market",
  "/national-champions",
  "/players",
  "/radio",
  "/replay-parser",
  "/requests",
  "/rivalries",
  "/staking",
  "/statistics",
  "/traffic",
  "/war-chest",
  "/watch",
  "/wolo",
  "/wolochain",
  "/wolomania",
  "/workshop",
  "/zodiac",
] as const;

const PRIORITY_BY_ROUTE = new Map<string, number>([
  ["/", 1],
  ["/bets", 0.9],
  ["/champions", 0.9],
  ["/game-stats", 0.9],
  ["/leaderboard", 0.9],
  ["/players", 0.9],
  ["/rivalries", 0.9],
  ["/watch", 0.9],
]);

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_URL}${route === "/" ? "" : route}`,
    changeFrequency: route === "/" ? "hourly" : "daily",
    priority: PRIORITY_BY_ROUTE.get(route) ?? 0.7,
  }));
}
