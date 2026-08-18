import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const market = fs.readFileSync("app/market/page.tsx", "utf8");
const registry = fs.readFileSync("lib/marketplaceKingdomBusinesses.ts", "utf8");
const streets = fs.readFileSync(
  "components/market/MarketplaceExpansionStreets.tsx",
  "utf8"
);
const interior = fs.readFileSync("app/market/kingdom/[slug]/page.tsx", "utf8");
const migration = fs.readFileSync(
  "prisma/migrations/20260818073500_marketplace_fifth_sixth_streets/migration.sql",
  "utf8"
);

test("sacred Marketplace page remains byte-identical", () => {
  const sha = crypto.createHash("sha256").update(market).digest("hex");
  assert.equal(
    sha,
    "d4be74f966cdd5f9e283e7cb6d6b726962907f8fce7636c5fdb0bfd07fc421ba"
  );
});

test("5th Street is Oracle, Radio WOLO, and Statistics Tent", () => {
  assert.match(registry, /slug: "oracle-tent"[\s\S]*streetKey: "fifth-street"[\s\S]*slot: 1/);
  assert.match(registry, /slug: "radio-wolo"[\s\S]*streetKey: "fifth-street"[\s\S]*slot: 2/);
  assert.match(registry, /slug: "statistics-tent"[\s\S]*streetKey: "fifth-street"[\s\S]*slot: 3/);
});

test("6th Street is AI Tent, Champion's Belt Forge, and Wager House", () => {
  assert.match(registry, /slug: "ai-tent"[\s\S]*streetKey: "sixth-street"[\s\S]*slot: 1/);
  assert.match(registry, /slug: "champions-belt-forge"[\s\S]*streetKey: "sixth-street"[\s\S]*slot: 2/);
  assert.match(registry, /slug: "wager-house"[\s\S]*streetKey: "sixth-street"[\s\S]*slot: 3/);
  assert.match(registry, /destinationHref: "\/bets"/);
});

test("Bank Tent connects staking and Kingdom Forge", () => {
  assert.match(registry, /slug: "bank-tent"[\s\S]*destinationHref: "\/staking"/);
  assert.match(registry, /slug: "bank-tent"[\s\S]*secondaryHref: "\/kingdom-forge"/);
  assert.match(interior, /secondaryHref/);
});

test("future service tents do not fake unbuilt rails", () => {
  for (const phrase of [
    "Oracle reading rail · next activation",
    "Music + ad request rail · next activation",
    "Statistics package rail · next activation",
    "Purpose forming · awning reserved",
    "Belt commission rail · next activation",
  ]) {
    assert.ok(registry.includes(phrase));
  }
  assert.match(interior, /Service counter forming/);
});

test("5th and 6th Street join the same road-sign chain", () => {
  assert.match(streets, /FIFTH_STREET_AWNINGS/);
  assert.match(streets, /SIXTH_STREET_AWNINGS/);
  assert.match(streets, /id: "fifth-street"/);
  assert.match(streets, /id: "sixth-street"/);
  assert.match(streets, /StreetDivider street=\{fourthStreet\} nextStreet=\{fifthStreet\}/);
  assert.match(streets, /StreetDivider street=\{fifthStreet\} nextStreet=\{sixthStreet\}/);
  assert.match(streets, /StreetDivider street=\{sixthStreet\} final/);
  assert.match(streets, /Six streets of a larger world/);
});

test("all six new shops use the standard 100-WOLO founding charter", () => {
  const rows = migration.match(/TRUE, 'active', 100, 'kingdom_founding'/g) ?? [];
  assert.equal(rows.length, 6);
});
