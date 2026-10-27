/**
 * HELD HD→Wolo new-epoch v3 CONTRACT CANDIDATES. NOT CONNECTED TO RUNTIME.
 *
 * No Prisma, HTTP, keys, signing, credits, sends or persistent mutations.
 * No caller-supplied digest, identity, proof or bank value is authenticated
 * here. Runtime callers MUST independently verify actual signer policy,
 * bank commitment, custody, owner, nonce and permanent economic identities.
 */
import { planResolvedWagerSettlements } from "./betWagerSettlement.ts";
import { warSatchelVaultDistinctFromKnownWallets } from "./warSatchelVaultBoundary.ts";

export const NEW_EPOCH_HD_MAINNET_ENABLED = false as const;
export const NEW_EPOCH_PROTOCOL = "aoe2war/escrow-epoch/v3" as const;
const ADDR = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const SHA = /^[a-f0-9]{64}$/;
const EPOCH = /^[a-z][a-z0-9_-]{11,63}$/;
const UID = /^[a-zA-Z0-9_.:-]{1,100}$/;
const NAT = /^(?:0|[1-9][0-9]*)$/;
const HASH = /^[A-F0-9]{64}$/;
const UW = BigInt(1000000);
const BET_CAP = BigInt(10000) * UW;

function refuse(why: string): never {
  throw new Error("NEW_EPOCH_HD_V3_HELD:" + why);
}
function need(ok: unknown, why: string): asserts ok {
  if (!ok) refuse(why);
}
function natural(s: unknown, name: string, positive = true): bigint {
  need(typeof s === "string" && NAT.test(s) && s.length <= 39, "invalid_" + name);
  const value = BigInt(s);
  need(!positive || value > BigInt(0), "zero_" + name);
  need(value <= BigInt(2) ** BigInt(127) - BigInt(1), "unbounded_" + name);
  return value;
}
function fingerprint(v: unknown): v is string {
  return typeof v === "string" && SHA.test(v) && v !== "0".repeat(64);
}

export type NewEpochAuthorityClaim = Readonly<{
  chainId: "wolo-1"; epochId: string; hStar: string;
  vaultAddress: string; escrowAddress: string;
  vaultSignerPubkeySha256: string; escrowSignerPubkeySha256: string;
  vaultKeyringLineageSha256: string; escrowKeyringLineageSha256: string;
  escrowPolicySha256: string; installedEscrowPolicySha256: string;
  escrowExecutorSha256: string; escrowReturnApprovalKeySha256: string;
  excludedLegacyAddresses: readonly string[];
  excludedLegacySignerSha256: readonly string[];
  excludedLegacyKeyringLineageSha256: readonly string[];
  excludedLegacyEscrowPolicySha256: readonly string[];
  excludedLegacyExecutorSha256: readonly string[];
  excludedLegacyApprovalKeySha256: readonly string[];
}>;

export function inspectNewEpochAuthority(c: NewEpochAuthorityClaim) {
  need(c && c.chainId === "wolo-1" && EPOCH.test(c.epochId), "epoch_identity");
  natural(c.hStar, "epoch_root");
  need(ADDR.test(c.vaultAddress) && ADDR.test(c.escrowAddress) &&
    c.vaultAddress !== c.escrowAddress, "vault_or_escrow_address");
  need(Array.isArray(c.excludedLegacyAddresses) && c.excludedLegacyAddresses.length > 0 &&
    c.excludedLegacyAddresses.every(a => ADDR.test(a)), "legacy_address_inventory");
  // Static known-role exclusion is independent of the supplied inventory.
  need(warSatchelVaultDistinctFromKnownWallets(c.vaultAddress, c.excludedLegacyAddresses) &&
    warSatchelVaultDistinctFromKnownWallets(c.escrowAddress, c.excludedLegacyAddresses),
    "known_or_inventoried_legacy_address");
  const identities = [
    c.vaultSignerPubkeySha256, c.escrowSignerPubkeySha256,
    c.vaultKeyringLineageSha256, c.escrowKeyringLineageSha256,
    c.escrowPolicySha256, c.escrowExecutorSha256, c.escrowReturnApprovalKeySha256,
  ];
  need(identities.every(fingerprint), "identity_fingerprint_missing");
  need(c.installedEscrowPolicySha256 === c.escrowPolicySha256, "escrow_policy_drift");
  need(new Set(identities).size === identities.length, "key_lineage_or_role_collision");
  const families = [
    c.excludedLegacySignerSha256, c.excludedLegacyKeyringLineageSha256,
    c.excludedLegacyEscrowPolicySha256, c.excludedLegacyExecutorSha256,
    c.excludedLegacyApprovalKeySha256,
  ];
  need(families.every(a => Array.isArray(a) && a.length > 0 &&
    a.every(fingerprint) && new Set(a).size === a.length),
    "legacy_authority_inventory_unknown");
  const legacy = new Set(families.flatMap(a => [...a]));
  need(identities.every(id => !legacy.has(id)), "legacy_key_or_executor_inherited");
  return Object.freeze({
    protocol: NEW_EPOCH_PROTOCOL, epochId: c.epochId,
    vault: c.vaultAddress, escrow: c.escrowAddress,
    signerPolicySha256: c.escrowPolicySha256,
    status: "STRUCTURAL_REVIEW_ONLY" as const,
    financialAuthority: false as const,
  });
}

