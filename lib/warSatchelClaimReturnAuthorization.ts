/** Server-owned durable return expectations. No HTTP payload or proof exporter
 * supplies the owner, original funding, market leg, amount or signed approval
 * used by the financial verifier. All review records are immutable in SQL. */
import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { inspectSingleTicketSatchelReturn } from "./warSatchelClaimReturnAttribution.ts";
import { verifySatchelSignedV2Return } from "./warSatchelSignedV2Return.ts";
import type { ExpectedWarSatchelClaimReturn } from "./warSatchelAuthenticatedClaimReturn.ts";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";

const HASH = /^[A-F0-9]{64}$/;
const ADDRESS = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
function refuse(reason: string): never { throw Error("SATCHEL_RETURN_AUTHORIZATION_REFUSED:" + reason); }
function positive(n: number) { return Number.isSafeInteger(n) && n > 0; }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) refuse("review_object_required");
  return value as Record<string, unknown>;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return "{" + Object.keys(obj).sort().map(k => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
  }
  const result = JSON.stringify(value);
  if (result === undefined) refuse("review_not_json");
  return result;
}
/** Stable across PostgreSQL JSONB key ordering. This binds context, not trust. */
export function satchelReturnContextFingerprint(expected: Omit<ExpectedWarSatchelClaimReturn, "contextFingerprint">): string {
  return createHash("sha256").update(canonical(expected), "utf8").digest("hex");
}
export type SatchelReturnOwner = Readonly<{
  claimId: number; ownerUserId: number; ownerUid: string; vault: string; escrow: string;
}>;
export type DurableSatchelClaimReturn = Readonly<{
  claimId: number; ownerUserId: number; ownerUid: string; sourceMarketId: number;
  expected: ExpectedWarSatchelClaimReturn; contextFingerprint: string;
}>;
type DB = Prisma.TransactionClient;

async function independentlyExpected(
  db: DB, owner: SatchelReturnOwner,
  review: {approval: unknown; entitlementId: string},
): Promise<DurableSatchelClaimReturn> {
  if (!positive(owner.claimId) || owner.claimId === 889 || !positive(owner.ownerUserId) ||
      !/^[a-zA-Z0-9_.:-]{1,100}$/.test(owner.ownerUid) ||
      !ADDRESS.test(owner.vault) || !ADDRESS.test(owner.escrow) || owner.vault === owner.escrow ||
      typeof review.entitlementId !== "string" || !review.entitlementId.length || review.entitlementId.length > 160)
    refuse("invalid_owner_or_protected_claim");
  const user = await db.user.findUnique({where: {id: owner.ownerUserId}, select: {uid: true}});
  const claim = await db.pendingWoloClaim.findUnique({where: {id: owner.claimId}});
  if (!user || user.uid !== owner.ownerUid || !claim || claim.id === 889 ||
      claim.status !== "claimed" || claim.claimedByUserId !== owner.ownerUserId ||
      !positive(claim.sourceMarketId ?? 0) ||
      (claim.claimKind !== "bet_payout" && claim.claimKind !== "bet_refund") ||
      !positive(claim.amountWolo) || !claim.payoutTxHash || !HASH.test(claim.payoutTxHash.toUpperCase()))
    refuse("claim_not_final_owner_bound_wager");
  const marketId = claim.sourceMarketId!;
  const wagers = await db.betWager.findMany({
    where: {marketId, userId: owner.ownerUserId, status: claim.claimKind === "bet_refund" ? "void" : "won"},
    select: {id: true, amountWolo: true, payoutWolo: true, status: true, stakeLeg: {select: {
      id: true, marketId: true, amountWolo: true, ticket: {select: {
        id: true, userId: true, source: true, walletProvider: true, walletAddress: true,
        stakeTxHash: true, status: true, clientRequestId: true,
      }},
    }}}, take: 1001,
  });
  const attributed = inspectSingleTicketSatchelReturn({
    ownerUserId: owner.ownerUserId, claimKind: claim.claimKind,
    claimAmountWolo: claim.amountWolo, marketId, vaultAddress: owner.vault, wagers,
  });
  const original = await db.satchelFundedReservation.findUnique({where: {ticketId: attributed.ticketId}});
  const ticket = await db.betStakeTicket.findUnique({
    where: {id: attributed.ticketId}, include: {legs: {select: {id: true, marketId: true, amountWolo: true}}},
  });
  if (!original || original.status !== "committed" || original.ownerUserId !== owner.ownerUserId ||
      original.ticketRequestId !== attributed.operationId || original.txHash?.toUpperCase() !== attributed.fundingTxHash ||
      !ticket || ticket.userId !== owner.ownerUserId || !positive(ticket.totalAmountWolo) ||
      original.amountUwolo !== BigInt(ticket.totalAmountWolo) * 1000000n ||
      ticket.legs.length < 1 || ticket.legs.length > 16)
    refuse("original_funded_reservation_missing_or_changed");
  // All allocation legs must describe the actual durable ticket, not just a
  // same-total invented partition that happens to contain the selected claim.
  const approval = structuredClone(review.approval);
  const legs = object(object(approval).allocation).legs;
  if (!Array.isArray(legs) || legs.length !== ticket.legs.length) refuse("allocation_not_original_ticket_legs");
  for (const leg of ticket.legs) {
    const matching = legs.filter(v => object(v).leg_id === String(leg.id));
    if (!positive(leg.amountWolo) || matching.length !== 1 ||
        object(matching[0]).market_id !== String(leg.marketId) ||
        object(matching[0]).stake_uwolo !== String(BigInt(leg.amountWolo) * 1000000n))
      refuse("allocation_not_original_ticket_legs");
  }
  const unsigned = {
    ownerId: owner.ownerUid, operationId: attributed.operationId,
    ticketId: String(attributed.ticketId), fundingTxHash: attributed.fundingTxHash,
    claimId: String(claim.id), marketId: String(marketId), legId: String(attributed.legId),
    entitlementId: review.entitlementId, claimKind: claim.claimKind,
    amountUwolo: String(attributed.amountUwolo), principalUwolo: String(attributed.principalUwolo),
    stakeUwolo: String(attributed.principalUwolo), fundedAmountUwolo: String(original.amountUwolo),
    escrowAddress: owner.escrow, vaultAddress: owner.vault,
    txHash: claim.payoutTxHash.toUpperCase(), approval,
  } as const;
  verifySatchelSignedV2Return({
    approval, expected: unsigned,
    independentOperatorPublicKeyHex: process.env.WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX || "",
  });
  const contextFingerprint = satchelReturnContextFingerprint(unsigned);
  return Object.freeze({
    claimId: owner.claimId, ownerUserId: owner.ownerUserId, ownerUid: owner.ownerUid,
    sourceMarketId: marketId, expected: Object.freeze({...unsigned, contextFingerprint}), contextFingerprint,
  });
}

