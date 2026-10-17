import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Keplr cannot be shown a Satchel destination until credit and withdrawal paths are certified", () => {
  const quote = read("app/api/user/war-satchel/funding-quote/route.ts");
  assert.match(quote, /WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED/);
  assert.match(quote, /WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED/);
  assert.match(quote, /WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED/);
  assert.match(quote, /WAR_SATCHEL_FUNDED_CREDIT_ENABLED/);
  assert.match(quote, /WAR_SATCHEL_DEPOSIT_INSTRUCTIONS_ENABLED/);
  assert.match(quote, /request\.headers\.get\("origin"\)/);
  assert.match(quote, /where:\s*\{[\s\S]*?senderAddress: owner\.walletAddress/);
  assert.match(quote, /ownerWalletAddress: intent\.senderAddress/);
  assert.match(quote, /recipientAddress: vault/);
  assert.match(quote, /amountUwolo: intent\.amountUwolo\.toString\(\)/);
  assert.match(quote, /memo: intent\.memo/);
  assert.doesNotMatch(quote, /body\.(recipientAddress|vaultAddress|amountUwolo|memo)/);
});

test("Keplr client verifies exact chain wallet memo and displays no fake credited balance", () => {
  const client = read("components/profile/WarSatchelFundingAction.tsx");
  assert.match(client, /disabled=\{busy \|\| !ready \|\| !valid \|\| mayHaveSent \|\|\s*knownIntents\.length > 0\}/);
  assert.match(client, /quote\.recipientAddress/);
  assert.match(client, /quote\.memo/);
  assert.match(client, /keplr\.enable\("wolo-1"\)/);
  assert.match(client, /accounts\[0\]\.address !== walletAddress/);
  assert.match(client, /SigningStargateClient\.connectWithSigner/);
  assert.match(client, /client\.sendTokens\(/);
  assert.match(client, /\/api\/user\/war-satchel\/deposit-evidence/);
  assert.match(client, /\/api\/user\/war-satchel\/credit-verified/);
  assert.match(client, /Do not resend/);
  assert.doesNotMatch(client, /setBalance\(\{\s*available: true,\s*availableUwolo: depositAmount/);
});

test("a forged client credit cannot supply owner amount destination or trusted chain JSON", () => {
  const credit = read("app/api/user/war-satchel/credit-verified/route.ts");
  assert.match(credit, /WAR_SATCHEL_FUNDED_LEDGER_ENABLED/);
  assert.match(credit, /WAR_SATCHEL_VAULT_WITHDRAWAL_CERTIFIED/);
  assert.match(credit, /WAR_SATCHEL_FUNDED_WITHDRAWALS_ENABLED/);
  assert.match(credit, /Object\.keys\(input\)\.sort\(\)\.join\(","\) !== "intentId,txHash"/);
  assert.match(credit, /authenticateOwnerDeposit\(/);
  assert.match(credit, /authenticatedDeposit: verified/);
  assert.doesNotMatch(credit, /canonicalJson\(|inspectCanonicalSatchelDeposit\(/);
  assert.match(credit, /recordUncreditedWarSatchelReceipt\(/);
  assert.match(credit, /readIndependentSatchelBank\(/);
  assert.match(credit, /creditRecordedSatchelProof\(/);
  assert.match(credit, /ownerUid: owner\.uid/);
  assert.doesNotMatch(credit, /body\.(vaultAddress|amountUwolo|userId|ownerUid|chainStatus|txResponse)/);
});

test("Satchel balances are private and not invented in current production", () => {
  const balance = read("app/api/user/war-satchel/balance/route.ts");
  assert.match(balance, /if \(!activated\) return NextResponse\.json\(/);
  assert.match(balance, /source: "not_installed_or_not_certified"/);
  assert.match(balance, /await getSessionUid\(request\)/);
  assert.match(balance, /where: \{ ownerUserId: owner\.id \}/);
  assert.match(balance, /committedHistoricalUwolo/);
  assert.match(balance, /wageringEnabled: false/);
});

test("funded custody never mistakes already-spent bet escrow funds for Satchel bank liabilities", () => {
  const admit = read("lib/warSatchelFundedAdmission.ts");
  const ledger = read("lib/warSatchelFundedLedger.ts");
  assert.match(admit, /available! \+ reserved! \+ withdrawalPending!/);
  assert.doesNotMatch(admit, /available! \+ reserved! \+ committed!/);
  assert.match(ledger, /outstandingVaultLiability\(/);
  assert.match(ledger, /_sum: \{ availableUwolo: true, reservedUwolo: true, withdrawalPendingUwolo: true \}/);
  assert.match(ledger, /releaseUnbroadcastSatchelReservation/);
  assert.match(ledger, /if \(!input\.independentlyNoBroadcast\)/);
  assert.match(ledger, /markSatchelSubmissionAttempt/);
  assert.match(ledger, /status: "unknown_hold"/);
  assert.match(ledger, /ticket\.status !== "recorded"/);
});

test("no physical wolo-1 bank transfer can fund both a deposit and an escrow claim return", () => {
  const ledger = read("lib/warSatchelFundedLedger.ts");
  const deposit = ledger.split("export async function creditRecordedSatchelProof(")[1]
    ?.split("export async function reserveForWatcherExecution(")[0];
  const claimReturn = ledger.split("export async function creditVerifiedSatchelClaimReturn(")[1];
  assert.ok(deposit && claimReturn, "both credit pathways must exist");
  assert.match(deposit, /satchelFundedClaimReturn\.findUnique\(/);
  assert.match(deposit, /physical_transfer_already_credited_as_claim_return/);
  assert.match(claimReturn, /warSatchelProofCandidate\.findUnique\(/);
  assert.match(claimReturn, /claim_return_hash_already_used_as_deposit_candidate/);
  assert.match(claimReturn, /claim_return_hash_already_used_as_deposit/);
  for (const section of [deposit, claimReturn]) {
    assert.match(section, /chainId_txHash_transferIndex/);
    assert.match(section, /chainId:\s*"wolo-1",\s*txHash:\s*proof\.txHash,\s*transferIndex:\s*0/);
  }
  assert.ok(
    deposit.indexOf("physical_transfer_already_credited_as_claim_return") <
    deposit.indexOf("satchelFundedReceipt.create("),
    "deposit must fence a reused return before issuing a credit"
  );
  assert.ok(
    claimReturn.indexOf("claim_return_hash_already_used_as_deposit_candidate") <
    claimReturn.indexOf("satchelFundedClaimReturn.create("),
    "claim return must reject any previously observed deposit effect before credit"
  );
});
