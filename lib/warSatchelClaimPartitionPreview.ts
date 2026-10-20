/**
 * Read-only inventory for a market claim whose returns may originate from
 * independent War Satchel-funded bet tickets.
 *
 * Each WoloChain return v2 claim_id is globally immutable and belongs to
 * EXACTLY one operation/ticket/market leg. A legacy PendingWoloClaim may
 * aggregate different funding tickets under a single claim ID. This inspector
 * exposes the contributions without inventing new claim IDs, minting ledger
 * credits, preparing escrow runs or claiming that a complete ticket's other
 * market legs have been reviewed.
 *
 * NO production execution consumes this preview. An independently approved
 * canonical claim-partition schema and full-ticket allocation review must
 * exist before a multi-ticket claim can move money.
 */
import {
  inspectSingleTicketSatchelReturn,
  type SatchelReturnClaimKind,
  type SatchelReturnWager,
} from "./warSatchelClaimReturnAttribution.ts";

const MICRO = BigInt(1_000_000);
const MAX_WAGERS = 1000;

export type SatchelClaimPartitionContribution = Readonly<{
  ticketId: number;
  operationId: string;
  fundingTxHash: string;
  marketId: number;
  sourceWagerIds: readonly number[];
  sourceStakeLegIds: readonly number[];
  principalUwolo: bigint;
  returnUwolo: bigint;
  // Existing ticket may contain another market leg not enumerated here.
  wholeTicketAllocationProved: false;
}>;

export type SatchelClaimPartitionPreview = Readonly<{
  kind: "non_executing_claim_partition_preview";
  sourceClaimId: number;
  ownerUserId: number;
  marketId: number;
  claimKind: SatchelReturnClaimKind;
  disposition: "single_ticket_source" | "new_claim_identities_required";
  totalPrincipalUwolo: bigint;
  totalReturnUwolo: bigint;
  contributions: readonly SatchelClaimPartitionContribution[];
  escrowExecutionAuthorized: false;
  creditAuthorized: false;
}>;

function reject(reason: string): never {
  throw Error("SATCHEL_PARTITION_PREVIEW_REFUSED:" + reason);
}
function id(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Input is an exact owner/market/status census. A caller may use this to
 * identify required partition work, NEVER as a signed ReturnAllocation.
 *
 * Note: grouping by ticket does NOT prove the ticket's full two-market
 * partition, current claim status, original durable reservation or chain
 * solvency. Those are separate execution-time financial authorities.
 */
export function inspectSatchelClaimPartitionPreview(input: Readonly<{
  sourceClaimId: number;
  ownerUserId: number;
  marketId: number;
  claimKind: SatchelReturnClaimKind;
  claimAmountWolo: number;
  vaultAddress: string;
  wagers: readonly SatchelReturnWager[];
}>): SatchelClaimPartitionPreview {
  if (!id(input.sourceClaimId) || !id(input.ownerUserId) ||
      !id(input.marketId) || !id(input.claimAmountWolo) ||
      (input.claimKind !== "bet_payout" && input.claimKind !== "bet_refund") ||
      input.wagers.length === 0 || input.wagers.length > MAX_WAGERS) {
    reject("invalid_or_unbounded_claim");
  }
  const groups = new Map<number, SatchelReturnWager[]>();
  const seenWagers = new Set<number>();
  const seenLegs = new Set<number>();
  let sumWolo = BigInt(0);
  for (const wager of input.wagers) {
    const leg = wager.stakeLeg;
    const ticket = leg?.ticket;
    if (!ticket || !leg || !id(ticket.id) || !id(wager.id) ||
        !id(leg.id) || !id(leg.marketId) ||
        !Number.isSafeInteger(wager.payoutWolo) ||
        wager.payoutWolo === null || wager.payoutWolo < 0 ||
        seenWagers.has(wager.id) || seenLegs.has(leg.id)) {
      reject("unverifiable_or_duplicate_source_wager");
    }
    seenWagers.add(wager.id);
    seenLegs.add(leg.id);
    sumWolo += BigInt(wager.payoutWolo);
    const group = groups.get(ticket.id) ?? [];
    group.push(wager);
    groups.set(ticket.id, group);
  }
  if (sumWolo !== BigInt(input.claimAmountWolo)) {
    reject("source_claim_not_exact_total_entitlement");
  }
  const contributions: SatchelClaimPartitionContribution[] = [];
  let principalUwolo = BigInt(0);
  let returnUwolo = BigInt(0);
  const seenFundingTransactions = new Set<string>();
  const seenOperationIds = new Set<string>();
  const ticketIds = Array.from(groups.keys()).sort((a,b) => a-b);
  for (const ticketId of ticketIds) {
    const group = groups.get(ticketId)!;
    const expected = group.reduce((n,w) => n+BigInt(w.payoutWolo!),BigInt(0));
    if (expected <= BigInt(0) ||
        expected > BigInt(Number.MAX_SAFE_INTEGER)) {
      reject("ticket_entitlement_not_representable");
    }
    const proof = inspectSingleTicketSatchelReturn({
      ownerUserId: input.ownerUserId,
      claimKind: input.claimKind,
      claimAmountWolo: Number(expected),
      marketId: input.marketId,
      vaultAddress: input.vaultAddress,
      wagers: group,
    });
    // Different ticket IDs must not describe the same durable request or
    // physical chain transaction, even in a stale or forged snapshot. The
    // database has matching uniqueness rules; enforce here independently.
    if (seenFundingTransactions.has(proof.fundingTxHash) ||
        seenOperationIds.has(proof.operationId)) {
      reject("multiple_tickets_share_one_chain_effect_or_operation");
    }
    seenFundingTransactions.add(proof.fundingTxHash);
    seenOperationIds.add(proof.operationId);
    principalUwolo += proof.principalUwolo;
    returnUwolo += proof.amountUwolo;
    contributions.push(Object.freeze({
      ticketId: proof.ticketId,
      operationId: proof.operationId,
      fundingTxHash: proof.fundingTxHash,
      marketId: proof.marketId,
      sourceWagerIds: Object.freeze(group.map(w=>w.id).sort((a,b)=>a-b)),
      sourceStakeLegIds: Object.freeze(group.map(w=>w.stakeLeg!.id).sort((a,b)=>a-b)),
      principalUwolo: proof.principalUwolo,
      returnUwolo: proof.amountUwolo,
      wholeTicketAllocationProved: false as const,
    }));
  }
  if (returnUwolo !== BigInt(input.claimAmountWolo)*MICRO ||
      contributions.length !== groups.size) {
    reject("partition_not_exact_or_incomplete");
  }
  return Object.freeze({
    kind:"non_executing_claim_partition_preview" as const,
    sourceClaimId: input.sourceClaimId,
    ownerUserId: input.ownerUserId,
    marketId: input.marketId,
    claimKind: input.claimKind,
    disposition:contributions.length===1
      ? "single_ticket_source" as const
      : "new_claim_identities_required" as const,
    totalPrincipalUwolo:principalUwolo,
    totalReturnUwolo:returnUwolo,
    contributions:Object.freeze(contributions),
    escrowExecutionAuthorized:false as const,
    creditAuthorized:false as const,
  });
}
