import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(path, "utf8");
}

const directory = read("app/clans/page.tsx");
const hall = read("components/clans/ClanHallClient.tsx");
const css = read("app/clans/clans-warhouse.css");
const purchase = read("app/api/clans/purchase/route.ts");
const purchaseUi = read(
  "components/clans/ClanHallPurchase.tsx",
);
const displayRail = read(
  "components/clans/ClanDisplayRail.tsx",
);
const admin = read("app/admin/clans/page.tsx");
const adminApi = read("app/api/admin/clans/route.ts");
const crestApi = read(
  "app/api/user/clan-crests/route.ts",
);
const media = read("lib/managedMediaAssets.ts");
const seed = read(
  "scripts/seed-clans-2026-08-06.mts",
);
const profile = read("app/profile/page.tsx");
const inbox = read(
  "components/contact/ContactInboxPanel.tsx",
);

test("directory shows three houses and the paid fourth tile", () => {
  assert.doesNotMatch(directory, />\s*Clan halls\s*</);
  assert.doesNotMatch(
    directory,
    /Find your banner, enter the hall/,
  );
  assert.match(directory, /Raise a banner/);
  assert.match(directory, /Found your house/);
  assert.match(
    directory,
    /Claim ground · Rally your own/,
  );
  assert.match(
    directory,
    /Buy a Clan Hall · 100 WOLO/,
  );
  assert.match(directory, /ClanHallPurchase/);
});

test("founding seed carries Mystikal, Jim and Legend", () => {
  assert.match(seed, /slug: "mystikal"/);
  assert.match(seed, /slug: "jims-clan"/);
  assert.match(seed, /name: "Jim's Clan"/);
  assert.match(seed, /slug: "legend-clan"/);
  assert.match(seed, /LeGenD_Sultan/);
});

test("Clan Hall purchase proves exactly 100 WOLO", () => {
  assert.match(
    purchase,
    /CLAN_HALL_PRICE_WOLO = 100/,
  );
  assert.match(
    purchase,
    /woloIndexedTransfer\.findFirst/,
  );
  assert.match(
    purchase,
    /amountUwolo:/,
  );
  assert.match(
    purchase,
    /memo: existing\.sponsorMemo/,
  );
  assert.match(
    purchaseUi,
    /Buy a Clan Hall · \{amountWolo\} WOLO/,
  );
});

test("admin can accept Clan Alerts, assign managers and crests", () => {
  assert.match(admin, /Verified Clan Alerts/);
  assert.match(
    admin,
    /Accept payment &amp; found hall/,
  );
  assert.match(admin, /Upload clan crests/);
  assert.match(
    admin,
    /Appoint clan administration/,
  );
  assert.match(
    adminApi,
    /action === "accept_request"/,
  );
  assert.match(
    adminApi,
    /action === "set_manager"/,
  );
});

test("clan admins can choose assigned crests from profile", () => {
  assert.match(
    crestApi,
    /Only a clan owner or clan admin/,
  );
  assert.match(
    crestApi,
    /saveManagedMediaReference/,
  );
  assert.match(
    profile,
    /ClanCrestManager/,
  );
});

test("managed media includes a dedicated crest kind", () => {
  assert.match(
    media,
    /MANAGED_MEDIA_KINDS = \[[^\]]*"crest"[^\]]*\] as const/,
  );
});

test("Clan Alerts are distinct in Emaren's inbox", () => {
  assert.match(inbox, /Clan Alert/);
  assert.match(inbox, /Open Clan Command/);
});

test("clan surfaces default to AoE2WAR blue with opt-in crimson", () => {
  assert.match(css, /CLAN DISPLAY THEMES/);
  assert.match(css, /Default: canonical AoE2WAR blue/);
  assert.match(css, /data-clan-theme="crimson"/);
  assert.match(css, /--clan-accent: 56 189 248/);
  assert.match(css, /--clan-accent-deep: 127 29 29/);
  assert.match(displayRail, /aoe2war:clans:theme/);
  assert.match(displayRail, /Palette/);
  assert.match(displayRail, /ClanViewToggle/);
  assert.match(directory, /<ClanDisplayRail view=\{view\} basePath="\/clans" \/>/);
  assert.match(hall, /<ClanDisplayRail/);
  assert.doesNotMatch(directory, /import ClanViewToggle/);
  assert.doesNotMatch(hall, /import ClanViewToggle/);
  assert.doesNotMatch(hall, /violet-/);
  assert.doesNotMatch(directory, /violet-/);
});