export type EpochWagerRequest = Readonly<{
  authority: NewEpochAuthorityClaim; ticketId: number;
  ownerUid: string; amountUwolo: string; firstEligibleHeight: string;
  legacyOperationIds: readonly string[];
}>;
export function inspectNewEpochWagerAdmission(r: EpochWagerRequest) {
  const scope = inspectNewEpochAuthority(r.authority);
  need(Number.isSafeInteger(r.ticketId) && r.ticketId > 0 && UID.test(r.ownerUid),
    "ticket_or_owner");
  const amount = natural(r.amountUwolo, "principal");
  need(amount <= BET_CAP && amount % UW === BigInt(0), "wager_principal_or_units");
  need(natural(r.firstEligibleHeight, "wager_height") > natural(r.authority.hStar, "epoch_root"),
    "before_new_epoch");
  const operationId = "satchel:e3:" + scope.epochId + ":" + r.ticketId;
  need(Array.isArray(r.legacyOperationIds) && !r.legacyOperationIds.includes(operationId),
    "historical_operation_id_reuse");
  return Object.freeze({
    chainId: "wolo-1" as const, epochId: scope.epochId, kind: "new_epoch_wager" as const,
    ownerUid: r.ownerUid, ticketId: r.ticketId,
    operationId, sender: scope.vault, recipient: scope.escrow,
    principalUwolo: amount.toString(),
    memo: "aoe2war/satchel/epoch-v3/" + scope.epochId + "/ticket/" + r.ticketId,
    escrowPolicySha256: scope.signerPolicySha256,
    status: "REVIEW_ONLY_NO_SIGNING" as const,
    signingAuthorized: false as const, broadcastAuthorized: false as const,
  });
}

export type NewEpochEconomicWager = Readonly<{
  wagerId: number; marketId: number; ticketId: number; legId: number;
  ownerUid: string; side: "left" | "right"; principalWolo: number;
  originalOperationId: string; fundingTxHash: string; fundingMessageIndex: number;
}>;
export function planNewEpochMarketSettlement(input: Readonly<{
  epochId: string; marketId: number; winningSide: "left" | "right" | null;
  wagers: readonly NewEpochEconomicWager[];
}>) {
  need(EPOCH.test(input.epochId) && Number.isSafeInteger(input.marketId) &&
    input.marketId > 0 && Array.isArray(input.wagers) && input.wagers.length > 0 &&
    input.wagers.length <= 1000, "market_or_epoch_scope");
  need(input.winningSide === null || input.winningSide === "left" ||
    input.winningSide === "right", "winner_side");
  const operations = new Set<string>(), physical = new Set<string>(), legs = new Set<string>();
  let principal = BigInt(0);
  for (const w of input.wagers) {
    need(Number.isSafeInteger(w.wagerId) && w.wagerId > 0 &&
      Number.isSafeInteger(w.ticketId) && w.ticketId > 0 &&
      Number.isSafeInteger(w.legId) && w.legId > 0 &&
      w.marketId === input.marketId && UID.test(w.ownerUid) &&
      (w.side === "left" || w.side === "right") &&
      Number.isSafeInteger(w.principalWolo) && w.principalWolo > 0 &&
      w.principalWolo <= 10000 && HASH.test(w.fundingTxHash) &&
      w.fundingMessageIndex === 0, "unowned_or_invalid_original_wager");
    need(w.originalOperationId ===
      "satchel:e3:" + input.epochId + ":" + w.ticketId, "old_or_cross_epoch_wager");
    const receipt = "wolo-1:" + w.fundingTxHash + ":" + w.fundingMessageIndex;
    const leg = w.originalOperationId + ":" + w.legId;
    need(!physical.has(receipt) && !legs.has(leg) &&
      !operations.has(String(w.wagerId)), "duplicate_funding_or_leg");
    physical.add(receipt); legs.add(leg); operations.add(String(w.wagerId));
    principal += BigInt(w.principalWolo);
  }
  // Reuse the existing canonical HD rounding, pro-rata and #JimsRule economics.
  const plan = planResolvedWagerSettlements({
    winningSide: input.winningSide, marketType: "wolo", desyncMarketType: "wolo",
    seedLeftWolo: 0, seedRightWolo: 0,
    wagers: input.wagers.map(w => ({id: w.wagerId, side: w.side, amountWolo: w.principalWolo})),
    feeRateBps: 200, feeDenominator: 10000,
  });
  need(!plan.unbackedDesyncWinningSide, "unbacked_winner");
  const entitlements = plan.outcomes.map(o => {
    const w = input.wagers.find(w => w.wagerId === o.id);
    need(w, "lost_source_wager");
    const source = w as NewEpochEconomicWager;
    return Object.freeze({
      entitlementId: "satchel:e3:" + input.epochId + ":entitlement:" +
        input.marketId + ":" + source.ticketId + ":" + source.legId,
      epochId: input.epochId, ownerUid: source.ownerUid,
      wagerId: o.id, marketId: input.marketId, ticketId: source.ticketId,
      legId: source.legId, originalOperationId: source.originalOperationId,
      originalFundingReceipt: "wolo-1:" + source.fundingTxHash + ":0",
      kind: input.winningSide === null ? "void_refund" as const :
        o.status === "won" ? "matched_payout" as const : "unmatched_refund" as const,
      payoutUwolo: (BigInt(o.payoutWolo) * UW).toString(),
      feeUwolo: (BigInt(o.bettingFeeWolo) * UW).toString(),
      status: "ECONOMIC_PLAN_ONLY" as const,
    });
  });
  const paid = entitlements.reduce((n, e) => n + BigInt(e.payoutUwolo), BigInt(0));
  const fees = entitlements.reduce((n, e) => n + BigInt(e.feeUwolo), BigInt(0));
  need(paid + fees === principal * UW, "principal_not_conserved");
  return Object.freeze({
    epochId: input.epochId, marketId: input.marketId,
    totalPrincipalUwolo: (principal * UW).toString(),
    totalReturnUwolo: paid.toString(), totalFeeUwolo: fees.toString(),
    entitlements: Object.freeze(entitlements),
    status: "REVIEW_ONLY_NO_SETTLEMENT" as const, executionAuthorized: false as const,
  });
}

