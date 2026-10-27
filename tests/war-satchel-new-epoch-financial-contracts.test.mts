import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  NEW_EPOCH_HD_MAINNET_ENABLED, inspectNewEpochAuthority,
  inspectNewEpochWagerAdmission, planNewEpochMarketSettlement,
  inspectNewEpochReturnCandidate,
} from "../lib/warSatchelNewEpochFinancialContracts.ts";

const A = (c: string) => "wolo1" + c.repeat(38);
const D = (c: string) => c.repeat(64);
const H = D("A");
const epoch = "epoch_20261026_scope_1";
const vault = A("q"), escrow = A("p"), old = A("r");
const base = () => ({
  chainId: "wolo-1" as const, epochId: epoch, hStar: "1000",
  vaultAddress: vault, escrowAddress: escrow,
  vaultSignerPubkeySha256: D("1"), escrowSignerPubkeySha256: D("2"),
  vaultKeyringLineageSha256: D("3"), escrowKeyringLineageSha256: D("4"),
  escrowPolicySha256: D("5"), installedEscrowPolicySha256: D("5"),
  escrowExecutorSha256: D("6"), escrowReturnApprovalKeySha256: D("7"),
  excludedLegacyAddresses: [old], excludedLegacySignerSha256: [D("8")],
  excludedLegacyKeyringLineageSha256: [D("9")],
  excludedLegacyEscrowPolicySha256: [D("a")],
  excludedLegacyExecutorSha256: [D("b")],
  excludedLegacyApprovalKeySha256: [D("c")],
});
const wager = (patch = {}) => ({
  authority: base(), ticketId: 200, ownerUid: "warrior:alpha",
  amountUwolo: "100000000", firstEligibleHeight: "1001",
  legacyOperationIds: ["satchel:claim-return:889"], ...patch,
});
const economic = (patch = {}) => ({
  wagerId: 1, marketId: 77, ticketId: 200, legId: 11,
  ownerUid: "warrior:alpha", side: "left" as const, principalWolo: 100,
  originalOperationId: "satchel:e3:" + epoch + ":200",
  fundingTxHash: H, fundingMessageIndex: 0, ...patch,
});
const counterparty = () => economic({
  wagerId: 2, ticketId: 201, legId: 12, ownerUid: "warrior:beta",
  side: "right", principalWolo: 40,
  originalOperationId: "satchel:e3:" + epoch + ":201", fundingTxHash: D("B"),
});
const plan = (p = {}) => planNewEpochMarketSettlement({
  epochId: epoch, marketId: 77, winningSide: "left", wagers: [economic(), counterparty()], ...p,
});
const claimFor = (entitlement: ReturnType<typeof plan>["entitlements"][number], patch = {}) => ({
  chainId: "wolo-1" as const, epochId: epoch,
  entitlementId: entitlement.entitlementId, ownerUid: entitlement.ownerUid,
  marketId: entitlement.marketId, ticketId: entitlement.ticketId, legId: entitlement.legId,
  originalOperationId: entitlement.originalOperationId,
  originalFundingReceipt: entitlement.originalFundingReceipt,
  amountUwolo: entitlement.payoutUwolo,
  returnSender: escrow, returnRecipient: vault,
  txHash: D("C"), messageIndex: 0, txHeight: "1001",
  verifiedBankHeight: "1003", bankCommitHeight: "1004",
  memo: "aoe2war/satchel/epoch-v3/" + epoch + "/return/" + entitlement.entitlementId,
  claimSource: "new_epoch_v3" as const,
  ...patch,
});

function declines(fn: () => unknown, pattern: RegExp = /NEW_EPOCH_HD_V3_HELD/) {
  assert.throws(fn, pattern);
}

