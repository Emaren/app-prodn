import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const ddl = read("config/nonfinancial-public-read-model-v1.sql");
const directory = read("lib/publicPlayerDirectory.ts");
const profile = read("lib/playerProfile.ts");
const existing = read("tests/nonfinancial-public-read-model.test.mts");
const audit = read("scripts/r25_c_start_root.py");

function sectionAfter(anchor: string, source: string, end: string) {
  const index = source.indexOf(anchor);
  assert.ok(index >= 0, "required source anchor missing: " + anchor);
  const tail = source.slice(index + anchor.length);
  const stop = tail.indexOf(end);
  assert.ok(stop >= 0, "required end anchor missing: " + end);
  return tail.slice(0, stop);
}

test("public pending WOLO sums are opt-in only at security-barrier view source", () => {
  const view = sectionAfter(
    "CREATE OR REPLACE VIEW aoe2war_public_v1.pending_player_gift_totals", ddl,
    "REVOKE ALL ON aoe2war_public_v1.pending_player_gift_totals",
  );
  assert.match(view, /WITH \(security_barrier=true\)/);
  assert.match(view, /FROM public\.user_gifts/);
  assert.match(view, /WHERE kind='WOLO' AND status='pending' AND amount>0\s+AND display_on_profile IS TRUE\s+GROUP BY user_id;/);
  assert.match(view, /SELECT user_id,COUNT\(\*\)::integer AS pending_count/);
  assert.match(view, /COALESCE\(SUM\(amount\),0\)::bigint AS pending_amount/);
  assert.doesNotMatch(view, /wallet|note|created_by|accepted_at|payout_tx_hash/i);
});

test("accepted honor projection preserves independent opt-in consent and narrow data", () => {
  const view = sectionAfter("CREATE OR REPLACE VIEW aoe2war_public_v1.player_gifts", ddl,
    "REVOKE ALL ON aoe2war_public_v1.player_gifts");
  assert.match(view, /WHERE g\.status='accepted' AND g\.display_on_profile IS TRUE;/);
  assert.match(view, /NULL::text AS note/);
  assert.doesNotMatch(view, /created_by_user_id|payout_tx_hash|wallet_address/);
});

test("restricted public role cannot select private base gifts or DML through the view", () => {
  assert.match(ddl, /REVOKE ALL ON aoe2war_public_v1\.pending_player_gift_totals FROM PUBLIC,aoe2war_web_prod;/);
  assert.match(ddl, /GRANT SELECT ON aoe2war_public_v1\.pending_player_gift_totals TO aoe2war_web_prod;/);
  assert.doesNotMatch(ddl, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON aoe2war_public_v1\.pending_player_gift_totals/);
  assert.doesNotMatch(ddl, /GRANT SELECT ON public\.user_gifts/);
});

test("public roster restricted path uses only a bounded projection instead of raw gift table", () => {
  const viewRead = sectionAfter('isNonfinancialPublicReadProfile()', directory, ')).map((row) => {');
  assert.match(viewRead, /FROM aoe2war_public_v1\.pending_player_gift_totals/);
  assert.doesNotMatch(viewRead, /FROM public\.user_gifts/);
  assert.match(viewRead, /WHERE user_id IN \(\$\{Prisma\.join\(claimedUserIds\)\}\)/);
});

test("legacy public roster fallback also requires opt-in, matching restricted view", () => {
  const fallback = sectionAfter(": (await prisma.userGift.groupBy({", directory, "_count: { _all: true }");
  assert.match(fallback, /kind: "WOLO"/);
  assert.match(fallback, /status: "pending"/);
  assert.match(fallback, /displayOnProfile: true/);
  assert.match(fallback, /amount: \{ gt: 0 \}/);
});

test("public player profile pending and accepted gift query requires opt-in", () => {
  const query = sectionAfter("profileGiftRows = await prisma.userGift.findMany({", profile, "select: {");
  assert.match(query, /userId: user\.id/);
  assert.match(query, /kind: "WOLO"/);
  assert.match(query, /status: \{ in: \["pending", "accepted"\] \}/);
  assert.match(query, /displayOnProfile: true/);
  assert.match(query, /amount: \{ gt: 0 \}/);
});

test("private pending gift cannot become public via aggregate count even if status is pending", () => {
  const sample = [
    { userId: 1, kind: "WOLO", amount: 100000, status: "pending", displayOnProfile: true },
    { userId: 1, kind: "WOLO", amount: 100, status: "pending", displayOnProfile: false },
    { userId: 1, kind: "WOLO", amount: 250, status: "accepted", displayOnProfile: true },
    { userId: 2, kind: "WOLO", amount: 75, status: "pending", displayOnProfile: false },
  ];
  const visible = sample.filter(row => row.kind === "WOLO" && row.status === "pending" &&
    row.amount > 0 && row.displayOnProfile === true);
  assert.equal(visible.length, 1);
  assert.equal(visible.reduce((sum,row)=>sum+row.amount,0), 100000);
  assert.equal(visible.some(row=>row.amount===100 || row.amount===75), false);
  // This synthetic illustration does not substitute for native PostgreSQL view proof.
});

test("private-by-default and false display flag never authorize an anonymous-looking amount", () => {
  const samples = [false, undefined, null, 0, "false"];
  assert.ok(samples.every(flag => flag !== true));
  assert.match(ddl, /display_on_profile IS TRUE/);
  assert.match(directory, /displayOnProfile: true/);
  assert.match(profile, /displayOnProfile: true/);
});

test("source change does not silently alter the existing C03 root physical SQL SHA pin", () => {
  assert.match(audit, /PROD_PUBLIC_READ_MODEL_SHA256 = "885cb0ed6992ff828a78b6b25f4ea3e76399ad967c48d2489843a0814386138d"/);
  // That older pin means production view DDL must be physically requalified by Session A.
  assert.match(audit, /PROD_PUBLIC_READ_MODEL_VIEWS = \(/);
  assert.match(existing, /public DDL is bounded to specific security-barrier views/);
});

test("view consent must not be a mere UI label fix", () => {
  const ui = read("components/players/PlayerProfilePage.tsx");
  assert.match(ui, /Pending WOLO \(unverified\)/);
  assert.match(ui, /Pending Claims \+ Gifts/);
  assert.doesNotMatch(ui, /Claimable WOLO/);
  assert.match(ddl, /AND display_on_profile IS TRUE\s+GROUP BY user_id;/);
});

test("no financial or secret authority added to source changes", () => {
  assert.doesNotMatch(ddl, /GRANT\s+(ALL|INSERT|UPDATE|DELETE)\b/i);
  for (const source of [directory, profile]) {
    assert.doesNotMatch(source, /PUBLIC_PENDING_GIFT_FINANCIAL_AUTHORIZED=true/);
  }
});
