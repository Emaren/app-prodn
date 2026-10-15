import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("rescind is an atomic compare-and-set on a never-attempted pending claim", async () => {
  const source = await readFile(new URL("../lib/pendingWoloClaims.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function rescindPendingWoloClaim(");
  const finish = source.indexOf("export async function loadPendingWoloClaimsForAdmin", start);
  assert.ok(start > 0 && finish > start);
  const body = source.slice(start, finish);
  assert.match(body, /prisma\.pendingWoloClaim\.update\(/);
  assert.match(body, /status: "pending"/);
  assert.match(body, /payoutAttemptedAt: null/);
  assert.match(body, /payoutTxHash: null/);
  assert.match(body, /status: "rescinded"/);
  assert.doesNotMatch(body, /updateMany\(/);
  assert.doesNotMatch(body, /payoutAttemptedAt: undefined/);
});

test("admin does not erase payout evidence when rescinding or retrying ambiguous claim", async () => {
  const route = await readFile(new URL("../app/api/admin/wolo-claims/[claimId]/route.ts", import.meta.url), "utf8");
  assert.match(route, /existingClaim\.payoutAttemptedAt !== null/);
  assert.match(route, /existingClaim\.payoutTxHash !== null/);
  assert.match(route, /error\.code === "P2025"/);
  assert.match(route, /case "ambiguous_prior_attempt":/);
  assert.match(route, /retryable: false/);
  assert.doesNotMatch(route, /payoutAttemptedAt: null/);
  assert.doesNotMatch(route, /RESCINDED_UNPAID_CLAIM_DETAIL/);
  assert.doesNotMatch(route, /prisma\.pendingWoloClaim\.update\(/);
});

test("background founder payout also rechecks the recorded attempt inside its lock", async () => {
  const source = await readFile(new URL("../lib/betFounderBonuses.ts", import.meta.url), "utf8");
  const start = source.indexOf("await withFounderPayoutTargetLock(");
  const select = source.indexOf("payoutAttemptedAt: true", start);
  const guard = source.indexOf('currentClaim.payoutAttemptedAt !== null', select);
  const request = source.indexOf("await executeFounderWoloPayout(", guard);
  assert.ok(start >= 0 && select > start && guard > select && request > guard);
  assert.match(source.slice(guard, request), /currentClaim\.payoutTxHash\?\.trim\(\)/);
});
