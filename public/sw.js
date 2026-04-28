const SHELL_CACHE = "aoe2hdbets-shell-v1";
const RUNTIME_CACHE = "aoe2hdbets-runtime-v1";

const SHELL_URLS = [
  "/app",
  "/app?source=pwa",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const NETWORK_FIRST_PATHS = new Set([
  "/app",
  "/profile",
  "/challenge",
  "/live-games",
  "/bets",
  "/wolo",
  "/api/user/me",
  "/api/challenges",
  "/api/live-games",
  "/api/bets",
  "/api/user/wolo-transactions",
]);

const BLOCKED_PREFIXES = [
  "/api/auth/",
  "/api/admin/",
  "/api/wolo/faucet/claim",
  "/api/user/wolo-claims/claim",
  "/api/bets/wager",
  "/api/bets/stake-intents",
  "/api/settlement",
  "/api/challenges/",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isBlockedPath(pathname) {
  return BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json"
  );
}

async function cacheResponse(cacheName, request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(RUNTIME_CACHE);

  try {
    const response = await fetch(request);
    await cacheResponse(RUNTIME_CACHE, request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    const shell = await caches.open(SHELL_CACHE);
    const shellCached = (await shell.match(request)) || (await shell.match(new URL(request.url).pathname));
    if (shellCached) return shellCached;

    if (fallbackUrl) {
      const fallback = await shell.match(fallbackUrl);
      if (fallback) return fallback;
    }

    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  await cacheResponse(SHELL_CACHE, request, response.clone());
  return response;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || !isSameOrigin(url) || isBlockedPath(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/offline"));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (NETWORK_FIRST_PATHS.has(url.pathname)) {
    event.respondWith(networkFirst(request));
  }
});
