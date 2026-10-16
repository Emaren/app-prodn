import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { hasSufficientBoundPayoutSources } from "../lib/woloPayoutSenderEvidence.ts";

const sender = "wolo1" + "a".repeat(38);
const foreign = "wolo1" + "b".repeat(38);
const recipient = "wolo1" + "c".repeat(38);
const amountUwolo = "123000000";
const needed = () => [{ fromAddress: sender, toAddress: recipient, amountUwolo }];
const observed = () => [{ fromAddress: sender, toAddress: recipient, amountUwolo }];

test("one exact signer/recipient/amount match is covered", () => {
  assert.equal(hasSufficientBoundPayoutSources(needed(), observed()), true);
});
test("foreign sender matching the same recipient and amount is not payout proof", () => {
  assert.equal(hasSufficientBoundPayoutSources(needed(),
    [{ ...observed()[0], fromAddress: foreign }]), false);
});
test("two obligations cannot reuse one sender-matched bank MsgSend", () => {
  assert.equal(hasSufficientBoundPayoutSources([...needed(), ...needed()], observed()), false);
  assert.equal(hasSufficientBoundPayoutSources([...needed(), ...needed()],
    [...observed(), ...observed()]), true);
  assert.equal(hasSufficientBoundPayoutSources([...needed(), ...needed()],
    [...observed(), { ...observed()[0], fromAddress: foreign }]), false);
});
test("recipient and amount remain exact alongside signer source", () => {
  assert.equal(hasSufficientBoundPayoutSources(needed(),
    [{ ...observed()[0], toAddress: foreign }]), false);
  assert.equal(hasSufficientBoundPayoutSources(needed(),
    [{ ...observed()[0], amountUwolo: "123000001" }]), false);
  assert.equal(hasSufficientBoundPayoutSources([{ ...needed()[0], fromAddress: "" }], observed()), false);
});
test("missing historical signer explicitly remains unmeasured, not a claimed origin match", () => {
  assert.equal(hasSufficientBoundPayoutSources([{ ...needed()[0], fromAddress: null }], []), true);
  // This helper is necessary evidence checking for sources *when supplied*.
  // It cannot confer signer trust or verify legacy records when source is null.
});

test("all known escrow settlement paths now bind their chain proof to configured escrow role", () => {
  const bets = readFileSync(new URL("../lib/bets.ts", import.meta.url), "utf8");
  const backfill = readFileSync(new URL("../scripts/audit-backfill-jims-rule.mts", import.meta.url), "utf8");
  const guard = readFileSync(new URL("../lib/woloClaimPayoutGuards.ts", import.meta.url), "utf8");
  assert.match(bets, /toAddress: plan\.walletAddress,\s*amountWolo: plan\.amountWolo,\s*expectedFromAddress: getWoloBetEscrowRuntime\(\)\.escrowAddress \?\? ""/);
  assert.match(bets, /toAddress: walletAddress,\s*amountWolo: adjustment\.amountStillOwedWolo,\s*expectedFromAddress: getWoloBetEscrowRuntime\(\)\.escrowAddress \?\? ""/);
  assert.match(backfill, /toAddress: row\.walletAddress,\s*amountWolo: row\.owedWolo,\s*expectedFromAddress: getWoloBetEscrowRuntime\(\)\.escrowAddress \?\? ""/);
  assert.match(guard, /hasSufficientBoundPayoutSources\(/);
  assert.match(guard, /PAYOUT_SENDER_MISMATCH/);
  assert.match(guard, /INVALID_EXPECTED_PAYOUT_SENDER/);
  assert.doesNotMatch(guard, /expectedFromAddress\s*:\s*WOLO_MAINNET_PAYOUT_WALLET/);
});
