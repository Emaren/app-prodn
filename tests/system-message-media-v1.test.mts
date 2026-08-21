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

test("Media Armory owns explicit Clan invitation and business staging art slots", () => {
  const slots = read(
    "lib/systemMessageMedia.ts",
  );
  const studio = read(
    "components/admin/media/SystemMessageMediaStudio.tsx",
  );
  const page = read(
    "app/admin/media-assets/page.tsx",
  );

  assert.match(
    slots,
    /system-clan-invite-background/,
  );
  assert.match(
    slots,
    /business-\$\{slotToken\(shopSlug\)\}-hero/,
  );
  assert.match(
    slots,
    /business-\$\{slotToken\(shopSlug\)\}-sign/,
  );
  assert.match(
    studio,
    /Shared Clan Invitation Background/,
  );
  assert.match(
    studio,
    /Business authorization staging/,
  );
  assert.match(
    studio,
    /\/api\/admin\/media-assets/,
  );
  assert.match(
    page,
    /<SystemMessageMediaStudio \/>/,
  );
});

test("Clan invitation system card resolves shared hero plus current clan crest", () => {
  const contact = read(
    "components/contact/ContactInboxPanel.tsx",
  );

  assert.match(
    contact,
    /clanInviteBackgroundUrl\(\)/,
  );
  assert.match(
    contact,
    /clanInviteCrestUrl\(invite\.clanSlug\)/,
  );
  assert.match(
    contact,
    /You have chosen war\./,
  );
  assert.match(
    contact,
    />\s*Accept\s*</,
  );
  assert.match(
    contact,
    />\s*Enter Hall\s*</,
  );
});

test("Marketplace approval protocol carries shop slug for dynamic artwork", () => {
  const message = read(
    "lib/marketplaceInboxMessage.ts",
  );
  const owner = read(
    "lib/marketplaceOwnerControl.ts",
  );

  assert.match(
    message,
    /shopSlug\?: string \| null/,
  );
  assert.match(
    message,
    /Shop Slug:/,
  );
  assert.match(
    owner,
    /shopSlug: shop\.slug/,
  );
});

test("Business approval card and business interior resolve the same proposal-staged art", () => {
  const contact = read(
    "components/contact/ContactInboxPanel.tsx",
  );
  const shop = read(
    "components/market/MarketplaceShopClient.tsx",
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
    contact,
    /Kingdom Charter Granted/,
  );
  assert.match(
    shop,
    /marketplaceBusinessHeroUrl/,
  );
  assert.match(
    shop,
    /marketplaceBusinessSignUrl/,
  );
});

test("System-message media V1 requires no Prisma migration", () => {
  const slots = read(
    "lib/systemMessageMedia.ts",
  );
  const studio = read(
    "components/admin/media/SystemMessageMediaStudio.tsx",
  );

  assert.doesNotMatch(
    slots,
    /Prisma/,
  );
  assert.doesNotMatch(
    studio,
    /Prisma/,
  );
});
