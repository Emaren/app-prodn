// next.config.js
const withPWA = require('next-pwa')({ dest: 'public', disable: true });

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8003';

module.exports = withPWA({
  reactStrictMode: false,
  eslint:     { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  productionBrowserSourceMaps: false,

  env: {
    BACKEND_API: API_BASE,
    NEXT_PUBLIC_CHAIN_REST: process.env.NEXT_PUBLIC_CHAIN_REST || '',
  },

  async rewrites() {
    return [
      // FastAPI routes (they *do* include /api/)
      { source: '/api/traffic',  destination: `${API_BASE}/api/traffic`  },
      { source: '/api/chain-id', destination: `${API_BASE}/api/chain-id` },

      // other backend endpoints
      { source: '/api/game_stats',         destination: `${API_BASE}/api/game_stats` },
      { source: '/api/admin/users',        destination: `${API_BASE}/api/admin/users` },
      { source: '/api/parse_replay',       destination: `${API_BASE}/api/parse_replay` },
      { source: '/api/user/:path*',        destination: `${API_BASE}/api/user/:path*` },
      { source: '/api/health',             destination: `${API_BASE}/api/health` },
    ];
  },
});
