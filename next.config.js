const fs = require("fs");
const path = require("path");

const BUILD_VERSION_FILE = path.join(
  __dirname,
  ".aoe2war-build-version"
);

const AOE2WAR_BUILD_VERSION = fs.existsSync(
  BUILD_VERSION_FILE
)
  ? fs.readFileSync(BUILD_VERSION_FILE, "utf8").trim()
  : "development";

// next.config.js
//
// Goal: NEVER bake api-prodn into the browser bundle.
// We force the *public* API base to SAME-ORIGIN (".") so client fetches become "./api/..."
// (truthy, so it also defeats any `|| "https://api-prodn..."` fallbacks in your code).
//
// Rewrites are a safety net for cases where you hit Next directly (3030) without nginx.
// In prod, nginx should route all `aoe2war.com/*` traffic to Next.
// Only routes without local handlers are rewritten from Next -> backend upstream.

const UPSTREAM_API = (process.env.AOE2_BACKEND_UPSTREAM ?? "http://127.0.0.1:3330").replace(/\/$/, "");

module.exports = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,
  // Production can build into .next-release while the live process keeps
  // serving .next, then swap directories during a sub-second restart window.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  env: {
    // ✅ Public/browser base (truthy same-origin)
    BACKEND_API: ".",
    NEXT_PUBLIC_API_BASE_URL: ".",

    NEXT_PUBLIC_CHAIN_REST: process.env.NEXT_PUBLIC_CHAIN_REST ?? "",

    // Unique identity generated before every production build.
    NEXT_PUBLIC_AOE2WAR_BUILD_VERSION:
      AOE2WAR_BUILD_VERSION,
  },


  async headers() {
    const imageCacheHeader = {
      key: "Cache-Control",
      value: "public, max-age=86400, stale-while-revalidate=604800",
    };

    return [
      {
        source: "/uploads/managed-assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
          {
            key: "X-AoE2WAR-Public-Cache",
            value: "AOE2WAR_MANAGED_UPLOAD_CACHE",
          },
        ],
      },
      {
        source: "/watch-loops/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
          {
            key: "X-AoE2WAR-Public-Cache",
            value: "AOE2WAR_WATCH_LOOP_CACHE",
          },
        ],
      },

      {
        source: "/brand/:path*",
        headers: [imageCacheHeader, { key: "X-AoE2WAR-Public-Cache", value: "AOE2WAR_PUBLIC_IMAGE_CACHE" }],
      },
      {
        source: "/champions/:path*",
        headers: [imageCacheHeader, { key: "X-AoE2WAR-Public-Cache", value: "AOE2WAR_PUBLIC_IMAGE_CACHE" }],
      },
      {
        source: "/icons/:path*",
        headers: [imageCacheHeader, { key: "X-AoE2WAR-Public-Cache", value: "AOE2WAR_PUBLIC_IMAGE_CACHE" }],
      },
      {
        source: "/legacy/:path*",
        headers: [imageCacheHeader, { key: "X-AoE2WAR-Public-Cache", value: "AOE2WAR_PUBLIC_IMAGE_CACHE" }],
      },
      {
        source: "/lobby/:path*",
        headers: [imageCacheHeader, { key: "X-AoE2WAR-Public-Cache", value: "AOE2WAR_PUBLIC_IMAGE_CACHE" }],
      },
      {
        source: "/watcher/:path*",
        headers: [imageCacheHeader, { key: "X-AoE2WAR-Public-Cache", value: "AOE2WAR_PUBLIC_IMAGE_CACHE" }],
      },
    ];
  },

  async rewrites() {
    return [
      { source: "/api/chain-id", destination: `${UPSTREAM_API}/api/chain-id` },
      { source: "/api/parse_replay", destination: `${UPSTREAM_API}/api/parse_replay` },
      { source: "/api/health", destination: `${UPSTREAM_API}/api/health` },
    ];
  },
};