test("hard false flag and no network or financial imports", () => {
  assert.equal(NEW_EPOCH_HD_MAINNET_ENABLED, false);
  const src = readFileSync(new URL("../lib/warSatchelNewEpochFinancialContracts.ts", import.meta.url), "utf8");
  for (const banned of [/from ["']@prisma/, /fetch\s*\(/, /\.create\s*\(/, /submitOneShot\s*\(/,
    /\.update\s*\(/, /signAndBroadcast\s*\(/, /process\.env/, /child_process/, /node:fs/]) {
    assert.doesNotMatch(src, banned);
  }
});

test("v3 admission is a real immutable-shaped candidate and has no send permission", () => {
  const v = inspectNewEpochWagerAdmission(wager());
  assert.equal(v.chainId, "wolo-1"); assert.equal(v.epochId, epoch);
  assert.equal(v.sender, vault); assert.equal(v.recipient, escrow);
  assert.equal(v.operationId, "satchel:e3:" + epoch + ":200");
  assert.equal(v.signingAuthorized, false); assert.equal(v.broadcastAuthorized, false);
  assert.equal(v.escrowPolicySha256, D("5"));
  assert.equal(inspectNewEpochAuthority(base()).financialAuthority, false);
});

test("legacy exclusion includes fixed known wallets, not only self-supplied list", () => {
  declines(() => inspectNewEpochAuthority({...base(), escrowAddress: old}));
  declines(() => inspectNewEpochAuthority({...base(), vaultAddress: old}));
  declines(() => inspectNewEpochAuthority({...base(), escrowAddress: vault}));
  declines(() => inspectNewEpochAuthority({...base(), excludedLegacyAddresses: []}));
});

test("wrong chain, missing or malformed epoch, missing H* all HOLD", () => {
  for (const b of [
    {...base(), chainId: "wolo-2" as "wolo-1"},
    {...base(), epochId: "old"},
    {...base(), hStar: "0"},
    {...base(), hStar: "-1"},
  ]) declines(() => inspectNewEpochAuthority(b));
});

test("new address controlled by old signing key or old keyring always HOLD", () => {
  declines(() => inspectNewEpochAuthority({...base(), escrowSignerPubkeySha256: D("8")}));
  declines(() => inspectNewEpochAuthority({...base(), escrowKeyringLineageSha256: D("9")}));
  declines(() => inspectNewEpochAuthority({...base(), escrowExecutorSha256: D("b")}));
  declines(() => inspectNewEpochAuthority({...base(), escrowReturnApprovalKeySha256: D("c")}));
  declines(() => inspectNewEpochAuthority({...base(), escrowPolicySha256: D("a"), installedEscrowPolicySha256: D("a")}));
});

test("policy drift, shared vault/escrow keys, missing external identity inventory HOLD", () => {
  declines(() => inspectNewEpochAuthority({...base(), installedEscrowPolicySha256: D("d")}));
  declines(() => inspectNewEpochAuthority({...base(), escrowKeyringLineageSha256: D("3")}));
  declines(() => inspectNewEpochAuthority({...base(), escrowSignerPubkeySha256: D("1")}));
  declines(() => inspectNewEpochAuthority({...base(), excludedLegacyApprovalKeySha256: []}));
});

test("Wolo bounded whole-coin wager max 10k and post-H* only", () => {
  for (const patch of [
    {amountUwolo: "10000000001"}, {amountUwolo: "1"}, {amountUwolo: "0"},
    {amountUwolo: "01"}, {amountUwolo: "10000000000000000000000000000000000000"},
    {firstEligibleHeight: "1000"}, {firstEligibleHeight: "999"},
    {ticketId: 0}, {ownerUid: "../admin"},
    {legacyOperationIds: ["satchel:e3:" + epoch + ":200"]},
  ]) declines(() => inspectNewEpochWagerAdmission(wager(patch)));
});

test("matched-only 2% fee, unmatched principal returned, conservation and attribution", () => {
  const resolved = plan();
  // left100/right40: matched 80, 2% of 80 rounded to 2 WOLO.
  assert.equal(resolved.totalPrincipalUwolo, "140000000");
  assert.equal(resolved.totalFeeUwolo, "2000000");
  assert.equal(resolved.totalReturnUwolo, "138000000");
  assert.equal(BigInt(resolved.totalReturnUwolo) + BigInt(resolved.totalFeeUwolo),
    BigInt(resolved.totalPrincipalUwolo));
  const winner = resolved.entitlements.find(x => x.ticketId === 200)!;
  const loser = resolved.entitlements.find(x => x.ticketId === 201)!;
  assert.equal(winner.ownerUid, "warrior:alpha");
  assert.equal(winner.originalFundingReceipt, "wolo-1:" + H + ":0");
  assert.equal(winner.payoutUwolo, "138000000");
  assert.equal(loser.payoutUwolo, "0");
  assert.equal(resolved.executionAuthorized, false);
});

test("void is exact principal refund, zero fee, no invented payout", () => {
  const p = plan({winningSide: null});
  assert.equal(p.totalFeeUwolo, "0");
  assert.equal(p.totalReturnUwolo, p.totalPrincipalUwolo);
  assert.ok(p.entitlements.every(e => e.kind === "void_refund"));
});

test("market, original ticket, owner, physical receipt collisions all reject", () => {
  for (const w of [
    economic({marketId: 78}), economic({originalOperationId: "satchel:claim-return:889"}),
    economic({fundingMessageIndex: 1}), economic({principalWolo: 10001}),
  ]) declines(() => plan({wagers: [w, counterparty()]}));
  declines(() => plan({wagers: [economic(), economic({wagerId: 2, ticketId: 201, legId: 12, fundingTxHash: H, originalOperationId: "satchel:e3:" + epoch + ":201"})]}));
  declines(() => plan({wagers: [economic(), economic()]}));
  declines(() => plan({epochId: "epoch_20261026_other"}));
  declines(() => plan({winningSide: "right", wagers: [economic()]}));
});

test("reconciled return candidate is never a credit authorization", () => {
  const p = plan();
  const winning = p.entitlements.find(e => e.ticketId === 200)!;
  const o = inspectNewEpochReturnCandidate({
    authority: base(), entitlement: winning, claim: claimFor(winning),
    consumedPhysicalReceiptKeys: [],
  });
  assert.equal(o.status, "UNAUTHENTICATED_CANDIDATE_ONLY");
  assert.equal(o.creditAuthorized, false); assert.equal(o.sendAuthorized, false);
  assert.equal(o.physicalReceiptKey, "wolo-1:" + D("C") + ":0");
});

test("old claim #889/#8477, DE/legacy claim and different epoch cannot return", () => {
  const e = plan().entitlements[0];
  for (const patch of [
    {claimSource: "legacy"}, {claimSource: "de"}, {epochId: "epoch_20261026_other"},
    {entitlementId: "satchel:claim-return:889"}, {entitlementId: "satchel:claim-return:8477"},
    {ownerUid: "warrior:beta"}, {ticketId: 201},
    {originalOperationId: "satchel:claim-return:889"},
    {originalFundingReceipt: "wolo-1:" + D("D") + ":0"}, {amountUwolo: "100000000"},
  ]) declines(() => inspectNewEpochReturnCandidate({
    authority: base(), entitlement: e, claim: claimFor(e, patch), consumedPhysicalReceiptKeys: [],
  }));
});

test("same physical tx cannot be original funding, prior credit, or other epoch return", () => {
  const e = plan().entitlements[0];
  for (const patch of [
    {txHash: H}, {messageIndex: 1},
    {returnSender: old}, {returnRecipient: old},
    {memo: "aoe2war/satchel/claim-return/v1/889"},
    {txHeight: "1000"}, {verifiedBankHeight: "1002"}, {bankCommitHeight: "1005"},
  ]) declines(() => inspectNewEpochReturnCandidate({
    authority: base(), entitlement: e, claim: claimFor(e, patch), consumedPhysicalReceiptKeys: [],
  }));
  declines(() => inspectNewEpochReturnCandidate({
    authority: base(), entitlement: e, claim: claimFor(e),
    consumedPhysicalReceiptKeys: ["wolo-1:" + D("C") + ":0"],
  }));
  declines(() => inspectNewEpochReturnCandidate({
    authority: base(), entitlement: e, claim: claimFor(e),
    consumedPhysicalReceiptKeys: [e.originalFundingReceipt],
  }));
});

test("zero-payout loser cannot be used to mint an escrow return", () => {
  const e = plan().entitlements.find(e => e.ticketId === 201)!;
  declines(() => inspectNewEpochReturnCandidate({
    authority: base(), entitlement: e, claim: claimFor(e), consumedPhysicalReceiptKeys: [],
  }));
});
