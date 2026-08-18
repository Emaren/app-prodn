import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const registry = fs.readFileSync("lib/marketplaceKingdomBusinesses.ts", "utf8");
const business = fs.readFileSync("lib/marketplaceBusiness.ts", "utf8");
const page = fs.readFileSync("app/market/kingdom/[slug]/page.tsx", "utf8");
const migration = fs.readFileSync(
  "prisma/migrations/20260818071000_marketplace_founding_streets/migration.sql",
  "utf8"
);

test("the first four Marketplace streets are fully occupied after Jim opens", () => {
  for (const slug of ["chat-effects","clan-insignias","tournament-tent","bank-tent","kingdom-forge-tent","bounty-hall"]) {
    assert.match(registry, new RegExp(`slug: "${slug}"`));
    assert.match(migration, new RegExp(`'${slug}'`));
  }
  assert.match(registry, /streetKey: "third-street",\s*slot: 1/);
  assert.match(registry, /streetKey: "third-street",\s*slot: 2/);
  assert.match(registry, /streetKey: "third-street",\s*slot: 3/);
  assert.match(registry, /streetKey: "fourth-street",\s*slot: 1/);
  assert.match(registry, /streetKey: "fourth-street",\s*slot: 2/);
  assert.match(registry, /streetKey: "fourth-street",\s*slot: 3/);
});

test("all new Kingdom awnings have real interiors and service destinations", () => {
  assert.match(page, /getMarketplaceKingdomBusiness/);
  assert.match(page, /destinationHref/);
  assert.match(page, /destinationLabel/);
  assert.match(business, /MARKETPLACE_KINGDOM_BUSINESSES\.map/);
});

test("Chat Effects advertises the 10-WOLO concept without pretending the payment rail is already live", () => {
  assert.match(registry, /Effects start at 10 WOLO/);
  assert.match(registry, /10-WOLO effect purchase rail is deliberately held/);
});

test("new Kingdom storefront charters keep the standardized 100-WOLO founding unit", () => {
  assert.equal((migration.match(/'kingdom_founding'/g) ?? []).length, 6);
  assert.equal((migration.match(/TRUE, 'active', 100, 'kingdom_founding'/g) ?? []).length, 6);
});
