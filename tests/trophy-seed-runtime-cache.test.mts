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

test("trophy seed reconciliation is retained per Prisma client", () => {
  assert.match(
    service,
    /new WeakMap<PrismaClient, Promise<void>>\(\)/,
  );
  assert.match(
    service,
    /trophySeedEnsureByClient\.get\(prisma\)/,
  );
  assert.match(
    service,
    /trophySeedEnsureByClient\.set\(\s*prisma,\s*run,/s,
  );
  assert.match(
    service,
    /ensureTrophySeedDataFresh\(prisma\)/,
  );
});

test("failed seed reconciliation is evicted and remains retryable", () => {
  const ensureBlock = service.slice(
    service.indexOf(
      "export function ensureTrophySeedData",
    ),
    service.indexOf(
      "async function loadRatings",
    ),
  );

  assert.match(
    ensureBlock,
    /\.catch\(\(error\) =>/,
  );
  assert.match(
    ensureBlock,
    /trophySeedEnsureByClient\.delete\(prisma\)/,
  );
  assert.match(
    ensureBlock,
    /throw error/,
  );
});

test("public trophy reads preserve bootstrap safety without repeating reconciliation", () => {
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
    /await ensureTrophySeedData\(prisma\)/,
  );
  assert.match(
    publicLoader,
    /prisma\.trophy\.findMany/,
  );
});
