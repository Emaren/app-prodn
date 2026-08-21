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

export type LivingKingdomRealmId = (typeof LIVING_KINGDOM_REALMS)[number]["id"];

const REALM_IDS = new Set<string>(LIVING_KINGDOM_REALMS.map((realm) => realm.id));
const REALM_BY_ID = new Map<LivingKingdomRealmId, (typeof LIVING_KINGDOM_REALMS)[number]>(
  LIVING_KINGDOM_REALMS.map((realm) => [realm.id, realm]),
);

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

export function isLivingKingdomRealmId(value: unknown): value is LivingKingdomRealmId {
  return typeof value === "string" && REALM_IDS.has(value);
}

export function livingKingdomRealmHref(realmId: LivingKingdomRealmId) {
  return REALM_BY_ID.get(realmId)?.href ?? "/";
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

  for (const [prefix, realmId] of PREFIX_REALMS) {
    if (pathMatchesPrefix(normalized, prefix)) return realmId;
  }

  if (COMMUNITY_PATH_PREFIXES.some((prefix) => pathMatchesPrefix(normalized, prefix))) {
    return "community";
  }

  return null;
}
