import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../lib/generated/prisma/index.js";
import {readWarSatchelClaimPartitionCensus} from "../lib/warSatchelClaimPartitionCensus.ts";

const vault="wolo1"+"v".repeat(38);
const h1="AB".repeat(32),h2="CD".repeat(32);
const claim={
  id:88,claimedByUserId:17,status:"claimed",sourceMarketId:7,
  claimKind:"bet_payout",amountWolo:44,
};
const wager=(i:number,stake:number,due:number,tx:string)=>({
  id:40+i,amountWolo:stake,payoutWolo:due,status:"won",
  stakeLeg:{
    id:60+i,marketId:7,amountWolo:stake,
    ticket:{
      id:100+i,userId:17,source:"auto",walletProvider:"satchel-vault",
      walletAddress:vault,status:"recorded",stakeTxHash:tx,
      clientRequestId:"satchel:ticket:"+(80+i),
      totalAmountWolo:stake+5,
    },
  },
});
const wagers=[wager(1,10,14,h1),wager(2,20,30,h2)];
const reservations=wagers.map(w=>({
  ticketId:w.stakeLeg.ticket.id,ownerUserId:17,status:"committed",
  txHash:w.stakeLeg.ticket.stakeTxHash,
  ticketRequestId:w.stakeLeg.ticket.clientRequestId,
  amountUwolo:BigInt(w.stakeLeg.ticket.totalAmountWolo)*BigInt(1_000_000),
}));
const args={claimId:88,ownerUserId:17,vaultAddress:vault};
const fullTicketLegs=wagers.flatMap(w=>[
  {
    id:w.stakeLeg.id,
    ticketId:w.stakeLeg.ticket.id,
    marketId:7,amountWolo:w.amountWolo,
    wager:{
      id:w.id,userId:17,marketId:7,stakeLegId:w.stakeLeg.id,
      amountWolo:w.amountWolo,status:"won",executionMode:"onchain_escrow",
    },
  },
  {
    id:200+w.id,
    ticketId:w.stakeLeg.ticket.id,marketId:700+w.id,amountWolo:5,
    wager:{
      id:500+w.id,userId:17,marketId:700+w.id,stakeLegId:200+w.id,
      amountWolo:5,status:"active",executionMode:"onchain_escrow",
    },
  },
]);
type Fixture=Readonly<{
  claim?:Record<string,unknown>|null;
  wagers?:readonly typeof wagers[number][];
  reservations?:readonly typeof reservations[number][];
  legs?:readonly typeof fullTicketLegs[number][];
}>;
function mock(opts:Fixture={}):PrismaClient {
  const rows={claim:opts.claim===undefined?claim:opts.claim,
    wagers:opts.wagers??wagers,reservations:opts.reservations??reservations,
    legs:opts.legs??fullTicketLegs};
  const tx={
    pendingWoloClaim:{async findUnique(){return rows.claim;}},
    betWager:{async findMany(){return rows.wagers;}},
    satchelFundedReservation:{async findMany(){return rows.reservations;}},
    betStakeLeg:{async findMany(){return rows.legs;}},
  };
  return {
    async $transaction(action:unknown){
      if(typeof action!=="function")throw Error("ONLY_CALLBACK_TRANSACTION_SUPPORTED");
      return action(tx);
    },
  } as unknown as PrismaClient;
}
test("read-only census binds two market contributions to separately committed vault tickets",async()=>{
  const result=await readWarSatchelClaimPartitionCensus(mock(),args);
  assert.equal(result.sourceClaimId,88);
  assert.equal(result.ownerUserId,17);
  assert.equal(result.disposition,"new_claim_identities_required");
  assert.equal(result.totalReturnUwolo,BigInt(44_000_000));
  assert.deepEqual(result.contributions.map(c=>c.ticketId),[101,102]);
  assert.equal(result.originalReservationsMatched,true);
  assert.equal(result.fullTicketSourceReview.fullTicketSourceLegPartitionVerified,true);
  assert.deepEqual(result.fullTicketSourceReview.tickets.map(t=>t.legCount),[2,2]);
  assert.equal(result.fullTicketSourceReview.signerAuthorizationGranted,false);
  assert.equal(result.sourceSnapshot,"database_repeatable_read_only");
  assert.equal(result.chainProofAuthorized,false);
  assert.equal(result.escrowExecutionAuthorized,false);
  assert.equal(result.creditAuthorized,false);
});
test("unassigned, foreign-owner, wrong-kind or non-final claims never become custody allocations",async()=>{
  const failed=[null,
    {...claim,claimedByUserId:null},
    {...claim,claimedByUserId:99},
    {...claim,status:"pending"},
    {...claim,claimKind:"founders_bonus"},
    {...claim,sourceMarketId:null},
  ];
  for(const bad of failed){
    await assert.rejects(readWarSatchelClaimPartitionCensus(mock({claim:bad}),args),
      /claim_not_assigned_exact_owner_or_unsupported/);
  }
});
test("full original funding reservation, amount and hash must match each claimed ticket",async()=>{
  const wrong=[
    {...reservations[0],ownerUserId:99},
    {...reservations[0],status:"unknown_hold"},
    {...reservations[0],txHash:"EF".repeat(32)},
    {...reservations[0],ticketRequestId:"satchel:ticket:987"},
    {...reservations[0],amountUwolo:BigInt(1_000_000)},
  ];
  for(const bad of wrong) {
    await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
      reservations:[bad,reservations[1]],
    }),args),/funded_ticket_reservation_owner_or_amount_mismatch/);
  }
  await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
    reservations:[reservations[0]],
  }),args),/uncommitted_or_missing_original_reservation/);
});
test("an onchain record is not enough without original per-ticket owner evidence",async()=>{
  const altered={...wagers[0],
    stakeLeg:{...wagers[0].stakeLeg,ticket:{
      ...wagers[0].stakeLeg.ticket,totalAmountWolo:100,
    }},
  };
  await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
    wagers:[altered,wagers[1]],
  }),args),/funded_ticket_reservation_owner_or_amount_mismatch/);
});
test("refuse market claim totals that omit or misattribute a ticket",async()=>{
  await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
    wagers:[wagers[0]],
  }),args),/source_claim_not_exact_total_entitlement/);
  await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
    wagers:[{...wagers[0],stakeLeg:{
      ...wagers[0].stakeLeg,ticket:{
        ...wagers[0].stakeLeg.ticket,walletProvider:"keplr",
      },
    }},wagers[1]],
  }),args),/unverified_wager_leg_owner_or_original_funding/);
});

test("incomplete second-market source evidence cannot masquerade as a complete return allocation",async()=>{
  await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
    legs:fullTicketLegs.filter(l=>l.ticketId!==101||l.marketId===7),
  }),args),/full_ticket_principal_does_not_equal_funding/);
  await assert.rejects(readWarSatchelClaimPartitionCensus(mock({
    legs:fullTicketLegs.map(l=>l.id===fullTicketLegs[1].id
      ? {...l,wager:{...l.wager,userId:999}}
      : l),
  }),args),/missing_duplicate_or_untrusted_ticket_leg/);
});
