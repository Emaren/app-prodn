/**
 * Exact-ID, read-only database census of a claimed market return.
 *
 * Uses a repeatable-read snapshot for owner/claim/wager/reservation consistency.
 * This is an OPERATOR REVIEW INPUT ONLY: never calls escrow, a signer, chain
 * RPC, credit functions, or any table mutation. Native chain authentication,
 * escrow funds, withdrawal custody and any new immutable claim IDs remain
 * deliberately outside this module.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { inspectSatchelClaimPartitionPreview } from "./warSatchelClaimPartitionPreview.ts";
import { verifyFullTicketSourcePartition } from "./warSatchelFullTicketSourceReview.ts";

const MAX_WAGERS=1000;
const MICRO=BigInt(1_000_000);
function stop(reason:string):never{
  throw Error("SATCHEL_CLAIM_CENSUS_REFUSED:"+reason);
}
function validId(v:number):boolean{return Number.isSafeInteger(v)&&v>0}

/**
 * The only accepted preview concerns a claim already explicitly assigned
 * to the given owner. Unassigned/unknown claims cannot be attributed merely
 * because someone holds a matching wallet or Steam username.
 */
export async function readWarSatchelClaimPartitionCensus(
  prisma:PrismaClient,
  input:Readonly<{claimId:number;ownerUserId:number;vaultAddress:string}>,
){
  if(!validId(input.claimId)||!validId(input.ownerUserId)||
     typeof input.vaultAddress!=="string"||!input.vaultAddress)
    stop("invalid_exact_claim_owner_or_vault");
  return prisma.$transaction(async tx=>{
    const claim=await tx.pendingWoloClaim.findUnique({
      where:{id:input.claimId},
      select:{
        id:true,claimedByUserId:true,status:true,sourceMarketId:true,
        claimKind:true,amountWolo:true,
      },
    });
    if(!claim||claim.status!=="claimed"||
       claim.claimedByUserId!==input.ownerUserId||
       !validId(claim.sourceMarketId??0)||
       !validId(claim.amountWolo)||
       (claim.claimKind!=="bet_payout"&&claim.claimKind!=="bet_refund")){
      stop("claim_not_assigned_exact_owner_or_unsupported");
    }
    const marketId=claim.sourceMarketId!;
    const claimKind=claim.claimKind;
    const wagers=await tx.betWager.findMany({
      where:{
        marketId,userId:input.ownerUserId,
        status:claimKind==="bet_refund"?"void":"won",
      },
      select:{
        id:true,amountWolo:true,payoutWolo:true,status:true,
        stakeLeg:{select:{
          id:true,marketId:true,amountWolo:true,
          ticket:{select:{
            id:true,userId:true,source:true,walletProvider:true,
            walletAddress:true,status:true,stakeTxHash:true,
            clientRequestId:true,totalAmountWolo:true,
          }},
        }},
      },
      take:MAX_WAGERS+1,
    });
    const preview=inspectSatchelClaimPartitionPreview({
      sourceClaimId:claim.id,
      ownerUserId:input.ownerUserId,
      claimKind,claimAmountWolo:claim.amountWolo,
      marketId,vaultAddress:input.vaultAddress,
      wagers,
    });
    const ticketIds=preview.contributions.map(c=>c.ticketId);
    const reservations=await tx.satchelFundedReservation.findMany({
      where:{ticketId:{in:ticketIds}},
      select:{
        ticketId:true,ownerUserId:true,status:true,
        txHash:true,ticketRequestId:true,amountUwolo:true,
      },
      take:MAX_WAGERS+1,
    });
    if(reservations.length!==ticketIds.length)
      stop("uncommitted_or_missing_original_reservation");
    const reservationsByTicket=new Map(reservations.map(r=>[r.ticketId,r]));
    for(const part of preview.contributions){
      const reservation=reservationsByTicket.get(part.ticketId);
      const first=wagers.find(w=>w.stakeLeg?.ticket?.id===part.ticketId);
      const original=first?.stakeLeg?.ticket;
      if(!reservation||!original||reservation.status!=="committed"||
         reservation.ownerUserId!==input.ownerUserId||
         reservation.ticketId!==part.ticketId||
         reservation.ticketRequestId!==part.operationId||
         reservation.txHash?.toUpperCase()!==part.fundingTxHash||
         !validId(original.totalAmountWolo)||
         reservation.amountUwolo!==BigInt(original.totalAmountWolo)*MICRO||
         reservation.amountUwolo<part.principalUwolo) {
        stop("funded_ticket_reservation_owner_or_amount_mismatch");
      }
    }
    // Inspect ALL source legs, not only the single market in this claim.
    // WoloChain v2 rejects a partial ticket principal partition. This remains
    // a read-only evidence census, not an escrow-run allocation or bank proof.
    const fullTicketLegs=await tx.betStakeLeg.findMany({
      where:{ticketId:{in:ticketIds}},
      select:{
        id:true,ticketId:true,marketId:true,amountWolo:true,
        wager:{select:{
          id:true,userId:true,marketId:true,stakeLegId:true,
          amountWolo:true,status:true,executionMode:true,
        }},
      },
      orderBy:{id:"asc"},
      take:ticketIds.length*16+1,
    });
    const fullTicketSourceReview=verifyFullTicketSourcePartition({
      preview,
      funding:reservations.map(r=>({
        ticketId:r.ticketId??0,amountUwolo:r.amountUwolo,
      })),
      legs:fullTicketLegs,
    });
    return Object.freeze({
      ...preview,
      fullTicketSourceReview,
      originalReservationsMatched:true as const,
      sourceSnapshot:"database_repeatable_read_only" as const,
      chainProofAuthorized:false as const,
      // No claim partition DB writes or escrow execution.
    });
  },{
    isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,
    maxWait:4000,timeout:9000,
  });
}
