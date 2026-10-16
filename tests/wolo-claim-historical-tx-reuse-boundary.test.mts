import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const guard = readFileSync(new URL("../lib/woloClaimPayoutGuards.ts", import.meta.url), "utf8");

test("claimed historical tx hash is not reusable from a mutable present-day user wallet", () => {
  assert.match(guard, /status: "claimed"/);
  assert.match(guard, /payoutTxHash: \{ equals: txHash, mode: "insensitive" \}/);
  assert.match(guard, /incomingIds\.length > 0 \? \{ id: \{ notIn: incomingIds \} \} : \{\}/);
  assert.match(guard, /select: \{ id: true \}/);
  assert.match(guard, /hasUnboundHistoricalTxUse = existingRows\.length > 0/);
  assert.doesNotMatch(guard, /txHashVariants|txHash\.toLowerCase\(\)/);
  assert.match(guard, /code: "HISTORICAL_TX_REUSE_UNVERIFIED"/);
  assert.match(guard, /baseFailure \|\|\s*\(hasUnboundHistoricalTxUse/);
  assert.doesNotMatch(guard, /prisma\.user\.findMany\(/);
  assert.doesNotMatch(guard, /walletByUserId|ExistingClaimUse|missingExistingWalletCount/);
});

test("same fresh batch retains exact send allocation and known payout sender gate", () => {
  assert.match(guard, /const incomingKeys = txEntries/);
  assert.match(guard, /requiredByKey = countByKey\(incomingKeys\)/);
  assert.match(guard, /const anyPairOverAllocated/);
  assert.match(guard, /code: "DUPLICATE_TX_GUARD"/);
  assert.match(guard, /hasSufficientBoundPayoutSources\(/);
  assert.match(guard, /code: "PAYOUT_SENDER_MISMATCH"/);
  assert.match(guard, /existingClaimCount: existingRows\.length/);
});

test("founder retry still requires independent settlement, not profile wallet guessing", () => {
  const admin = readFileSync(new URL("../lib/adminWoloClaims.ts", import.meta.url), "utf8");
  assert.match(admin, /hasAmbiguousPriorWoloPayoutAttempt/);
  assert.match(admin, /validateDistinctClaimPayoutTx\(/);
  assert.match(guard, /Admin review|Independent settlement review|required/i);
  assert.doesNotMatch(guard, /updateMany\(|executeWoloPayout\(/);
});
