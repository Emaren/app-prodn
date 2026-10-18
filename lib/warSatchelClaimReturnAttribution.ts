/**
 * Read-only HD claim attribution for WoloChain's signed per-ticket return v2.
 *
 * Existing pending_wolo_claims can aggregate more than one recorded wager.
 * The WoloChain return authority instead binds ONE funding operation, ticket,
 * owner, market leg and original bank transfer per immutable claim ID.
 *
 * NEVER split or infer a multi-ticket claim here: it needs independently
 * reviewed claim partitioning before any escrow return can be prepared.
 * This module does not authorize a payment, credit, signature or settlement.
 */
export type SatchelReturnClaimKind = "bet_payout" | "bet_refund";
export type SatchelReturnTicket = Readonly<{
  id: number;
  userId: number;
  source: string;
  walletProvider: string | null;
  walletAddress: string;
  stakeTxHash: string | null;
  status: string;
  clientRequestId: string;
}>;
export type SatchelReturnWager = Readonly<{
  id: number;
  amountWolo: number;
  payoutWolo: number | null;
  status: string;
  stakeLeg: null | Readonly<{
    id: number;
    marketId: number;
    amountWolo: number;
    ticket: SatchelReturnTicket | null;
  }>;
}>;
export type SingleTicketSatchelReturn = Readonly<{
  ticketId: number;
  legId: number;
  operationId: string;
  fundingTxHash: string;
  marketId: number;
  amountUwolo: bigint;
  principalUwolo: bigint;
  wagerCount: number;
}>;

const TX = /^[A-F0-9]{64}$/;
const REQUEST = /^satchel:ticket:[1-9][0-9]{0,11}$/;
const MAX_WAGERS = 1000;
const MICRO = BigInt(1_000_000);

function refuse(reason: string): never {
  throw Error("SATCHEL_RETURN_ATTRIBUTION_REFUSED:" + reason);
}
function whole(value: number, positive: boolean): boolean {
  return Number.isSafeInteger(value) && (positive ? value > 0 : value >= 0);
}

/**
 * Accepts an exact owner+market wager census produced within HD's global
 * serializable custody transaction. Result is evidence for further *review*,
 * NOT authorization to tell an escrow signer to send money.
 */
export function inspectSingleTicketSatchelReturn(input: Readonly<{
  ownerUserId: number;
  claimKind: SatchelReturnClaimKind;
  claimAmountWolo: number;
  marketId: number;
  vaultAddress: string;
  wagers: readonly SatchelReturnWager[];
}>): SingleTicketSatchelReturn {
  if (!whole(input.ownerUserId, true) || !whole(input.marketId, true) ||
      !whole(input.claimAmountWolo, true) ||
      (input.claimKind !== "bet_payout" && input.claimKind !== "bet_refund") ||
      typeof input.vaultAddress !== "string" || !input.vaultAddress ||
      input.wagers.length === 0 || input.wagers.length > MAX_WAGERS) {
    refuse("invalid_owner_claim_or_bounded_census");
  }
  let ticketId: number | null = null;
  let operationId: string | null = null;
  let fundingTxHash: string | null = null;
  let principalWolo = BigInt(0);
  let dueWolo = BigInt(0);
  const legIds = new Set<number>();
  for (const wager of input.wagers) {
    const leg = wager.stakeLeg;
    const ticket = leg?.ticket;
    if (!ticket || !leg ||
        !whole(wager.id, true) || !whole(leg.id, true) ||
        !whole(leg.amountWolo, true) || !whole(wager.amountWolo, true) ||
        !whole(wager.payoutWolo ?? -1, false) ||
        leg.marketId !== input.marketId || leg.amountWolo !== wager.amountWolo ||
        wager.status !== (input.claimKind === "bet_refund" ? "void" : "won") ||
        !whole(ticket.id, true) || ticket.userId !== input.ownerUserId ||
        ticket.source !== "auto" || ticket.walletProvider !== "satchel-vault" ||
        ticket.walletAddress !== input.vaultAddress || ticket.status !== "recorded" ||
        !REQUEST.test(ticket.clientRequestId) ||
        !ticket.stakeTxHash || !TX.test(ticket.stakeTxHash.toUpperCase()) ||
        legIds.has(leg.id)) {
      refuse("unverified_wager_leg_owner_or_original_funding");
    }
    legIds.add(leg.id);
    if (ticketId !== null &&
        (ticketId !== ticket.id ||
         operationId !== ticket.clientRequestId ||
         fundingTxHash !== ticket.stakeTxHash.toUpperCase())) {
      refuse("multi_ticket_or_conflicting_funding_requires_claim_partition");
    }
    ticketId = ticket.id;
    operationId = ticket.clientRequestId;
    fundingTxHash = ticket.stakeTxHash.toUpperCase();
    if (input.claimKind === "bet_refund" &&
        wager.payoutWolo !== wager.amountWolo) {
      refuse("unmatched_principal_not_fully_refunded");
    }
    principalWolo += BigInt(wager.amountWolo);
    dueWolo += BigInt(wager.payoutWolo!);
  }
  if (ticketId === null || operationId === null || fundingTxHash === null ||
      dueWolo !== BigInt(input.claimAmountWolo)) {
    refuse("claim_not_exact_owner_entitlement");
  }
  // v2 assigns one immutable leg to each market. Never choose a leg from an
  // aggregated legacy claim, even when the ticket and total happen to match.
  if (legIds.size !== 1) refuse("multi_leg_claim_requires_partition_review");
  return Object.freeze({
    ticketId, legId: [...legIds][0], operationId, fundingTxHash, marketId: input.marketId,
    amountUwolo: dueWolo * MICRO,
    principalUwolo: principalWolo * MICRO,
    wagerCount: input.wagers.length,
  });
}
