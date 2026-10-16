import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import nodeTest from "node:test";

// The central test inventory uses Node's compact dot reporter, which reports
// failing *files* but suppresses individual assertion details. Emit only a
// failed local check name and the assertion message for actionable CI evidence.
const test = (name: string, check: () => void) => nodeTest(name, () => {
  try { check(); }
  catch (error) {
    process.stderr.write("SIGNER_PROVENANCE_TEST_FAILED: " + name + " — " +
      (error instanceof Error ? error.message : String(error)) + "\n");
    throw error;
  }
});
import { requireObservedWoloPayoutSender } from "../lib/woloPayoutSignerIdentity.ts";
import { hasSufficientBoundPayoutSources } from "../lib/woloPayoutSenderEvidence.ts";

const payer = "wolo1zygwt232ymc4h2g52yvkntffhmd5alx2kglw7p";
const unrelated = "wolo1tg04m57e52evgzjkn9ruwwkz626pfv9qfv27wy";
const recipient = "wolo10zspyrrphzctrpysh6l9dsqj4wcwmj3tk660sz";

test("mainnet payout identity is mandatory and normalized before broadcast", () => {
  assert.equal(requireObservedWoloPayoutSender(" "+payer.toUpperCase()+" ", true), payer);
  for (const addr of [undefined, null, "", "wolo1", "a".repeat(42), "wolo1"+"o".repeat(38)]) {
    assert.throws(() => requireObservedWoloPayoutSender(addr, true), /WOLO_MAINNET_PAYOUT_SENDER_UNVERIFIED/);
  }
  assert.equal(requireObservedWoloPayoutSender(null, false), null);
});

test("sender-bound mainnet proof rejects right recipient/amount paid from foreign signer", () => {
  const amountUwolo = "5000000";
  const obligation = [{ fromAddress: payer, toAddress: recipient, amountUwolo }];
  assert.equal(hasSufficientBoundPayoutSources(obligation, [
    { fromAddress: unrelated, toAddress: recipient, amountUwolo },
  ]), false);
  assert.equal(hasSufficientBoundPayoutSources(obligation, [
    { fromAddress: payer, toAddress: recipient, amountUwolo },
  ]), true);
});

test("service payout paths observe signer from private health before payout POST", () => {
  const code = readFileSync(new URL("../lib/woloBetSettlement.ts", import.meta.url), "utf8");
  assert.match(code, /expectedSenderAddress: string \| null/);
  for (const begin of [
    "async function executeWoloPayoutViaSettlementService(",
    "async function executeWoloPayoutViaNamedSettlementService(",
  ]) {
    const first = code.indexOf(begin);
    const next = code.indexOf("\nasync function ", first + begin.length);
    const part = code.slice(first, next === -1 ? undefined : next);
    assert.ok(first !== -1);
    const signer = part.indexOf("requireObservedWoloPayoutSender(health?.payoutAddress, isWoloMainnet())");
    const broadcast = part.indexOf("/settlement/v1/payouts");
    assert.ok(signer >= 0 && broadcast > signer, begin + " must fail before broadcasting");
    assert.match(part, /expectedSenderAddress,/);
  }
  const localStart = code.indexOf("export async function executeWoloPayout(");
  assert.ok(localStart >= 0);
  const local = code.slice(localStart);
  const localSigner = local.indexOf("requireObservedWoloPayoutSender(account.address, isWoloMainnet())");
  const localSend = local.indexOf("client.sendTokens(");
  assert.ok(localSigner >= 0 && localSend > localSigner);
});

test("both admin Claim WOLO completion branches demand the observed signer", () => {
  const code = readFileSync(new URL("../lib/adminWoloClaims.ts", import.meta.url), "utf8");
  assert.equal(code.split('expectedFromAddress: payout.expectedSenderAddress ?? (isWoloMainnet() ? "" : null)').length - 1, 2);
  assert.equal(code.split("validateDistinctClaimPayoutTx(").length - 1, 2);
  assert.match(code, /executeFounderWoloPayout/);
  assert.match(code, /executeWoloPayout/);
  assert.match(code, /expectedSenderAddress: expectedEscrowAddress/);
  assert.match(code, /execution\.signerRole !== "escrow"/);
  assert.match(code, /execution\.signerAddress\.trim\(\)\.toLowerCase\(\) !== expectedEscrowAddress/);
  assert.match(code, /expectedSenderAddress: null as string \| null/);
  assert.match(code, /expectedSenderAddress\?: string \| null/);

});

test("financial source verifier preserves distinct MsgSend allocations and does not infer sender", () => {
  const code = readFileSync(new URL("../lib/woloClaimPayoutGuards.ts", import.meta.url), "utf8");
  assert.match(code, /hasSufficientBoundPayoutSources/);
  assert.match(code, /PAYOUT_SENDER_MISMATCH/);
  assert.match(code, /INVALID_EXPECTED_PAYOUT_SENDER/);
  // A read-only query WHERE status="claimed" is necessary for collision
  // detection. Reject mutations/broadcasts instead of banning that text.
  assert.match(code, /pendingWoloClaim\\.findMany\\(/);
  assert.doesNotMatch(code, /pendingWoloClaim\\.(?:update|updateMany|create|delete|upsert)\\s*\\(|signAndBroadcast\\s*\\(/);
});
