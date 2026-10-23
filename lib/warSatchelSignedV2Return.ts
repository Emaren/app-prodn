import {BET_MAX_STAKE_UWOLO} from "./betMoneyLimits.ts";
/**
 * HD's independent, NONCREDITING verifier for WoloChain signed v2 per-leg
 * Satchel return economics. A signature is NOT proof of bank execution.
 *
 * Only an independently provisioned Ed25519 review key is accepted. The
 * expected owner, ticket, original funding transaction and claimed leg must
 * come from the durable HD database, never from the returned approval.
 */
import { createHash, createPublicKey, verify as verifyEd25519 } from "node:crypto";

type J = Record<string, unknown>;
const HASH = /^[A-F0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const DECIMAL = /^[1-9][0-9]{0,18}$/;
const MAX = BigInt("9223372036854775807");
const A_DOMAIN = "aoe2war/satchel/return-allocation/v2";
const R_DOMAIN = "aoe2war/satchel/claim-return-approval/v2";
const PUBLIC_SPKI = "302a300506032b6570032100";

function stop(reason: string): never {
  throw Error("SATCHEL_SIGNED_V2_RETURN_REFUSED:" + reason);
}
function obj(x: unknown): J {
  if (!x || typeof x !== "object" || Array.isArray(x)) stop("object_required");
  return x as J;
}
function keys(x: J, allowed: readonly string[]) {
  if (Object.keys(x).length !== allowed.length ||
      Object.keys(x).some(k => !allowed.includes(k))) stop("unknown_or_missing_field");
}
function str(x: unknown): string {
  if (typeof x !== "string" || !x.length || x.length > 160) stop("invalid_string");
  return x;
}
function num(x: unknown): number {
  if (typeof x !== "number" || !Number.isSafeInteger(x) || x < 1) stop("invalid_integer");
  return x;
}
function amount(x: unknown): bigint {
  const v = str(x);
  if (!DECIMAL.test(v)) stop("invalid_amount");
  const n = BigInt(v);
  if (n > MAX) stop("amount_overflow");
  return n;
}
function add(a: bigint, b: bigint): bigint {
  if (a > MAX - b) stop("aggregate_overflow");
  return a + b;
}
function b64(x: unknown): Buffer {
  const value = str(x);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) stop("noncanonical_signature");
  const raw = Buffer.from(value, "base64");
  if (raw.length !== 64 || raw.toString("base64") !== value)
    stop("noncanonical_signature");
  return raw;
}
function verifySignature(bytes: string, sig: unknown, keyHex: string) {
  if (!/^[a-f0-9]{64}$/.test(keyHex)) stop("operator_key_not_pinned");
  const key = createPublicKey({
    key: Buffer.from(PUBLIC_SPKI + keyHex, "hex"), format: "der", type: "spki",
  });
  if (!verifyEd25519(null, Buffer.from(bytes, "utf8"), key, b64(sig)))
    stop("invalid_review_signature");
}
function hash(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}
const allocationFields = [
  "version", "allocation_id", "revision", "operation_id", "owner_id", "ticket_id",
  "funding_tx_hash", "return_cap_uwolo", "funds_budget_id",
  "funds_available_uwolo", "bank_evidence_digest", "bank_height",
  "bank_block_hash", "legs", "issued_at", "expires_at", "signature",
] as const;
const legFields = ["leg_id", "market_id", "stake_uwolo", "entitlements"] as const;
const entitlementFields = [
  "entitlement_id", "claim_id", "claim_kind", "principal_uwolo", "amount_uwolo",
] as const;
const approvalFields = [
  "version", "ticket_id", "market_id", "leg_id", "entitlement_id",
  "allocation", "operation_id", "claim_id", "owner_id", "claim_kind",
  "amount_uwolo", "allocation_digest", "issued_at", "expires_at", "signature",
] as const;

export type ExpectedSignedReturn = Readonly<{
  ownerId: string;
  operationId: string;
  ticketId: string;
  fundingTxHash: string;
  claimId: string;
  marketId: string;
  legId: string;
  entitlementId: string;
  claimKind: "bet_refund" | "bet_payout";
  amountUwolo: string;
  // Independently reloaded original HD leg economics. Older read-only
  // consumers may omit these; the authenticated financial caller requires both.
  principalUwolo?: string;
  stakeUwolo?: string;
  fundedAmountUwolo: string;
  escrowAddress: string;
  vaultAddress: string;
}>;
export type VerifiedSignedReturn = Readonly<{
  ownerId: string; operationId: string; ticketId: string;
  claimId: string; marketId: string; legId: string;
  entitlementId: string; claimKind: "bet_refund" | "bet_payout";
  amountUwolo: bigint; allocationDigest: string;
  nonCrediting: true;
}>;

