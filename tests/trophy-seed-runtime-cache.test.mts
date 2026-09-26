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
