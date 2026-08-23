import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import {
  join,
} from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(
    join(root, path),
    "utf8",
  );
}

test("business artwork is staged against the proposal before authorization", () => {
  const slots = read(
    "lib/systemMessageMedia.ts",
  );
  const studio = read(
    "components/admin/media/SystemMessageMediaStudio.tsx",
  );

  assert.match(
    slots,
    /business-proposal-\$\{proposalEventId\}-hero/,
  );
  assert.match(
    slots,
    /business-proposal-\$\{proposalEventId\}-sign/,
  );
  assert.match(
    studio,
    /Business authorization staging/,
  );
  assert.match(
    studio,
    /Hero \+ sign locked · ready to authorize/,
  );
});

test("selecting an image previews it immediately before upload", () => {
  const studio = read(
    "components/admin/media/SystemMessageMediaStudio.tsx",
  );

  assert.match(
    studio,
    /URL\.createObjectURL\(file\)/,
  );
  assert.match(
    studio,
    /Local preview · upload to lock/,
  );
  assert.match(
    studio,
    /Upload &amp; lock art/,
  );
});

test("server approval is fail-closed until both staged assets are active", () => {
  const owner = read(
    "lib/marketplaceOwnerControl.ts",
  );

  assert.match(
    owner,
    /marketplaceBusinessProposalHeroTarget/,
  );
  assert.match(
    owner,
    /marketplaceBusinessProposalSignTarget/,
  );
  assert.match(
    owner,
    /Business authorization is locked until its hero image and business sign are both uploaded and active/,
  );
});

test("owner profile exposes readiness and disables approval before art lock", () => {
  const console = read(
    "components/market/MarketplaceOwnerConsole.tsx",
  );

  assert.match(
    console,
    /artHeroReady/,
  );
  assert.match(
    console,
    /artSignReady/,
  );
  assert.match(
    console,
    /!proposal\.artLocked/,
  );
  assert.match(
    console,
    /Stage artwork/,
  );
});

test("Media Armory can send invitation and business authorization previews to Direct Chat", () => {
  const studio = read(
    "components/admin/media/SystemMessageMediaStudio.tsx",
  );
  const route = read(
    "app/api/admin/media-assets/system-message-test/route.ts",
  );

  assert.match(
    studio,
    /Test Invitation/,
  );
  assert.match(
    studio,
    /Test Business Authorization/,
  );
  assert.match(
    route,
    /clan_invitation/,
  );
  assert.match(
    route,
    /business_authorization/,
  );
  assert.match(
    route,
    /targetUserId:[\s\S]*gate\.user\.id/,
  );
});

test("approved business card and interior resolve the same proposal-staged art", () => {
  const message = read(
    "lib/marketplaceInboxMessage.ts",
  );
  const contact = read(
    "components/contact/ContactInboxPanel.tsx",
  );
  const shop = read(
    "components/market/MarketplaceShopClient.tsx",
  );
  const page = read(
    "app/market/shops/[slug]/page.tsx",
  );

  assert.match(
    message,
    /proposalEventId\?: number \| null/,
  );
  assert.match(
    contact,
    /marketplaceBusinessProposalHeroUrl/,
  );
  assert.match(
    contact,
    /marketplaceBusinessProposalSignUrl/,
  );
  assert.match(
    shop,
    /sourceProposalEventId/,
  );
  assert.match(
    page,
    /sourceProposalEventId/,
  );
});

test("system-message staging V2 adds no Prisma migration", () => {
  const studio = read(
    "components/admin/media/SystemMessageMediaStudio.tsx",
  );
  const slots = read(
    "lib/systemMessageMedia.ts",
  );

  assert.doesNotMatch(
    studio,
    /prisma\/migrations/,
  );
  assert.doesNotMatch(
    slots,
    /prisma\/migrations/,
  );
});

test("shadow refresh mirrors Marketplace proposal and awning truth", () => {
  const launcher = read(
    "scripts/dev-shadow.py",
  );
  const engine = read(
    "scripts/aoe2_shadow.py",
  );

  assert.match(
    launcher,
    /refresh_shadow_v12/,
  );
  assert.match(
    engine,
    /BOUNDED_TABLE = "user_activity_events"/,
  );
  assert.match(
    engine,
    /"marketplace_shops"/,
  );
  assert.match(
    engine,
    /shadow_activity_event_limit/,
  );
});

test("authorization defaults the business ON and lands on the exact awning", () => {
  const owner = read(
    "lib/marketplaceOwnerControl.ts",
  );
  const contact = read(
    "components/contact/ContactInboxPanel.tsx",
  );
  const streets = read(
    "components/market/MarketplaceExpansionStreets.tsx",
  );

  assert.match(
    owner,
    /displayEnabled: true/,
  );
  assert.match(
    owner,
    /Congratulations, Citizen\./,
  );
  assert.match(
    owner,
    /The kingdom has approved your business\./,
  );
  assert.match(
    owner,
    /market-awning-\$\{shop\.streetKey\}-\$\{shop\.slot\}/,
  );
  assert.match(
    contact,
    /Open My Business/,
  );
  assert.match(
    contact,
    /Thank You, Your Grace/,
  );
  assert.doesNotMatch(
    contact,
    />\s*Start My Business\s*</,
  );
  assert.match(
    streets,
    /market-awning-\$\{street\.id\}-\$\{slot\}/,
  );
});

test("Marketplace has seventh-street capacity for the next business", () => {
  const owner = read(
    "lib/marketplaceOwnerControl.ts",
  );
  const streets = read(
    "components/market/MarketplaceExpansionStreets.tsx",
  );

  assert.match(
    owner,
    /"seventh-street"/,
  );
  assert.match(
    streets,
    /id: "seventh-street"/,
  );
  assert.match(
    streets,
    /label: "7th Street"/,
  );
});
