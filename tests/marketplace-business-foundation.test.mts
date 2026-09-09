import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const marketPage = fs.readFileSync("app/market/page.tsx", "utf8");
const expansion = fs.readFileSync(
  "components/market/MarketplaceExpansionStreets.tsx",
  "utf8"
);
const shops = fs.readFileSync("lib/marketplaceShops.ts", "utf8");
const interior = fs.readFileSync(
  "app/market/shops/[slug]/page.tsx",
  "utf8"
);

test("the sacred Marketplace composition remains byte-identical", () => {
  const sha = crypto.createHash("sha256").update(marketPage).digest("hex");
  assert.equal(
    sha,
    "d4be74f966cdd5f9e283e7cb6d6b726962907f8fce7636c5fdb0bfd07fc421ba"
  );
});

test("founding economy uses the single audited 100-WOLO Jim proposal", () => {
  assert.match(shops, /MARKETPLACE_STANDARD_CHARTER_WOLO = 100/);
  assert.match(shops, /sourceProposalEventId: 49185/);
  assert.match(shops, /sourceMessageId: 3670/);
  assert.match(
    shops,
    /EF4CB5EBAE05EA0710679455A482A9CE082C6D43134CA94F57B16758C0F99D6A/
  );
  assert.match(shops, /u_0df73bdbb64646c19e4a9bfd225b3285/);
});

test("second street receives exactly the three founding businesses", () => {
  assert.match(shops, /name: "Onager Repair"/);
  assert.match(shops, /name: "The AoE2WAR Chronicle"/);
  assert.match(shops, /name: "The Workshop"/);
  assert.match(shops, /href: "\/forum"/);
  assert.match(shops, /href: "\/workshop"/);
  assert.match(shops, /href: "\/market\/shops\/onager-repair"/);
});

test("a hidden business projects back to the existing vacant-awning presentation", () => {
  assert.match(shops, /return shop\?\.displayEnabled \? shop : null/);
  assert.match(expansion, /if \(shop\) \{/);
  assert.match(expansion, /Empty awning/);
  assert.match(expansion, /Your craft belongs here\./);
});

test("Jim's awning has a separate deep interior and shopkeeper counter", () => {
  assert.match(interior, /onager-repair/);
  assert.match(interior, /Talk to Jim/);
  assert.match(interior, /Back to the Marketplace/);
  assert.ok(fs.existsSync("public/market/shops/onager-repair.png"));
});
