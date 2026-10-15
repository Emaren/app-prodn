import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const helper = readFileSync(new URL("../lib/pendingWoloClaims.ts", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/user/wolo-claims/claim/route.ts", import.meta.url), "utf8");
const admin = readFileSync(new URL("../lib/adminWoloClaims.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../app/profile/page.tsx", import.meta.url), "utf8");

test("a profile Claim WOLO button must never mark an unpaid claim paid", () => {
  const start = helper.indexOf("export async function claimPendingWoloClaimsForUser(");
  const end = helper.indexOf("export async function rescindPendingWoloClaim(", start);
  assert.ok(start >= 0 && end > start);
  const body = helper.slice(start, end);
  assert.match(body, /status: "pending"/);
  assert.match(body, /claimedByUserId: user\.id/);
  assert.match(body, /claimedByUserId: null/);
  assert.match(body, /requiresSettlement: rows\.length > 0/);
  assert.match(body, /take: 1/);
  assert.doesNotMatch(body, /pendingWoloClaim\.(update|updateMany|upsert|create|delete)/);
  assert.doesNotMatch(body, /status: "claimed"|claimedAt: new Date\(\)/);
});

test("profile claim route keeps authenticated identity, refuses settlement without proof and never broadcasts", () => {
  assert.match(route, /getSessionUid\(request\)/);
  assert.match(route, /!sessionUid/);
  assert.match(route, /findUnique\(/);
  assert.match(route, /result\.requiresSettlement/);
  assert.match(route, /code: "CHAIN_SETTLEMENT_REQUIRED"/);
  assert.match(route, /status: 409/);
  assert.match(route, /nothing has been marked paid or deducted/i);
  assert.doesNotMatch(route, /status: "claimed"|payoutTxHash:|executeWoloPayout|executeFounderWoloPayout|updateMany\(/);
  assert.doesNotMatch(route, /recordUserActivity\(/);
});

test("verified payout custody stays on protected server settlement path", () => {
  assert.match(admin, /validateDistinctClaimPayoutTx\(/);
  assert.match(admin, /hasAmbiguousPriorWoloPayoutAttempt/);
  assert.match(admin, /payoutTxHash: payout\.txHash/);
  assert.match(admin, /status: "claimed"/);
  assert.match(profile, /\/api\/user\/wolo-claims\/claim/);
  assert.match(profile, /payload\?\.detail \|\| "WOLO claim failed\."/);
});

test("old historical claim-creation and rescission evidence gates are intact", () => {
  const marketCreate = helper.slice(
    helper.indexOf("export async function createPendingWoloClaim("),
    helper.indexOf("export async function claimPendingWoloClaimsForUser("),
  );
  assert.match(marketCreate, /payoutAttemptedAt: null/);
  assert.match(marketCreate, /payoutTxHash: null/);
  assert.match(helper.slice(helper.indexOf("export async function rescindPendingWoloClaim(")), /status: "pending"/);
});