export type EpochReturnClaim = Readonly<{
  chainId: "wolo-1"; epochId: string;
  entitlementId: string; ownerUid: string; marketId: number;
  ticketId: number; legId: number; originalOperationId: string;
  originalFundingReceipt: string; amountUwolo: string;
  returnSender: string; returnRecipient: string;
  txHash: string; messageIndex: number; txHeight: string;
  verifiedBankHeight: string; bankCommitHeight: string; memo: string;
  claimSource: "new_epoch_v3";
}>;

/** Structural receipt match. Native Comet/ICS23 proof remains mandatory externally. */
export function inspectNewEpochReturnCandidate(input: Readonly<{
  authority: NewEpochAuthorityClaim;
  entitlement: ReturnType<typeof planNewEpochMarketSettlement>["entitlements"][number];
  claim: EpochReturnClaim;
  consumedPhysicalReceiptKeys: readonly string[];
}>) {
  const scope = inspectNewEpochAuthority(input.authority);
  const { claim: c, entitlement: e } = input;
  need(c && c.chainId === "wolo-1" && c.epochId === scope.epochId &&
    c.claimSource === "new_epoch_v3" && e.epochId === scope.epochId &&
    c.entitlementId === e.entitlementId &&
    c.ownerUid === e.ownerUid && c.marketId === e.marketId &&
    c.ticketId === e.ticketId && c.legId === e.legId &&
    c.originalOperationId === e.originalOperationId &&
    c.originalFundingReceipt === e.originalFundingReceipt &&
    c.amountUwolo === e.payoutUwolo &&
    natural(c.amountUwolo, "return_principal") > BigInt(0), "cross_epoch_or_owner_claim");
  need(c.returnSender === scope.escrow && c.returnRecipient === scope.vault,
    "return_uses_wrong_custody");
  need(HASH.test(c.txHash) && c.messageIndex === 0 &&
    natural(c.txHeight, "tx_height") > natural(input.authority.hStar, "epoch_root"),
    "invalid_physical_receipt");
  need(natural(c.verifiedBankHeight, "bank_height") >= natural(c.txHeight, "tx_height") + BigInt(2) &&
    natural(c.bankCommitHeight, "bank_commit") === natural(c.verifiedBankHeight, "bank_height") + BigInt(1),
    "return_not_final_at_authenticated_height");
  need(c.memo === "aoe2war/satchel/epoch-v3/" + c.epochId + "/return/" + c.entitlementId,
    "return_memo_wrong_epoch");
  const receipt = "wolo-1:" + c.txHash + ":" + c.messageIndex;
  need(Array.isArray(input.consumedPhysicalReceiptKeys) &&
    !input.consumedPhysicalReceiptKeys.includes(receipt) &&
    !input.consumedPhysicalReceiptKeys.includes(e.originalFundingReceipt),
    "physical_receipt_reused_or_source_conflict");
  need(receipt !== e.originalFundingReceipt, "funding_receipt_replayed_as_return");
  return Object.freeze({
    epochId: c.epochId, entitlementId: e.entitlementId, ownerUid: e.ownerUid,
    physicalReceiptKey: receipt, amountUwolo: c.amountUwolo,
    status: "UNAUTHENTICATED_CANDIDATE_ONLY" as const,
    creditAuthorized: false as const, sendAuthorized: false as const,
  });
}