/**
 * No network access, wallet custody, ledger mutation, or mainnet authorization.
 * Caller must separately verify the authenticated *physical* transfer against
 * trusted Comet consensus and atomically consume its global chain/tx identity.
 */
export function verifySatchelSignedV2Return(input: {
  approval: unknown;
  independentOperatorPublicKeyHex: string;
  expected: ExpectedSignedReturn;
}): VerifiedSignedReturn {
  const expected = input.expected;
  if (!expected || !HASH.test(expected.fundingTxHash) ||
      !ADDRESS.test(expected.escrowAddress) || !ADDRESS.test(expected.vaultAddress) ||
      expected.escrowAddress === expected.vaultAddress ||
      !["bet_refund", "bet_payout"].includes(expected.claimKind) ||
      !expected.ownerId || !expected.operationId || !expected.ticketId ||
      !expected.claimId || !expected.marketId || !expected.legId ||
      !expected.entitlementId || amount(expected.amountUwolo) > MAX)
    stop("invalid_independent_expectations");

  const approval = obj(input.approval);
  keys(approval, approvalFields);
  const allocation = obj(approval.allocation);
  keys(allocation, allocationFields);
  if (num(allocation.version) !== 2 || num(approval.version) !== 2)
    stop("wrong_protocol_version");
  const revision = num(allocation.revision);
  const allocatedAt = num(allocation.issued_at);
  const allocatedUntil = num(allocation.expires_at);
  const approvedAt = num(approval.issued_at);
  const approvedUntil = num(approval.expires_at);
  if (allocatedUntil <= allocatedAt || approvedUntil <= approvedAt ||
      allocatedUntil - allocatedAt > 300 || approvedUntil - approvedAt > 300)
    stop("invalid_signature_interval");

  const operationId = str(allocation.operation_id);
  const ownerId = str(allocation.owner_id);
  const ticketId = str(allocation.ticket_id);
  if (operationId !== expected.operationId || ownerId !== expected.ownerId ||
      ticketId !== expected.ticketId ||
      str(allocation.funding_tx_hash) !== expected.fundingTxHash ||
      str(approval.operation_id) !== operationId ||
      str(approval.owner_id) !== ownerId ||
      str(approval.ticket_id) !== ticketId)
    stop("wrong_owner_or_original_funding");

  const cap = amount(allocation.return_cap_uwolo);
  const available = amount(allocation.funds_available_uwolo);
  const funding = amount(expected.fundedAmountUwolo);
  const bankHeight = num(allocation.bank_height);
  if (cap > available || cap > BigInt("100000000000000") ||
      available > BigInt("100000000000000") ||
      funding > BET_MAX_STAKE_UWOLO ||
      !HASH.test(str(allocation.bank_evidence_digest)) ||
      !HASH.test(str(allocation.bank_block_hash)))
    stop("invalid_reviewed_budget");

  const rawLegs = allocation.legs;
  if (!Array.isArray(rawLegs) || rawLegs.length < 1 || rawLegs.length > 16)
    stop("invalid_leg_count");
  let totalPrincipal = BigInt(0), totalReturn = BigInt(0), totalStake = BigInt(0);
  const markets = new Set<string>(), claims = new Set<string>();
  const entitlementIds = new Set<string>();
  let found = 0, previousLeg = "";
  const legArrays: unknown[][] = [];
  for (const item of rawLegs) {
    const leg = obj(item);
    keys(leg, legFields);
    const legId = str(leg.leg_id), marketId = str(leg.market_id);
    if ((previousLeg && legId <= previousLeg) || markets.has(marketId))
      stop("duplicate_or_unsorted_leg");
    markets.add(marketId);
    previousLeg = legId;
    const stake = amount(leg.stake_uwolo);
    totalStake = add(totalStake, stake);
    const ents = leg.entitlements;
    if (!Array.isArray(ents) || ents.length > 64)
      stop("invalid_entitlements");
    const entryArrays: unknown[][] = [];
    let legPrincipal = BigInt(0), previousEntitlement = "";
    for (const item of ents) {
      const ent = obj(item);
      keys(ent, entitlementFields);
      const id = str(ent.entitlement_id), claim = str(ent.claim_id);
      const kind = str(ent.claim_kind);
      if ((previousEntitlement && id <= previousEntitlement) ||
          entitlementIds.has(id) || claims.has(claim) || claim === "889")
        stop("duplicate_or_unsorted_entitlement");
      entitlementIds.add(id);
      claims.add(claim);
      previousEntitlement = id;
      if (kind !== "bet_refund" && kind !== "bet_payout")
        stop("unknown_claim_kind");
      const principal = amount(ent.principal_uwolo);
      const returned = amount(ent.amount_uwolo);
      if (kind === "bet_refund" && principal !== returned)
        stop("unmatched_principal_not_fully_refunded");
      legPrincipal = add(legPrincipal, principal);
      if (returned > BigInt("50000000000"))
        stop("claim_return_exceeds_go_limit");
      totalReturn = add(totalReturn, returned);
      entryArrays.push([id, claim, kind, principal.toString(), returned.toString()]);
      if (claim === expected.claimId && legId === expected.legId &&
          marketId === expected.marketId && id === expected.entitlementId &&
          kind === expected.claimKind &&
          returned.toString() === expected.amountUwolo &&
          (expected.principalUwolo === undefined || principal.toString() === expected.principalUwolo) &&
          (expected.stakeUwolo === undefined || stake.toString() === expected.stakeUwolo))
        found++;
    }
    if (legPrincipal > stake) stop("principal_exceeds_stake");
    totalPrincipal = add(totalPrincipal, legPrincipal);
    legArrays.push([legId, marketId, stake.toString(), entryArrays]);
  }
  if (totalStake !== funding || totalPrincipal > funding ||
      totalReturn > cap || totalReturn > available || found !== 1)
    stop("not_exact_funded_ticket_allocation");

  const allocationMessage = [
    A_DOMAIN, "wolo-1", "uwolo", expected.escrowAddress, expected.vaultAddress,
    2, str(allocation.allocation_id), revision, operationId, ownerId, ticketId,
    expected.fundingTxHash, cap.toString(), str(allocation.funds_budget_id),
    available.toString(), str(allocation.bank_evidence_digest), bankHeight,
    str(allocation.bank_block_hash), legArrays,
  ];
  // Go's AllocationDigest intentionally EXCLUDES review times and signature.
  // Its AllocationMessage adds timestamps before signing the same economics.
  const digest = hash(JSON.stringify(allocationMessage));
  const allocatedBytes = JSON.stringify([...allocationMessage, allocatedAt, allocatedUntil]);
  verifySignature(allocatedBytes, allocation.signature, input.independentOperatorPublicKeyHex);
  if (!DIGEST.test(str(approval.allocation_digest)) ||
      approval.allocation_digest !== digest)
    stop("allocation_digest_mismatch");

  if (str(approval.claim_id) !== expected.claimId ||
      str(approval.market_id) !== expected.marketId ||
      str(approval.leg_id) !== expected.legId ||
      str(approval.entitlement_id) !== expected.entitlementId ||
      str(approval.claim_kind) !== expected.claimKind ||
      str(approval.amount_uwolo) !== expected.amountUwolo)
    stop("approval_does_not_match_claim");

  const returnBytes = JSON.stringify([
    R_DOMAIN, "wolo-1", "uwolo", expected.escrowAddress, expected.vaultAddress,
    2, operationId, expected.claimId, ownerId, ticketId, expected.marketId,
    expected.legId, expected.entitlementId, expected.claimKind,
    expected.amountUwolo, digest, approvedAt, approvedUntil,
  ]);
  verifySignature(returnBytes, approval.signature, input.independentOperatorPublicKeyHex);
  return Object.freeze({
    ownerId, operationId, ticketId, claimId: expected.claimId,
    marketId: expected.marketId, legId: expected.legId,
    entitlementId: expected.entitlementId, claimKind: expected.claimKind,
    amountUwolo: amount(expected.amountUwolo), allocationDigest: digest,
    nonCrediting: true as const,
  });
}
