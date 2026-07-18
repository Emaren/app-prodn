import type { MetadataRoute } from "next";

const SITE_URL = "https://aoe2war.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/connect-wallet",
        "/game-stats/*/review",
        "/game-stats/live/",
        "/profile",
        "/settings",
        "/upload",
        "/wallet",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
