export const LIVING_KINGDOM_REALMS = [
  { id: "home", href: "/", label: "Kingdom Gate" },
  { id: "lobby", href: "/lobby", label: "Lobby" },
  { id: "staking", href: "/staking", label: "Staking" },
  { id: "bets", href: "/bets", label: "Bets" },
  { id: "kingdom", href: "/kingdom", label: "Kingdom" },
  { id: "wolo", href: "/wolo", label: "WOLO" },
  { id: "market", href: "/market", label: "Market" },
  { id: "players", href: "/players", label: "Players" },
  { id: "clans", href: "/clans", label: "Clans" },
  { id: "watch", href: "/watch", label: "Watch" },
  { id: "game-stats", href: "/game-stats", label: "Game Stats" },
  { id: "leaderboard", href: "/leaderboard", label: "Leaderboard" },
  { id: "tournaments", href: "/tournaments/founders-cup", label: "Tournaments" },
  { id: "matchups", href: "/rivalries", label: "Matchups" },
  { id: "workshop", href: "/workshop", label: "Workshop" },
  { id: "traffic", href: "/traffic", label: "Traffic Observatory" },
  { id: "community", href: "/realm", label: "Realm" },
] as const;

export type LivingKingdomBaseRealmId = (typeof LIVING_KINGDOM_REALMS)[number]["id"];
export type LivingKingdomDetailRealmId = `page:${string}`;
export type LivingKingdomRealmId = LivingKingdomBaseRealmId | LivingKingdomDetailRealmId;

const REALM_IDS = new Set<string>(LIVING_KINGDOM_REALMS.map((realm) => realm.id));
const REALM_BY_ID = new Map<LivingKingdomBaseRealmId, (typeof LIVING_KINGDOM_REALMS)[number]>(
  LIVING_KINGDOM_REALMS.map((realm) => [realm.id, realm]),
);
const DETAIL_REALM_PREFIX = "page:";
const MAX_DETAIL_PATH_LENGTH = 220;

const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/connect-wallet",
  "/contact-emaren",
  "/offline",
  "/pending-bets",
  "/profile",
  "/settings",
  "/submit",
  "/upload",
  "/uploads",
  "/wallet",
] as const;

const PREFIX_REALMS: ReadonlyArray<readonly [string, LivingKingdomRealmId]> = [
  ["/lobby", "lobby"],
  ["/staking", "staking"],
  ["/bets", "bets"],
  ["/betting-mechanics", "bets"],
  ["/kingdom", "kingdom"],
  ["/kingdom-forge", "kingdom"],
  ["/war-chest", "kingdom"],
  ["/wolo", "wolo"],
  ["/wolochain", "wolo"],
  ["/market", "market"],
  ["/players", "players"],
  ["/users", "players"],
  ["/clans", "clans"],
  ["/watch", "watch"],
  ["/live-games", "watch"],
  ["/game-stats", "game-stats"],
  ["/replay-parser", "game-stats"],
  ["/statistics", "game-stats"],
  ["/leaderboard", "leaderboard"],
  ["/tournaments", "tournaments"],
  ["/matchups", "matchups"],
  ["/rivalries", "matchups"],
  ["/workshop", "workshop"],
  ["/traffic", "traffic"],
] as const;

const COMMUNITY_PATH_PREFIXES = [
  "/about",
  "/academy",
  "/ai",
  "/battle-archive",
  "/belts",
  "/bounties",
  "/challenge",
  "/champions",
  "/download",
  "/forum",
  "/national-champions",
  "/nations",
  "/oracle",
  "/radio",
  "/realm",
  "/requests",
  "/roadmap",
  "/round-chamber",
  "/speed",
  "/war-engine",
  "/wolomania",
  "/zodiac",
] as const;

// These are already-public page URLs where the detail segment materially
// changes what a visitor is viewing. The exact, normalized pathname is the
// room key; arbitrary paths never become rooms, and private/raw routes are
// rejected before this allowlist is consulted.
const PUBLIC_DETAIL_PATH_PATTERNS = [
  /^\/bets\/[^/]+$/,
  /^\/challenge\/[^/]+$/,
  /^\/champions\/[^/]+(?:\/[^/]+)*$/,
  /^\/clans\/[^/]+$/,
  /^\/forum\/thread\/[^/]+$/,
  /^\/game-stats\/[^/]+$/,
  /^\/leaderboard\/og$/,
  /^\/market\/(?:kingdom|shops)\/[^/]+$/,
  /^\/matchups\/(?:team\/)?[^/]+\/[^/]+$/,
  /^\/oracle\/[^/]+$/,
  /^\/players\/(?:by-name\/)?[^/]+$/,
  /^\/staking\/stakers\/[^/]+$/,
  /^\/tournaments\/[^/]+$/,
  /^\/watch\/[^/]+$/,
] as const;

function normalizePathname(pathname: string) {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || "/";
  let decoded = "";
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    return null;
  }
  if (
    /[\u0000-\u001f\u007f\\?#]/.test(decoded) ||
    /%[0-9a-f]{2}/i.test(decoded) ||
    decoded.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  const withLeadingSlash = decoded.startsWith("/") ? decoded : `/${decoded}`;
  const normalized = withLeadingSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return normalized || "/";
}

function pathMatchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function detailRealmForNormalizedPath(pathname: string): LivingKingdomDetailRealmId | null {
  if (
    pathname.length > MAX_DETAIL_PATH_LENGTH ||
    !PUBLIC_DETAIL_PATH_PATTERNS.some((pattern) => pattern.test(pathname))
  ) {
    return null;
  }
  return `${DETAIL_REALM_PREFIX}${pathname}`;
}

export function isLivingKingdomRealmId(value: unknown): value is LivingKingdomRealmId {
  if (typeof value !== "string") return false;
  if (REALM_IDS.has(value)) return true;
  if (!value.startsWith(DETAIL_REALM_PREFIX)) return false;
  const pathname = value.slice(DETAIL_REALM_PREFIX.length);
  const normalized = normalizePathname(pathname);
  return Boolean(normalized && detailRealmForNormalizedPath(normalized) === value);
}

export function livingKingdomRealmHref(realmId: LivingKingdomRealmId) {
  if (realmId.startsWith(DETAIL_REALM_PREFIX)) {
    const pathname = realmId.slice(DETAIL_REALM_PREFIX.length);
    const normalized = normalizePathname(pathname);
    if (normalized && detailRealmForNormalizedPath(normalized) === realmId) return normalized;
    return "/";
  }
  return REALM_IDS.has(realmId)
    ? REALM_BY_ID.get(realmId as LivingKingdomBaseRealmId)?.href ?? "/"
    : "/";
}

export function livingKingdomRealmForPath(pathname: string): LivingKingdomRealmId | null {
  const normalized = normalizePathname(pathname);
  if (!normalized) return null;
  if (normalized === "/") return "home";
  if (PRIVATE_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(normalized, prefix))) return null;
  if (pathMatchesPrefix(normalized, "/game-stats/live")) return null;
  if (/^\/game-stats\/[^/]+\/review(?:\/|$)/.test(normalized)) return null;
  if (pathMatchesPrefix(normalized, "/market/invoices")) return null;
  if (pathMatchesPrefix(normalized, "/bets/broadcast-previews")) return null;

  const detailRealm = detailRealmForNormalizedPath(normalized);
  if (detailRealm) return detailRealm;

  for (const [prefix, realmId] of PREFIX_REALMS) {
    if (pathMatchesPrefix(normalized, prefix)) return realmId;
  }

  if (COMMUNITY_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(normalized, prefix))) {
    return "community";
  }

  return null;
}
