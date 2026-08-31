// Next loads this configuration through CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
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

const IS_RELEASE_BUILD =
  process.env.NEXT_DIST_DIR === ".next-release";

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

  // The production release sandbox is a 4 GiB cgroup. Keep expensive
  // validation fail-closed, but run it sequentially in prebuild instead of
  // overlapping Next's lint/type workers with the compiled application graph.
  // The explicit Webpack worker is required because this project has a custom
  // webpack() hook; Next otherwise may not enable its memory-saving worker.
  experimental: {
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
    ...(IS_RELEASE_BUILD ? { cpus: 2 } : {}),
  },
  eslint: {
    ignoreDuringBuilds: IS_RELEASE_BUILD,
  },
  typescript: {
    ignoreBuildErrors: IS_RELEASE_BUILD,
  },
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


  // Release staging deliberately discards .next-release/cache before
  // artifact hashing. Do not materialize Webpack's filesystem cache in the
  // isolated release worktree only to delete it immediately afterward.
  webpack(config) {
    if (process.env.NEXT_DIST_DIR === ".next-release") {
      config.cache = false;
    }

    return config;
  },

  async redirects() {
    return [
      {
        source: "/matchups",
        destination: "/rivalries",
        permanent: true,
      },
    ];
  },

  async headers() {
    const imageCacheHeader = {
      key: "Cache-Control",
      value: "public, max-age=86400, stale-while-revalidate=604800",
    };
    const publicMediaDirectories = [
      "academy",
      "brand",
      "featured-warriors",
      "icons",
      "kingdom",
      "legacy",
      "lobby",
      "market",
      "shorts",
      "social",
      "watcher",
      "workshop",
    ];
    const publicMediaExtensions =
      "avif|gif|ico|jpeg|jpg|mp4|png|svg|webm|webp";
    const explicitPublicMediaSources = [
      "/bets/betting_hall2.png",
      "/champions/:collection(belts|designations|payout-cards|players)/:path*.:ext(avif|gif|jpeg|jpg|png|svg|webp)",
      "/clans/:asset(mystikal-crest.webp|mystikal-wordmark.png|mystikal-wordmark-transparent.png)",
      "/oracle/:asset(oracle-hero-bg.png|oracle-hero-bg.webp)",
      "/watch/aoe2hd-screen.svg",
      "/watch/:collection(previews|recordings)/:path*.:ext(mp4|webm)",
    ];
    const publicMediaHeaders = [
      imageCacheHeader,
      {
        key: "X-AoE2WAR-Public-Cache",
        value: "AOE2WAR_PUBLIC_IMAGE_CACHE",
      },
    ];

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

      ...publicMediaDirectories.map((directory) => ({
        // Match only real media files. Directory roots and dynamic product
        // routes such as /bets/[marketId] or /watch/[sessionKey] must never
        // inherit static-asset cache semantics.
        source: `/${directory}/:path*.:ext(${publicMediaExtensions})`,
        headers: publicMediaHeaders,
      })),
      ...explicitPublicMediaSources.map((source) => ({
        source,
        headers: publicMediaHeaders,
      })),
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
