/**
 * Read-only, full ORIGINAL ticket-leg accounting for War Satchel return v2.
 *
 * A legacy market claim sees only the winning/refunded wager(s) from ONE
 * market. WoloChain's version-2 allocation requires ALL legs of the original
 * funding transaction to partition its principal exactly. This verifier
 * bridges that distinction without creating claim IDs, return authorities,
 * signer requests, ledger credits or irreversible state.
 */
import type { SatchelClaimPartitionPreview } from "./warSatchelClaimPartitionPreview.ts";

const MICRO=BigInt(1_000_000);
const MAX_TICKETS=1000;
const MAX_LEGS_PER_TICKET=16;
const SETTLED=new Set(["won","lost","void"]);
const VALID=new Set(["active","won","lost","void"]);

export type SatchelFullTicketLeg=Readonly<{
  id:number;
  ticketId:number;
  marketId:number;
  amountWolo:number;
  wager:null|Readonly<{
    id:number;
    marketId:number;
    userId:number;
    stakeLegId:number|null;
    amountWolo:number;
    status:string;
    executionMode:string;
  }>;
}>;
export type SatchelFundingSource=Readonly<{
  ticketId:number;
  amountUwolo:bigint;
}>;
export type SatchelFullTicketReview=Readonly<{
  kind:"non_executing_full_ticket_source_review";
  tickets:readonly Readonly<{
    ticketId:number;
    fundingTxHash:string;
    principalUwolo:bigint;
    legCount:number;
    allLegsTerminal:boolean;
    legs:readonly Readonly<{
      id:number;
      marketId:number;
      wagerId:number;
      stakeUwolo:bigint;
      status:string;
    }>[];
  }>[];
  fullTicketSourceLegPartitionVerified:true;
  distinctReturnClaimIdentitiesVerified:false;
  escrowFundsVerified:false;
  signerAuthorizationGranted:false;
  ledgerCreditAuthorized:false;
}>;
function refuse(reason:string):never{
  throw Error("SATCHEL_FULL_TICKET_REVIEW_REFUSED:"+reason);
}
function id(n:number):boolean{
  return Number.isSafeInteger(n)&&n>0;
}
export function verifyFullTicketSourcePartition(input:Readonly<{
  preview:SatchelClaimPartitionPreview;
  funding:readonly SatchelFundingSource[];
  legs:readonly SatchelFullTicketLeg[];
}>):SatchelFullTicketReview{
  const parts=input.preview.contributions;
  if(input.preview.kind!=="non_executing_claim_partition_preview" ||
     input.preview.escrowExecutionAuthorized!==false ||
     input.preview.creditAuthorized!==false ||
     parts.length<1||parts.length>MAX_TICKETS ||
     input.funding.length!==parts.length ||
     input.legs.length<parts.length||
     input.legs.length>parts.length*MAX_LEGS_PER_TICKET){
    refuse("invalid_or_unbounded_source_review");
  }
  const funding=new Map<number,bigint>();
  for(const source of input.funding){
    if(!id(source.ticketId)||funding.has(source.ticketId)||
       typeof source.amountUwolo!=="bigint"||
       source.amountUwolo<=BigInt(0)||
       source.amountUwolo%MICRO!==BigInt(0))
      refuse("invalid_or_duplicated_funding_source");
    funding.set(source.ticketId,source.amountUwolo);
  }
  const allowedTickets=new Set(parts.map(p=>p.ticketId));
  if(allowedTickets.size!==parts.length||
     funding.size!==allowedTickets.size ||
     [...funding.keys()].some(id=>!allowedTickets.has(id)))
    refuse("funding_ticket_set_mismatch");

  const legsByTicket=new Map<number,SatchelFullTicketLeg[]>();
  const seenLegIds=new Set<number>();
  const seenWagerIds=new Set<number>();
  for(const leg of input.legs){
    const wager=leg.wager;
    if(!id(leg.id)||!id(leg.ticketId)||!id(leg.marketId)||
       !id(leg.amountWolo)||
       !allowedTickets.has(leg.ticketId)||
       seenLegIds.has(leg.id)||
       !wager||!id(wager.id)||seenWagerIds.has(wager.id)||
       wager.userId!==input.preview.ownerUserId||
       wager.marketId!==leg.marketId||
       wager.stakeLegId!==leg.id||
       wager.amountWolo!==leg.amountWolo||
       wager.executionMode!=="onchain_escrow"||
       !VALID.has(wager.status)){
      refuse("missing_duplicate_or_untrusted_ticket_leg");
    }
    seenLegIds.add(leg.id);
    seenWagerIds.add(wager.id);
    const bucket=legsByTicket.get(leg.ticketId)??[];
    bucket.push(leg);
    legsByTicket.set(leg.ticketId,bucket);
  }
  const reviews:SatchelFullTicketReview["tickets"][number][]=[];
  for(const part of parts){
    const ticketLegs=legsByTicket.get(part.ticketId)??[];
    if(ticketLegs.length<1||ticketLegs.length>MAX_LEGS_PER_TICKET ||
       !funding.has(part.ticketId))
      refuse("original_ticket_leg_census_incomplete");
    const seenMarkets=new Set<number>();
    let total=BigInt(0);
    for(const leg of ticketLegs){
      if(seenMarkets.has(leg.marketId))refuse("duplicated_ticket_market_leg");
      seenMarkets.add(leg.marketId);
      total+=BigInt(leg.amountWolo)*MICRO;
    }
    if(total!==funding.get(part.ticketId))
      refuse("full_ticket_principal_does_not_equal_funding");
    // The precise source wager(s) for this claim must be contained in the
    // complete ticket partition, with exact market, IDs and contribution
    // principal. Unrelated/other-market legs cannot be silently omitted.
    const selected=ticketLegs.filter(l=>part.sourceStakeLegIds.includes(l.id));
    if(selected.length!==part.sourceStakeLegIds.length||
       selected.length!==part.sourceWagerIds.length ||
       selected.some(l=>l.marketId!==part.marketId ||
         !part.sourceWagerIds.includes(l.wager!.id))){
      refuse("claimed_market_leg_not_in_original_ticket");
    }
    const selectedPrincipal=selected.reduce((n,l)=>n+BigInt(l.amountWolo)*MICRO,BigInt(0));
    if(selectedPrincipal!==part.principalUwolo)
      refuse("claim_principal_not_exact_original_leg");
    const rows=ticketLegs.slice().sort((a,b)=>a.id-b.id).map(l=>Object.freeze({
      id:l.id,marketId:l.marketId,wagerId:l.wager!.id,
      stakeUwolo:BigInt(l.amountWolo)*MICRO,status:l.wager!.status,
    }));
    reviews.push(Object.freeze({
      ticketId:part.ticketId,
      fundingTxHash:part.fundingTxHash,
      principalUwolo:total,
      legCount:rows.length,
      allLegsTerminal:ticketLegs.every(l=>SETTLED.has(l.wager!.status)),
      legs:Object.freeze(rows),
    }));
  }
  return Object.freeze({
    kind:"non_executing_full_ticket_source_review" as const,
    tickets:Object.freeze(reviews),
    fullTicketSourceLegPartitionVerified:true as const,
    distinctReturnClaimIdentitiesVerified:false as const,
    escrowFundsVerified:false as const,
    signerAuthorizationGranted:false as const,
    ledgerCreditAuthorized:false as const,
  });
}
