import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildFounderPayoutIdentity } from "../lib/founderPayoutIdentity.ts";

test("Founder payout identity is stable for retries and distinct for stackable bonuses", () => {
  const first = buildFounderPayoutIdentity({
    founderBonusId: 501,
    claimGroupKey: "founder:501:left",
    claimKind: "founders_bonus",
  });
  const retry = buildFounderPayoutIdentity({
    founderBonusId: 501,
    claimGroupKey: "founder:501:left",
    claimKind: "founders_bonus",
  });
  const stacked = buildFounderPayoutIdentity({
    founderBonusId: 502,
    claimGroupKey: "founder:502:left",
    claimKind: "founders_bonus",
  });
  const otherTarget = buildFounderPayoutIdentity({
    founderBonusId: 501,
    claimGroupKey: "founder:501:right",
    claimKind: "founders_bonus",
  });

  assert.deepEqual(retry, first);
  assert.notEqual(stacked.requestId, first.requestId);
  assert.notEqual(stacked.memo, first.memo);
  assert.notEqual(otherTarget.requestId, first.requestId);
  assert.notEqual(otherTarget.memo, first.memo);
  assert.ok(first.requestId.length <= 128);
  assert.ok(first.memo.length <= 180);
});

test("automatic Founder settlement locks, recovers, and records under one transaction", async () => {
  const source = await readFile("lib/betFounderBonuses.ts", "utf8");
  const lockIndex = source.indexOf("await withFounderPayoutTargetLock(");
  const recoveryIndex = source.indexOf("findConfirmedWoloPayoutByMemo({", lockIndex);
  const executionIndex = source.indexOf("executeFounderWoloPayout({", recoveryIndex);
  const ledgerIndex = source.indexOf("createPendingWoloClaim(tx,", executionIndex);

  assert.ok(lockIndex >= 0);
  assert.ok(recoveryIndex > lockIndex);
  assert.ok(executionIndex > recoveryIndex);
  assert.ok(ledgerIndex > executionIndex);
  assert.match(source, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(source, /requestId:\s*payoutIdentity\.requestId/);
  assert.match(source, /memo:\s*payoutIdentity\.memo/);
});

test("admin Founder retries use the same identity and hold the lock through claim finalization", async () => {
  const source = await readFile("lib/adminWoloClaims.ts", "utf8");
  const identityIndex = source.indexOf("const payoutIdentity = buildFounderPayoutIdentity({");
  const lockIndex = source.indexOf("return await withFounderPayoutTargetLock(", identityIndex);
  const recoveryIndex = source.indexOf("findConfirmedWoloPayoutByMemo({", lockIndex);
  const executionIndex = source.indexOf("payout = await executeFounderWoloPayout({", recoveryIndex);
  const ledgerIndex = source.indexOf("tx.pendingWoloClaim.updateMany({", executionIndex);

  assert.ok(identityIndex >= 0);
  assert.ok(lockIndex > identityIndex);
  assert.ok(recoveryIndex > lockIndex);
  assert.ok(executionIndex > recoveryIndex);
  assert.ok(ledgerIndex > executionIndex);
  assert.match(source, /requestId:\s*payoutIdentity\.requestId/);
  assert.match(source, /memo:\s*payoutIdentity\.memo/);
});
