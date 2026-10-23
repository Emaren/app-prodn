/** Source-only regression contracts, NOT running-transaction or release proof.
 * Fail if formerly qualified legacy producers bypass the maintenance lease.
 * The actual signed permit/PG runtime tests remain separately required. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (name: string) => readFileSync(resolve(root, name), "utf8");
const within = (src: string, start: string, end: string) => {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, "source anchors changed; re-review guarded financial action");
  return src.slice(a, b);
};

test("legacy faucet transfer does not invoke keyring CLI outside financial lease", () => {
  const source = file("app/api/wolo/faucet/claim/route.ts");
  assert.match(source, /import.*withHdFinancialLease.*hdFinancialMaintenanceFence/);
  const action = within(source, "async function sendFaucetTransfer", "async function fetchBalanceAfterClaim");
  assert.match(action, /withHdFinancialLease\(/);
  assert.match(action, /producer:\s*"faucet"/);
  assert.match(action, /execFileAsync\(FAUCET_CLI,\s*txArgs/);
  assert.doesNotMatch(action, /await execFileAsync\(FAUCET_CLI/);
});

test("legacy staking CLI and SDK spends require source/build bound permit lease", () => {
  const source = file("lib/woloStakingUnstake.ts");
  assert.match(source, /import.*withHdFinancialLease.*hdFinancialMaintenanceFence/);
  assert.match(source, /producer:\s*"staking-unstake"/);
  assert.match(source, /withHdFinancialLease\([\s\S]*?execFileAsync\(STAKING_CLI/);
  assert.match(source, /withHdFinancialLease\([\s\S]*?client\.sendTokens\(/);
  assert.doesNotMatch(source, /await execFileAsync\(STAKING_CLI/);
  assert.doesNotMatch(source, /const result = await client\.sendTokens\(/);
});

test("both settlement lanes and local signer route through one bounded lease", () => {
  const source = file("lib/woloBetSettlement.ts");
  assert.match(source, /import.*withHdFinancialLease.*hdFinancialMaintenanceFence/);
  assert.match(source, /async function financialSettlementPost/);
  assert.match(source, /readWarSatchelBoundedUtf8/);
  assert.match(source, /producer:\s*"local-payout"/);
  assert.match(source, /"settlement-payout"/);
  assert.match(source, /"founder-payout"/);
  const normal = within(source, "async function executeWoloPayoutViaSettlementService", "async function executeWoloPayoutViaNamedSettlementService");
  const founder = within(source, "async function executeWoloPayoutViaNamedSettlementService", "async function executeWoloSettlementRunFallback");
  assert.match(normal, /financialSettlementPost<SettlementExecutePayload>/);
  assert.match(founder, /financialSettlementPost<SettlementExecutePayload>/);
  assert.doesNotMatch(normal, /await fetch\(\x60\$\{baseUrl\}\/settlement\/v1\/payouts/);
  assert.doesNotMatch(founder, /await fetch\(\x60\$\{baseUrl\}\/settlement\/v1\/payouts/);
});

test("grouped mainnet settlement cannot fall back after ambiguous POST", () => {
  const source = file("lib/woloBetSettlement.ts");
  const action = within(source, "export async function executeWoloSettlementRun(input:", "export async function validateWoloEscrowSettlementRun");
  const unknown = within(source, "function groupedRunUnknown(", "export async function executeWoloSettlementRun(input:");
  assert.match(action, /financialSettlementPost<SettlementRunPayload>/);
  assert.match(action, /"escrow-settlement-run"/);
  assert.match(action, /"payout-settlement-run"/);
  assert.match(action, /groupedRunUnknown\(input,/);
  assert.doesNotMatch(action, /await fetch\(\x60\$\{baseUrl\}\/settlement\/v1\/runs/);
  assert.match(unknown, /retryable:\s*false/);
  assert.match(unknown, /status:\s*"unknown"/);
  assert.match(unknown, /attempted:\s*true/);
  assert.match(unknown, /executedTotalUWolo:\s*null/);
});

test("ambiguous single-signer fallback stops remaining payouts without retry", () => {
  const source = file("lib/woloBetSettlement.ts");
  const fallback = within(source, "async function executeWoloSettlementRunFallback", "export async function validateWoloSettlementRun");
  assert.match(fallback, /let unknownCount = 0/);
  assert.match(fallback, /if \(unknownCount > 0\)/);
  assert.match(fallback, /outcome: "held_after_unknown"/);
  assert.match(fallback, /unknownCount \+= 1/);
  assert.match(fallback, /failureCode: "PAYOUT_OUTCOME_UNKNOWN"/);
  assert.match(fallback, /status: "unknown"/);
  assert.match(fallback, /outcome: "unknown"/);
  assert.match(fallback, /retryable: false/);
  assert.doesNotMatch(fallback, /retryable: true/);
  assert.match(fallback, /executedTotalUWolo: unknownCount > 0 \? null/);
  assert.match(fallback, /status === "unknown"/);
});

test("Satchel financial bridge source interlock is still hard disabled", () => {
  const source = file("lib/warSatchelFinancialBridgeHold.ts");
  assert.match(source, /export const SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
});
