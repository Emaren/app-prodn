import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const migration = fs.readFileSync(
  "prisma/migrations/20260818075000_marketplace_owner_approval_control/migration.sql",
  "utf8"
);
const ownerLib = fs.readFileSync("lib/marketplaceOwnerControl.ts", "utf8");
const ownerApi = fs.readFileSync("app/api/market/admin/route.ts", "utf8");
const ownerUi = fs.readFileSync(
  "components/market/MarketplaceOwnerConsole.tsx",
  "utf8"
);
const businessUi = fs.readFileSync(
  "components/market/MarketplaceBusinessCard.tsx",
  "utf8"
);
const inquiryUi = fs.readFileSync(
  "components/market/MarketplaceInquiryComposer.tsx",
  "utf8"
);
const profile = fs.readFileSync("app/profile/page.tsx", "utf8");
const inboxProtocol = fs.readFileSync("lib/marketplaceInboxMessage.ts", "utf8");
const contact = fs.readFileSync(
  "components/contact/ContactInboxPanel.tsx",
  "utf8"
);

test("paid proposal is distinct from Kingdom approval", () => {
  assert.match(schema, /approvedAt\s+DateTime\?/);
  assert.match(schema, /approvedByUserId\s+Int\?/);
  assert.match(schema, /approvalMessageId\s+Int\?/);
  assert.match(migration, /status" = 'pending_approval'/);
  assert.match(migration, /display_enabled" = FALSE/);
});

test("only the primary Marketplace owner can approve proposals", () => {
  assert.match(ownerLib, /requireMarketplaceKingdomOwner/);
  assert.match(ownerLib, /resolvePrimaryAdminContact/);
  assert.match(ownerLib, /viewer\.id !== keeper\.id/);
  assert.match(ownerApi, /action === "approve"/);
});

test("approval opens the storefront and sends the premium business-entry system card", () => {
  assert.match(ownerLib, /displayEnabled: true/);
  assert.match(ownerLib, /approvedAt: now/);
  assert.match(ownerLib, /Congratulations, Citizen\./);
  assert.match(ownerLib, /The kingdom has approved your business\./);
  assert.match(
    ownerLib,
    /\/market#market-awning-\$\{shop\.streetKey\}-\$\{shop\.slot\}/,
  );
  assert.match(inboxProtocol, /MARKETPLACE CHARTER APPROVED/);
  assert.match(contact, /Marketplace Charter Approved/);
  assert.match(contact, /Open My Business/);
  assert.match(contact, /Thank You, Your Grace/);
  assert.doesNotMatch(
    contact,
    />\s*Start My Business\s*</,
  );
});

test("merchant and Kingdom owner can edit storefront and artwork", () => {
  assert.match(businessUi, /Change business image/);
  assert.match(businessUi, /Business name/);
  assert.match(ownerUi, /Business master control/);
  assert.match(ownerUi, /Change image/);
  assert.match(ownerUi, /Marketplace ON/);
  assert.match(ownerApi, /action === "display"/);
  assert.match(ownerApi, /action === "details"/);
});

test("approval deep link nudges the proprietor once without permanent UI noise", () => {
  assert.match(businessUi, /marketplaceApproved/);
  assert.match(businessUi, /sessionStorage/);
  assert.match(businessUi, /setApprovalNudge\(true\)/);
  assert.match(businessUi, /2000/);
});

test("exterior counter opening is native and no longer hydration dependent", () => {
  assert.match(inquiryUi, /<details className="group">/);
  assert.match(inquiryUi, /<summary/);
  assert.match(inquiryUi, /Open counter · 100 WOLO/);
  assert.match(inquiryUi, /payWoloOnChain/);
});

test("owner console mounts in both profile layouts and self-gates by API", () => {
  const mounts = profile.match(/<MarketplaceOwnerConsole \/>/g) ?? [];
  assert.equal(mounts.length, 2);
  assert.match(ownerUi, /response\.status === 403/);
});
