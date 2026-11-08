import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const profile = read("components/players/PlayerProfilePage.tsx");
const rivalry = read("components/rivalries/BasicRivalriesView.tsx");
const leftRight = read("app/matchups/[left]/[right]/page.tsx");
const team = read("app/matchups/team/[left]/[right]/page.tsx");
const admin = read("components/admin/command-tower/AdminUserCard.tsx");
const playerStats = read("lib/playerProfile.ts");
const publicDirectory = read("lib/publicPlayerDirectory.ts");

test("public player Wolo display source combines unaccepted gifts into pending ledger, not verified payouts", () => {
  assert.match(playerStats, /const pendingGiftRows = visibleGiftRows\.filter\(\(gift\) => gift\.status === "pending"\)/);
  assert.match(playerStats, /pendingClaimWolo: pendingClaims\.reduce\([\s\S]*?\+ pendingGiftWolo,/);
  assert.match(publicDirectory, /pendingWoloClaimAmount: withClaims\.pendingWoloClaimAmount \+ pendingGift\.amount/);
  assert.match(publicDirectory, /pendingWoloClaimCount: withClaims\.pendingWoloClaimCount \+ pendingGift\.count/);
});

test("hero tiles never advertise mixed unverified ledger as Claimable WOLO", () => {
  assert.equal((profile.match(/Pending WOLO \(unverified\)/g) || []).length, 2);
  assert.doesNotMatch(profile, /Claimable WOLO/);
  assert.equal((profile.match(/WOLO pending review/g) || []).length, 2);
  assert.doesNotMatch(profile, /WOLO unclaimed/);
});

test("replay-built player explicitly warns pending recorded obligations are neither verified payouts nor wallet money", () => {
  assert.match(profile, /pending claims or gifts for this replay-built warrior page/);
  assert.match(profile, /This is not a verified payout or available wallet balance\./);
});

test("player WOLO rail labels claims plus pending gifts accurately and preserves all amount expressions", () => {
  assert.match(profile, /<MiniStat label="Pending Claims \+ Gifts" value=\{formatWolo\(profile\.wolo\.pendingClaimWolo\)\}/);
  assert.match(profile, /<MiniStat label="Claimed Claims" value=\{formatWolo\(profile\.wolo\.claimedClaimWolo\)\}/);
  assert.match(profile, /formatWolo\(profile\.wolo\.pendingClaimWolo > 0 \? profile\.wolo\.pendingClaimWolo : profile\.wolo\.totalFlexWolo\)/);
});

test("rivalry cards cannot mislabel mixed public directory values as spendable", () => {
  assert.equal((rivalry.match(/WOLO pending review/g) || []).length, 2);
  assert.doesNotMatch(rivalry, /WOLO unclaimed/);
});

test("single matchups show only pending-review terminology", () => {
  assert.equal((leftRight.match(/WOLO pending review/g) || []).length, 2);
  assert.doesNotMatch(leftRight, /WOLO unclaimed/);
});

test("team matchups show only pending-review terminology", () => {
  assert.equal((team.match(/WOLO pending review/g) || []).length, 1);
  assert.doesNotMatch(team, /WOLO unclaimed/);
});

test("admin player panel does not suggest pending history was paid or immediately claimable", () => {
  assert.match(admin, /WOLO pending review/);
  assert.doesNotMatch(admin, /WOLO unclaimed/);
});

test("honor gift status remains separate from amount and public presentation", () => {
  const honors = read("lib/communityHonors.ts");
  assert.match(honors, /if \(!includePending && \(status !== "accepted" \|\| !gift\.displayOnProfile\)\)/);
  assert.match(honors, /normalizedKind === "WOLO" && amount && status === "accepted"/);
  assert.match(profile, /profile\.wolo\.pendingClaimCount > 0/);
});

test("all revised public surfaces remain presentation-only", () => {
  const paths = [
    "components/players/PlayerProfilePage.tsx",
    "components/rivalries/BasicRivalriesView.tsx",
    "app/matchups/[left]/[right]/page.tsx",
    "app/matchups/team/[left]/[right]/page.tsx",
    "components/admin/command-tower/AdminUserCard.tsx",
  ];
  for (const path of paths) {
    const source = read(path);
    assert.doesNotMatch(source, /Pending WOLO \(unverified\)[\s\S]{0,80}onClick=\{/);
  }
});