/** Rebuild expectation both before proof collection and under the posting lock. */
export async function loadDurableSatchelClaimReturnExpectation(db: DB, owner: SatchelReturnOwner): Promise<DurableSatchelClaimReturn> {
  if (!positive(owner.claimId) || owner.claimId === 889) refuse("invalid_owner_or_protected_claim");
  const row = await db.satchelClaimReturnAuthorization.findUnique({where: {claimId: owner.claimId}});
  if (!row || row.ownerUserId !== owner.ownerUserId || row.ownerUid !== owner.ownerUid ||
      row.vaultAddress !== owner.vault || row.escrowAddress !== owner.escrow)
    refuse("durable_signed_review_missing_or_wrong_owner");
  const result = await independentlyExpected(db, owner, {approval: row.approvalJson, entitlementId: row.entitlementId});
  const e = result.expected;
  if (row.contextFingerprint !== result.contextFingerprint || row.ticketId !== Number(e.ticketId) ||
      row.marketId !== Number(e.marketId) || row.legId !== Number(e.legId) ||
      row.operationId !== e.operationId || row.fundingTxHash !== e.fundingTxHash ||
      row.fundedAmountUwolo !== BigInt(e.fundedAmountUwolo) || row.amountUwolo !== BigInt(e.amountUwolo) ||
      row.principalUwolo !== BigInt(e.principalUwolo) || row.claimKind !== e.claimKind ||
      row.returnTxHash !== e.txHash || row.allocationDigest !== object(e.approval).allocation_digest)
    refuse("durable_review_or_original_context_changed");
  return result;
}

/** Restricted server review ingestion. No proof fetch, preparation or payment.
 * Future operators must use an independently signed review; never synthesize
 * an allocation from a market aggregate or adopt an exporter context. */
export async function recordReviewedSatchelClaimReturnAuthorization(
  prisma: PrismaClient, owner: SatchelReturnOwner,
  review: {approval: unknown; entitlementId: string},
) {
  requireSatchelFinancialBridge();
  if (process.env.WAR_SATCHEL_RETURN_REVIEW_IMPORT_ENABLED !== "true") refuse("review_ingestion_not_authorized");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(724176, 47)`;
    const result = await independentlyExpected(tx, owner, review);
    const prior = await tx.satchelClaimReturnAuthorization.findUnique({where: {claimId: owner.claimId}});
    if (prior) {
      if (prior.contextFingerprint !== result.contextFingerprint) refuse("immutable_review_conflict");
      await loadDurableSatchelClaimReturnExpectation(tx, owner);
      return {status: "already_recorded" as const, claimId: owner.claimId};
    }
    const e = result.expected;
    await tx.satchelClaimReturnAuthorization.create({data: {
      claimId: owner.claimId, ownerUserId: owner.ownerUserId, ownerUid: owner.ownerUid,
      ticketId: Number(e.ticketId), marketId: Number(e.marketId), legId: Number(e.legId),
      entitlementId: e.entitlementId, operationId: e.operationId, fundingTxHash: e.fundingTxHash,
      fundedAmountUwolo: BigInt(e.fundedAmountUwolo), amountUwolo: BigInt(e.amountUwolo),
      principalUwolo: BigInt(e.principalUwolo), claimKind: e.claimKind,
      escrowAddress: e.escrowAddress, vaultAddress: e.vaultAddress, returnTxHash: e.txHash,
      approvalJson: e.approval as Prisma.InputJsonValue,
      allocationDigest: String(object(e.approval).allocation_digest), contextFingerprint: result.contextFingerprint,
    }});
    return {status: "recorded" as const, claimId: owner.claimId};
  }, {isolationLevel: "Serializable", maxWait: 5000, timeout: 9000});
}
