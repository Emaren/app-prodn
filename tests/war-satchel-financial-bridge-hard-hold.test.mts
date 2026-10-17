import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SATCHEL_FINANCIAL_BRIDGE_READY,
  requireSatchelFinancialBridge,
  satchelFinancialBridgeReady,
} from "../lib/warSatchelFinancialBridgeHold.ts";
import { inspectCanonicalSatchelWithdrawal } from "../lib/warSatchelCanonicalWithdrawal.ts";
import { verifyCanonicalSatchelClaimReturn } from "../lib/warSatchelCanonicalClaimReturn.ts";

const source = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");
const HASH = "AB".repeat(32);
const vault = "wolo1" + "p".repeat(38);
const owner = "wolo1" + "q".repeat(38);
const escrow = "wolo1" + "v".repeat(38);
const withdrawalId = "fd000000-1111-4111-8111-000000000041";
const status = { result: {
  node_info: { network: "wolo-1" },
  sync_info: { catching_up: false, latest_block_height: "804" },
}};
function fabricated(from: string, to: string, memo: string) {
  return { tx_response: {
    txhash: HASH, code: 0, height: "802",
    tx: { body: {
      memo,
      messages: [{
        "@type": "/cosmos.bank.v1beta1.MsgSend",
        from_address: from, to_address: to,
        amount: [{ denom: "uwolo", amount: "25000000" }],
      }],
    }},
  }};
}

test("decoded REST observations can be fabricated and are NOT release authorization", () => {
  // Same trusted-looking body without any signed TxRaw, Merkle inclusion,
  // independently authenticated WoloChain witness, or signed v2 allocation.
  const withdrawal = inspectCanonicalSatchelWithdrawal({
    withdrawalId, txHash: HASH, vaultAddress: vault,
    ownerWalletAddress: owner, amountUwolo: "25000000",
    chainStatus: status,
    txResponse: fabricated(vault, owner,
      "aoe2war/satchel/withdraw/v1/" + withdrawalId),
  });
  assert.equal(withdrawal.kind, "canonical_satchel_owner_withdrawal");
  const refunded = verifyCanonicalSatchelClaimReturn({
    claimId: 88321, claimKind: "bet_refund", txHash: HASH,
    escrowAddress: escrow, vaultAddress: vault,
    amountUwolo: "25000000", chainStatus: status,
    txResponse: fabricated(escrow, vault,
      "aoe2war/satchel/claim-return/v1/88321"),
  });
  assert.equal(refunded.amountUwolo, 25000000n);

  // Neither accepted decoded object permits a financial transition.
  assert.equal(SATCHEL_FINANCIAL_BRIDGE_READY, false);
  assert.equal(satchelFinancialBridgeReady(), false);
  assert.throws(requireSatchelFinancialBridge,
    /SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD/);
});

test("setting every funded flag cannot bypass source-level bridge HOLD", () => {
  const keys = [
    "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
    "WAR_SATCHEL_FUNDED_LEDGER_ENABLED",
    "WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED",
    "WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED",
    "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
    "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED",
    "WAR_SATCHEL_LIVE_EXECUTOR_ENABLED",
    "WAR_SATCHEL_DEPOSIT_INSTRUCTIONS_ENABLED",
    "WAR_SATCHEL_FUNDED_CREDIT_ENABLED",
    "WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY",
    "WAR_SATCHEL_SIGNER_CLIENT_ENABLED",
  ];
  const previous = keys.map(k => process.env[k]);
  try {
    for (const key of keys) process.env[key] = "true";
    assert.equal(satchelFinancialBridgeReady(), false);
    assert.throws(requireSatchelFinancialBridge,
      /SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD/);
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});

test("all funded financial entry points are fenced at source, not by a mutable flag", () => {
  const ledger = source("lib/warSatchelFundedLedger.ts");
  const guard = ledger.split("function noFundsUntilCertified() {")[1]
    ?.split("function fundedVaultAddress()")[0] || "";
  assert.match(guard, /requireSatchelFinancialBridge\(\)/);
  assert.match(ledger, /function withExclusiveSatchelTx/);
  assert.match(ledger, /noFundsUntilCertified\(\)/);

  const paths: Array<[string, RegExp]> = [
    ["app/api/user/war-satchel/funding-quote/route.ts",
      /function isEnabled\(\) \{\s*return satchelFinancialBridgeReady\(\) &&/],
    ["app/api/user/war-satchel/withdrawal/route.ts",
      /function enabled\(\)\{\s*return satchelFinancialBridgeReady\(\) &&/],
    ["lib/warSatchelAutoBetExecutor.ts",
      /function enabled\(signer: IsolatedSatchelSigner\) \{\s*requireSatchelFinancialBridge\(\)/],
    ["lib/warSatchelFundedWatcherTick.ts",
      /function financialReady\(\)\{\s*requireSatchelFinancialBridge\(\)/],
    ["lib/warSatchelFundedOutboxTick.ts",
      /if\(!satchelFinancialBridgeReady\(\) \|\|/],
  ];
  for (const [path, marker] of paths) {
    assert.match(source(path), marker, path);
  }
});

test("hold is hard-coded false, never a mutable environment or remote value", () => {
  const implementation = source("lib/warSatchelFinancialBridgeHold.ts");
  assert.match(implementation, /export const SATCHEL_FINANCIAL_BRIDGE_READY: false = false;/);
  assert.doesNotMatch(implementation, /process\.env|fetch\(|eval\(|readFileSync/);
});
