import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  buildMarketplaceInboxMessage,
  parseMarketplaceInboxMessage,
} from "../lib/marketplaceInboxMessage.ts";

const marketPage = fs.readFileSync("app/market/page.tsx", "utf8");
const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const migration = fs.readFileSync(
  "prisma/migrations/20260818043000_add_marketplace_business_v1/migration.sql",
  "utf8"
);
const expansion = fs.readFileSync(
  "components/market/MarketplaceExpansionStreets.tsx",
  "utf8"
);
const business = fs.readFileSync("lib/marketplaceBusiness.ts", "utf8");
const profile = fs.readFileSync("app/profile/page.tsx", "utf8");
const contact = fs.readFileSync(
  "components/contact/ContactInboxPanel.tsx",
  "utf8"
);
const inquiryComposer = fs.readFileSync(
  "components/market/MarketplaceInquiryComposer.tsx",
  "utf8"
);
const shopClient = fs.readFileSync(
  "components/market/MarketplaceShopClient.tsx",
  "utf8"
);
const businessCard = fs.readFileSync(
  "components/market/MarketplaceBusinessCard.tsx",
  "utf8"
);

test("the sacred Marketplace page remains byte-identical", () => {
  const sha = crypto.createHash("sha256").update(marketPage).digest("hex");
  assert.equal(
    sha,
    "d4be74f966cdd5f9e283e7cb6d6b726962907f8fce7636c5fdb0bfd07fc421ba"
  );
});

test("V1 creates the durable five-table business domain", () => {
  for (const model of [
    "MarketplaceShop",
    "MarketplaceInquiry",
    "MarketplaceInvoice",
    "MarketplacePayment",
    "MarketplaceTaxPayment",
  ]) {
    assert.match(schema, new RegExp(`model ${model} \\{`));
  }
  assert.match(schema, /displayEnabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /txHash\s+String\s+@unique\(map: "uq_marketplace_payments_tx_hash"\)/);
});

test("Jim is seeded from the sole verified proposal and defaults closed", () => {
  assert.match(migration, /u_0df73bdbb64646c19e4a9bfd225b3285/);
  assert.match(migration, /Onager Repair/);
  assert.match(
    migration,
    /EF4CB5EBAE05EA0710679455A482A9CE082C6D43134CA94F57B16758C0F99D6A/
  );
  assert.match(migration, /49185, 3670/);
  assert.match(migration, /'second-street', 1, FALSE/);
});

test("second street contains the two kingdom shops while Jim obeys his display toggle", () => {
  assert.match(migration, /aoe2war-chronicle/);
  assert.match(migration, /'second-street', 2, TRUE/);
  assert.match(migration, /'second-street', 3, TRUE/);
  assert.match(expansion, /loadPublicMarketplaceAwningListings/);
  assert.match(expansion, /Empty awning/);
  assert.match(expansion, /MarketplaceInquiryComposer/);
});

test("100 WOLO is the standard business unit and verified revenue snapshots 10 percent tax", () => {
  assert.match(business, /MARKETPLACE_STANDARD_WOLO = 100/);
  assert.match(business, /MARKETPLACE_BUSINESS_TAX_BPS = 1000/);
  assert.match(business, /marketplaceTaxAmount/);
  assert.match(business, /That WOLO payment proof has already been used/);
});

test("both normal and Extreme profiles mount the merchant control plane and chat renders Marketplace protocol cards", () => {
  const businessMounts = profile.match(/<MarketplaceBusinessCard \/>/g) ?? [];
  assert.equal(businessMounts.length, 2);
  assert.match(
    profile,
    /<AutoBetReserveCard \/>\s*<MarketplaceBusinessCard \/>\s*<MarketplaceOwnerConsole \/>\s*\{\/\* =+\s*THE ARMORY/
  );
  assert.match(contact, /parseMarketplaceInboxMessage/);
  assert.match(contact, /MarketplaceMessageCard/);
});

test("Marketplace protocol messages round-trip without becoming ordinary chat truth", () => {
  const body = buildMarketplaceInboxMessage({
    kind: "inquiry",
    shop: "Onager Repair",
    actor: "Customer",
    amountWolo: 100,
    recordId: "11111111-1111-1111-1111-111111111111",
    payment: "ABC123 · verified on WoloChain",
    requestText: "Repair my throwing arm.",
  });
  const parsed = parseMarketplaceInboxMessage(body);
  assert.ok(parsed);
  assert.equal(parsed.kind, "inquiry");
  assert.equal(parsed.shop, "Onager Repair");
  assert.equal(parsed.amountWolo, 100);
  assert.equal(parsed.requestText, "Repair my throwing arm.");
});


test("Marketplace V1 keeps awnings fixed-height, makes the paid counter primary, and removes free chat bypass", () => {
  assert.match(expansion, /h-\[22rem\]/);
  assert.match(inquiryComposer, /absolute inset-x-3 bottom-3 top-\[6\.65rem\]/);
  assert.match(inquiryComposer, /Open counter · 100 WOLO/);
  assert.match(shopClient, /Open counter · 100 WOLO/);
  assert.doesNotMatch(shopClient, /Talk to \{shop\.proprietorLabel\}/);
  assert.match(shopClient, /scroll-mt-24/);
  assert.match(businessCard, /Marketplace ON/);
  assert.match(businessCard, /2nd Street/);
});
