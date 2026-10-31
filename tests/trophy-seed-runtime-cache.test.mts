import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync(
  new URL(
    "../lib/trophies/service.ts",
    import.meta.url,
  ),
  "utf8",
);

test("public trophy readers carry no memoized economic writer state", () => {
  assert.doesNotMatch(service, /new WeakMap<PrismaClient, Promise<void>>\(\)/);
  assert.doesNotMatch(service, /publicTrophySeedEnsureByClient/);
  assert.doesNotMatch(service, /function ensurePublicTrophySeedData/);
});
test("public trophy reads never dispatch seed writes in preview or production", () => {
  const publicLoader = service.slice(
    service.indexOf("export async function loadPublicTrophies"),
    service.indexOf("export async function recordNationalityChange"),
  );
  assert.match(publicLoader, /prisma\.trophy\.findMany/);
  assert.doesNotMatch(publicLoader, /ensure(?:Public)?TrophySeedData\s*\(/);
  assert.doesNotMatch(publicLoader, /prisma\.trophy\.(?:create|upsert|update)\s*\(/);
});
test("RM ELO bootstrap uses all five canonical custody ids", () => {
  assert.match(service, /\.\.\.eloTitles\.map/);
  assert.match(service, /trophyId: definition\.id/);
  assert.match(service, /displayName: `RM \$\{definition\.displayName\}`/);
  assert.match(service, /status: "vacant"/);

  assert.doesNotMatch(service, /trophyId: "elite_champion_belt"/);
  assert.doesNotMatch(service, /trophyId: "veteran_champion_rm"/);
});

test("authenticated Trophy Command retains retryable canonical maintenance", () => {
  const admin = readFileSync(new URL("../app/api/admin/trophies/route.ts", import.meta.url), "utf8");
  assert.match(admin, /requireAdmin\(request\)/);
  assert.match(admin, /await ensureTrophySeedData\(gate\.prisma\)/);
  assert.match(service, /export async function ensureTrophySeedData\s*\(/);
  assert.doesNotMatch(service, /publicTrophySeedEnsureByClient/);
});
test("canonical operator seed ensure remains fully re-runnable", () => {
  const canonicalEnsure = service.slice(
    service.indexOf(
      "export async function ensureTrophySeedData",
    ),
    service.indexOf(
      "async function loadRatings",
    ),
  );

  assert.match(
    canonicalEnsure,
    /for \(const seed of SEEDS\)/,
  );
  assert.match(
    canonicalEnsure,
    /for \(const setting of DEFAULT_SETTINGS\)/,
  );
  assert.doesNotMatch(
    canonicalEnsure,
    /WeakMap/,
  );
});

test("public trophy readers project persisted rows without implicit economic writes", () => {
  const publicLoader = service.slice(
    service.indexOf("export async function loadPublicTrophies"),
    service.indexOf("export async function loadUserTrophyHoldings"),
  );
  assert.match(publicLoader, /prisma\.trophy\.findMany/);
  assert.match(publicLoader, /prisma\.trophy\.findUnique/);
  assert.doesNotMatch(publicLoader, /ensure(?:Public)?TrophySeedData\s*\(/);
});
const titleState = readFileSync(
  new URL("../lib/champions/titleState.ts", import.meta.url),
  "utf8",
);

test("champions overlaps trophy state with leaderboard and profile reads", () => {
  const loaderStart = titleState.indexOf(
    "export async function loadChampionTitleEconomyState",
  );
  const loaderEnd = titleState.indexOf(
    "export function getTitleState",
    loaderStart,
  );

  assert.ok(loaderStart >= 0);
  assert.ok(loaderEnd > loaderStart);

  const loader = titleState.slice(
    loaderStart,
    loaderEnd,
  );

  const trophyStart = loader.indexOf(
    "loadLiveChampionDefinitionMap(prisma)",
  );
  const leaderboardWait = loader.indexOf(
    "await loadLobbyLeaderboard",
  );
  const trophyWait = loader.indexOf(
    "await liveDefinitionPromise",
  );

  assert.ok(trophyStart >= 0);
  assert.ok(leaderboardWait > trophyStart);
  assert.ok(trophyWait > leaderboardWait);
});

test("champion trophy helper preserves the existing failure fallback", () => {
  const helperStart = titleState.indexOf(
    "async function loadLiveChampionDefinitionMap",
  );
  const helperEnd = titleState.indexOf(
    "export async function loadChampionTitleEconomyState",
    helperStart,
  );

  assert.ok(helperStart >= 0);
  assert.ok(helperEnd > helperStart);

  const helper = titleState.slice(
    helperStart,
    helperEnd,
  );

  assert.match(
    helper,
    /await loadPublicTrophies\(prisma\)/,
  );
  assert.match(
    helper,
    /Live Trophy registry unavailable; using title definitions/,
  );
  assert.match(
    helper,
    /return liveDefinitionMap/,
  );
});
