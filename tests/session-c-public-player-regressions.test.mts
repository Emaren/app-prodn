import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Frozen from archived legacy main's original complete menu; source routes
// added later may coexist, but the inherited relative order cannot vanish.
const ORIGINAL_KINGDOM_ROUTES = [
  "/profile",
  "/wallet",
  "/wolo",
  "/staking",
  "/bets",
  "/kingdom-bettors",
  "/kingdom",
  "/kingdom-index",
  "/kingdom-brain",
  "/kingdom-progress",
  "/renaissance",
  "/kingdom-sensors",
  "/kingdom-tests",
  "/kingdom-recovery",
  "/kingdom-systems",
  "/replay-laboratory",
  "/wolo-machine",
  "/round-chamber",
  "/kingdom-forge",
  "/oracle",
  "/clans",
  "/watch",
  "/television-wolo",
  "/bounties",
  "/ai",
  "/kingdom-agents",
  "/radio",
  "/admin/user-list",
  "/admin/kingdom-bettors",
  "/live-games",
  "/players",
  "/requests",
  "/contact-emaren",
  "/champions",
  "/national-champions",
  "/forum",
  "/rivalries",
  "/upload",
  "/game-stats",
  "/traffic",
  "/statistics",
  "/submit",
  "/download"
];

function source(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

function menuItems(sourceText) {
  const start = sourceText.indexOf("const menuEntries = useMemo<MenuEntry[]>(");
  const end = sourceText.indexOf("[liveGamesCount, requestCount]", start);
  if (start < 0 || end <= start) return [];
  const block = sourceText.slice(start, end);
  return Array.from(
    block.matchAll(/href:\s*"(\/[^"]+)"[\s\S]{0,170}?label:\s*"([^"]+)"/g),
    (match) => ({ href: match[1], label: match[2] }),
  );
}

function assertFullKingdomMenu(items) {
  assert.ok(items.length >= ORIGINAL_KINGDOM_ROUTES.length,
    "short-menu regression: missing original Kingdom routes");
  const urls = items.map((item) => item.href);
  assert.equal(new Set(urls).size, urls.length, "duplicate Kingdom route");
  let index = 0;
  for (const expected of ORIGINAL_KINGDOM_ROUTES) {
    const found = urls.indexOf(expected, index);
    assert.ok(found >= index,
      "original Kingdom route missing or reordered: " + expected);
    index = found + 1;
  }
}

test("full legacy Kingdom dropdown survives on the current R25 mainline, in order", () => {
  const items = menuItems(source("components/HeaderMenu.tsx"));
  assertFullKingdomMenu(items);
  assert.equal(items.length, 48, "original 43 routes, four R25 routes and the new Traders link");
  const all = items.map((item) => item.href);
  assert.equal(all.indexOf("/kingdom-traders"), all.indexOf("/kingdom") + 1,
    "Traders must follow Kingdom without reordering historical routes");
  assert.deepEqual(items.slice(0, 4).map((item) => item.href),
    ["/profile", "/wallet", "/wolo", "/staking"]);
});

test("menu regression guard catches four-link replacement and reordered original routes", () => {
  const full = menuItems(source("components/HeaderMenu.tsx"));
  assert.throws(() => assertFullKingdomMenu(full.slice(0, 4)), /short-menu/);
  const reordered = full.map((item) => ({ ...item }));
  const a = reordered.findIndex((item) => item.href === "/bets");
  const b = reordered.findIndex((item) => item.href === "/kingdom");
  [reordered[a], reordered[b]] = [reordered[b], reordered[a]];
  assert.throws(() => assertFullKingdomMenu(reordered), /missing or reordered/);
});

test("both responsive menu sections render the complete filtered route collection", () => {
  const menu = source("components/HeaderMenu.tsx");
  assert.match(menu, /visibleEntries\s*=\s*menuEntries\.filter\(\(entry\) => !entry\.adminOnly \|\| isAdmin\)/);
  assert.match(menu, /primaryEntries\s*=\s*visibleEntries\.filter\(\(entry\) => entry\.featured\)/);
  assert.match(menu, /secondaryEntries\s*=\s*visibleEntries\.filter\(\(entry\) => !entry\.featured\)/);
  assert.match(menu, /primaryEntries\.map\(\(entry\)/);
  assert.match(menu, /secondaryEntries\.map\(\(entry\)/);
  assert.match(menu, /overflow-y-auto/);
  assert.match(menu, /aria-expanded=\{menuOpen\}/);
  assert.match(menu, /aria-label="Account menu"/);
  assert.match(menu, /return \(\s*<div className="flex min-w-0">[\s\S]*SteamLoginButton/);
});

test("private admin entries stay admin-only while public core links remain public", () => {
  const menu = source("components/HeaderMenu.tsx");
  for (const path of [
    "/admin/user-list", "/admin/aoe2war-os#navigation-atlas",
    "/admin/central-command/job-board", "/admin/central-command/lanes",
  ]) {
    const offset = menu.indexOf('href: "' + path + '"');
    assert.ok(offset >= 0, "missing admin route " + path);
    assert.match(menu.slice(offset, offset + 170), /adminOnly: true/);
  }
  for (const path of ["/players", "/traffic", "/kingdom", "/watch"]) {
    const offset = menu.indexOf('href: "' + path + '"');
    assert.ok(offset >= 0, "missing public route " + path);
    assert.doesNotMatch(menu.slice(offset, offset + 112), /adminOnly: true/);
  }
});

test("featured cards are randomized on each dynamic SSR request, but hydration is stable", () => {
  for (const page of ["app/page.tsx", "app/lobby/page.tsx"]) {
    const content = source(page);
    assert.match(content, /export const dynamic = "force-dynamic"/);
    assert.match(content, /randomInt\(0, 0x1_0000_0000\)/);
  }
  const home = source("app/HomePageClient.tsx");
  assert.match(home, /createOpeningWarriorRandom\(openingSeed\)/);
  assert.match(home, /shuffleFeaturedWarriors\(realAvatarPool, random\)/);
  assert.match(home, /curatedFeaturedWarriorOpening\(pool, true, openingSeed\)/);
  assert.doesNotMatch(home, /curatedFeaturedWarriorOpening\(pool, false\)/);
});

test("managed avatar GET sends actual original or sidecar image bytes, not a fake success", () => {
  const route = source("app/api/media-assets/[kind]/[target]/route.ts");
  const assets = source("lib/managedMediaAssets.ts");
  assert.match(route, /export async function GET\(/);
  assert.match(route, /new NextResponse\(hit\.data,[\s\S]*"X-AoE2WAR-Media-Proxy": "direct-managed"/);
  assert.match(route, /await fs\.readFile\(filePath\)/);
  assert.match(route, /await serveManagedUploadDirect\(/);
  assert.match(route, /markFallbackMedia\(/);
  assert.match(assets, /select: \{ url: true \}/);
  assert.doesNotMatch(assets, /select: \{ url: true, uploadedByUid:/);
});

test("profile appearance GET/POST and page-change GET/POST match their browser callers", () => {
  const appearance = source("app/api/user/appearance/route.ts");
  const client = source("lib/userAppearanceClient.ts");
  const notices = source("app/api/page-change-notices/route.ts");
  const shell = source("app/AppShell.tsx");
  for (const route of [appearance, notices]) {
    assert.match(route, /export async function GET\(/);
    assert.match(route, /export async function POST\(/);
    assert.match(route, /getSessionUid\(/);
  }
  assert.match(client, /fetch\("\/api\/user\/appearance", \{ cache: "no-store" \}\)/);
  assert.match(client, /fetch\("\/api\/user\/appearance", \{[\s\S]*method: "POST"/);
  assert.match(shell, /fetch\("\/api\/page-change-notices", \{/);
  assert.match(shell, /fetch\("\/api\/page-change-notices", \{[\s\S]*method: "POST"/);
});

test("bet-board GET remains read-only and financial denial remains an explicit HOLD", () => {
  const route = source("app/api/bets/route.ts");
  const lobby = source("components/lobby/WatchAndChatHero.tsx");
  assert.match(route, /export async function GET\(/);
  assert.match(lobby, /fetch\("\/api\/bets", \{ cache: "no-store" \}\)/);
  assert.match(route, /isRestrictedBetsReadDenied\(error\)/);
  assert.match(route, /status: 503/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)\(/);
});

test("source assertions do not constitute live response/identity proof", () => {
  // These source checks prevent code-level regressions, not stale or
  // mismatched HEL1 installs. B must test logged-in admin and ordinary
  // browser calls, THREE real managed image bytes and raw HTTP status.
  const parity = source("scripts/r25_public_avatar_parity.py");
  assert.match(parity, /if len\(legacy\) < 3/);
  assert.match(parity, /if any\(x\.proxy != "direct-managed" for x in candidate\)/);
  assert.match(parity, /old\.sha256 != new\.sha256/);
  assert.match(parity, /"accepts_as_full_site_release": False/);
});


// Separate from HeaderMenu's 47-item ACCOUNT dropdown: the top 🏰 castle
// door renders the ORIGINAL 39-link Kingdom navigation from AppShell.
// The source in preserved legacy main is the historical order authority.
const ORIGINAL_CASTLE_ROUTES = [
  "/kingdom",
  "/oracle",
  "/leaderboard",
  "/champions",
  "/kingdom-bettors",
  "/chaosium",
  "/olympia",
  "/leagues",
  "/tournaments",
  "/national-champions",
  "/clans",
  "/academy",
  "/library",
  "/market",
  "/ai",
  "/kingdom-intelligence",
  "/kingdom-brain",
  "/kingdom-progress",
  "/renaissance",
  "/kingdom-systems",
  "/replay-laboratory",
  "/wolo-machine",
  "/kingdom-index",
  "/aoe2war-os",
  "/television-wolo",
  "/kingdom-agents",
  "/kingdom-treasury",
  "/bounties",
  "/forum",
  "/radio",
  "/workshop",
  "/game-stats",
  "/hd-replay-engine",
  "/traffic",
  "/kingdom-forge",
  "/round-chamber",
  "/statistics",
  "/general-inspections",
  "/speed"
];

function castleSourceRoutes(sourceText) {
  const start = sourceText.indexOf("const KINGDOM_LINKS = [");
  const end = sourceText.indexOf("] as const;", start);
  if (start < 0 || end <= start) return [];
  return Array.from(
    sourceText.slice(start, end).matchAll(/href:\s*"(\/[^"]+)"/g),
    (match) => match[1],
  );
}

function assertOriginalCastleRoutes(actual) {
  assert.ok(actual.length >= ORIGINAL_CASTLE_ROUTES.length,
    "shortened castle navigation: original 39 links lost");
  assert.equal(actual.length, new Set(actual).size,
    "duplicate castle navigation route");
  let offset = 0;
  for (const expected of ORIGINAL_CASTLE_ROUTES) {
    const found = actual.indexOf(expected, offset);
    assert.ok(found >= offset,
      "original castle navigation route missing or reordered: " + expected);
    offset = found + 1;
  }
}

test("castle-icon Kingdom menu retains original 39 links in exact historical order", () => {
  const shell = source("app/AppShell.tsx");
  const links = castleSourceRoutes(shell);
  assertOriginalCastleRoutes(links);
  assert.equal(links.length, 39, "canonical castle menu should be full, not four links");
  assert.deepEqual(links.slice(0, 4),
    ["/kingdom", "/oracle", "/leaderboard", "/champions"]);
});

test("castle menu negative guard rejects a four-link replacement or silent reordering", () => {
  const full = castleSourceRoutes(source("app/AppShell.tsx"));
  assert.throws(() => assertOriginalCastleRoutes(full.slice(0, 4)), /shortened castle/);
  const changed = [...full];
  [changed[2], changed[3]] = [changed[3], changed[2]];
  assert.throws(() => assertOriginalCastleRoutes(changed), /missing or reordered/);
});

test("desktop hover, touch click and mobile castle panels use the SAME full list", () => {
  const shell = source("app/AppShell.tsx");
  assert.match(shell, /function KingdomNavItem\(/);
  assert.match(shell, /onMouseEnter=\{openMenu\}/);
  assert.match(shell, /window\.matchMedia\("\(hover: none\)"\)/);
  assert.match(shell, /aria-expanded=\{open\}/);
  assert.match(shell, /data-presence-door="kingdom"/);
  assert.match(shell, /role="menu"/);
  assert.match(shell, /role="menuitem"/);
  assert.equal((shell.match(/<KingdomMenuPanel/g) ?? []).length, 2);
  assert.equal((shell.match(/KINGDOM_LINKS\.map\(\(item\)/g) ?? []).length, 1);
  assert.match(shell, /overflow-y-auto overscroll-contain touch-pan-y/);
  assert.match(shell, /createPortal\(/);
  assert.match(shell, /setOpen\(false\)/);
  assert.doesNotMatch(shell, /KINGDOM_LINKS\.slice\(/);
});
