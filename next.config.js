// next.config.js
//
// Goal: NEVER bake api-prodn into the browser bundle.
// We force the *public* API base to SAME-ORIGIN (".") so client fetches become "./api/..."
// (truthy, so it also defeats any `|| "https://api-prodn..."` fallbacks in your code).
//
// Rewrites are a safety net for cases where you hit Next directly (3030) without nginx.
// In prod, nginx should route all `aoe2hdbets.com/*` traffic to Next.
// Only routes without local handlers are rewritten from Next -> backend upstream.

const UPSTREAM_API = (process.env.AOE2_BACKEND_UPSTREAM ?? "http://127.0.0.1:3330").replace(/\/$/, "");

module.exports = {
  reactStrictMode: false,
  productionBrowserSourceMaps: false,

  env: {
    // ✅ Public/browser base (truthy same-origin)
    BACKEND_API: ".",
    NEXT_PUBLIC_API_BASE_URL: ".",

    NEXT_PUBLIC_CHAIN_REST: process.env.NEXT_PUBLIC_CHAIN_REST ?? "",
  },

  async rewrites() {
    return [
      { source: "/api/chain-id", destination: `${UPSTREAM_API}/api/chain-id` },
      { source: "/api/parse_replay", destination: `${UPSTREAM_API}/api/parse_replay` },
      { source: "/api/health", destination: `${UPSTREAM_API}/api/health` },
    ];
  },
};
