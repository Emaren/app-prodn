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

test("public trophy seed reconciliation is retained per Prisma client", () => {
  assert.match(
    service,
    /new WeakMap<PrismaClient, Promise<void>>\(\)/,
  );
  assert.match(
    service,
    /publicTrophySeedEnsureByClient\.get\(prisma\)/,
  );
  assert.match(
    service,
    /publicTrophySeedEnsureByClient\.set\(\s*prisma,\s*run,/s,
  );
  assert.match(
    service,
    /ensureTrophySeedData\(prisma\)/,
  );
});

test("read-only production preview skips trophy seed writes", () => {
  const publicEnsureBlock = service.slice(
    service.indexOf(
      "function ensurePublicTrophySeedData",
    ),
    service.indexOf(
      "async function loadRatings",
    ),
  );

  assert.match(
    publicEnsureBlock,
    /AOE2WAR_PROD_DB_PREVIEW === "true"/,
  );
  assert.match(
    publicEnsureBlock,
    /return Promise\.resolve\(\)/,
  );
});

test("Elite bootstrap seed is vacant with no inherited Guardian", () => {
  const eliteStart = service.indexOf(
    'trophyId: "elite_champion_belt"',
  );
  const eliteEnd = service.indexOf(
    "},",
    eliteStart,
  );

  assert.ok(eliteStart >= 0);
  assert.ok(eliteEnd > eliteStart);

  const eliteSeed = service.slice(
    eliteStart,
    eliteEnd,
  );

  assert.match(eliteSeed, /status: "vacant"/);
  assert.doesNotMatch(eliteSeed, /guardianName/);
  assert.doesNotMatch(eliteSeed, /guardian_held/);
});

test("failed public seed reconciliation is evicted and remains retryable", () => {
  const publicEnsureBlock = service.slice(
    service.indexOf(
      "function ensurePublicTrophySeedData",
    ),
    service.indexOf(
      "async function loadRatings",
    ),
  );

  assert.match(
    publicEnsureBlock,
    /\.catch\(\(error\) =>/,
  );
  assert.match(
    publicEnsureBlock,
    /publicTrophySeedEnsureByClient\.delete\(prisma\)/,
  );
  assert.match(
    publicEnsureBlock,
    /throw error/,
  );
});

test("canonical operator seed ensure remains fully re-runnable", () => {
  const canonicalEnsure = service.slice(
    service.indexOf(
      "export async function ensureTrophySeedData",
    ),
    service.indexOf(
      "const publicTrophySeedEnsureByClient",
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

test("public trophy reads use the retained bootstrap wrapper", () => {
  const publicLoader = service.slice(
    service.indexOf(
      "export async function loadPublicTrophies",
    ),
    service.indexOf(
      "export async function loadUserTrophyHoldings",
    ),
  );

  assert.match(
    publicLoader,
    /await ensurePublicTrophySeedData\(prisma\)/,
  );
  assert.match(
    publicLoader,
    /prisma\.trophy\.findMany/,
  );
  assert.doesNotMatch(
    publicLoader,
    /await ensureTrophySeedData\(prisma\)/,
  );
});

const titleState = readFileSync(
  new URL(
    "../lib/champions/titleState.ts",
    import.meta.url,
  ),
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
