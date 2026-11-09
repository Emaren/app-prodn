import assert from "node:assert/strict";
import test from "node:test";
import {inspectSatchelClaimPartitionPreview} from "../lib/warSatchelClaimPartitionPreview.ts";
import {
 verifyFullTicketSourcePartition,type SatchelFullTicketLeg,
} from "../lib/warSatchelFullTicketSourceReview.ts";
import type {SatchelReturnWager} from "../lib/warSatchelClaimReturnAttribution.ts";

const vault="wolo1"+"v".repeat(38);
const tx="AB".repeat(32);
const wager:SatchelReturnWager={
 id:7,amountWolo:10,payoutWolo:14,status:"won",
 stakeLeg:{id:11,marketId:51,amountWolo:10,ticket:{
  id:123,userId:5,source:"auto",walletProvider:"satchel-vault",
  walletAddress:vault,status:"recorded",stakeTxHash:tx,
  clientRequestId:"satchel:ticket:111",
 }},
};
const preview=inspectSatchelClaimPartitionPreview({
 sourceClaimId:88,ownerUserId:5,marketId:51,claimKind:"bet_payout",
 claimAmountWolo:14,vaultAddress:vault,wagers:[wager],
});
const winner:SatchelFullTicketLeg={
 id:11,ticketId:123,marketId:51,amountWolo:10,
 wager:{id:7,userId:5,marketId:51,stakeLegId:11,amountWolo:10,
  executionMode:"onchain_escrow",status:"won"},
};
const desync:SatchelFullTicketLeg={
 id:12,ticketId:123,marketId:52,amountWolo:5,
 wager:{id:8,userId:5,marketId:52,stakeLegId:12,amountWolo:5,
  executionMode:"onchain_escrow",status:"active"},
};
const valid={preview,funding:[{ticketId:123,amountUwolo:BigInt(15_000_000)}],
 legs:[winner,desync]};

test("all original ticket market legs must conserve full bank-funded principal",()=>{
 const result=verifyFullTicketSourcePartition(valid);
 assert.equal(result.kind,"non_executing_full_ticket_source_review");
 assert.equal(result.fullTicketSourceLegPartitionVerified,true);
 assert.deepEqual(result.tickets[0].legs.map(l=>l.marketId),[51,52]);
 assert.equal(result.tickets[0].principalUwolo,BigInt(15_000_000));
 assert.equal(result.tickets[0].legCount,2);
 assert.equal(result.tickets[0].allLegsTerminal,false);
 assert.equal(result.distinctReturnClaimIdentitiesVerified,false);
 assert.equal(result.escrowFundsVerified,false);
 assert.equal(result.signerAuthorizationGranted,false);
 assert.equal(result.ledgerCreditAuthorized,false);
 assert(Object.isFrozen(result)&&Object.isFrozen(result.tickets));
 assert(Object.isFrozen(result.tickets[0].legs));
});
test("source review distinguishes terminal legs from still-open markets",()=>{
 const result=verifyFullTicketSourcePartition({...valid,
  legs:[winner,{...desync,wager:{...desync.wager!,status:"void"}}]});
 assert.equal(result.tickets[0].allLegsTerminal,true);
});
test("cannot silently omit second leg or inflate/short original stake",()=>{
 assert.throws(()=>verifyFullTicketSourcePartition({...valid,legs:[winner]}),
  /full_ticket_principal_does_not_equal_funding/);
 for(const funded of [BigInt(14_000_000),BigInt(16_000_000)]){
  assert.throws(()=>verifyFullTicketSourcePartition({
   ...valid,funding:[{ticketId:123,amountUwolo:funded}],
  }),/full_ticket_principal_does_not_equal_funding/);
 }
});
test("a forged or missing wager never becomes a trusted ticket leg",()=>{
 const invalid:SatchelFullTicketLeg[]=[
  {...desync,wager:null},
  {...desync,wager:{...desync.wager!,userId:99}},
  {...desync,wager:{...desync.wager!,stakeLegId:11}},
  {...desync,wager:{...desync.wager!,executionMode:"app_only"}},
  {...desync,wager:{...desync.wager!,marketId:51}},
  {...desync,wager:{...desync.wager!,status:"claimed"}},
  {...desync,ticketId:999},
 ];
 for(const row of invalid)assert.throws(()=>verifyFullTicketSourcePartition({
  ...valid,legs:[winner,row],
 }),/missing_duplicate_or_untrusted_ticket_leg/);
});
test("duplicated market, leg, wager or unrecognized funding source is refused",()=>{
 const collision:SatchelFullTicketLeg[]=[
  {...desync,marketId:51,wager:{...desync.wager!,marketId:51}},
  {...desync,id:11,wager:{...desync.wager!,stakeLegId:11}},
  {...desync,wager:{...desync.wager!,id:7}},
 ];
 const codes=[
  /duplicated_ticket_market_leg/,
  /missing_duplicate_or_untrusted_ticket_leg/,
  /missing_duplicate_or_untrusted_ticket_leg/,
 ];
 collision.forEach((row,i)=>assert.throws(()=>verifyFullTicketSourcePartition({
  ...valid,legs:[winner,row],
 }),codes[i]));
 assert.throws(()=>verifyFullTicketSourcePartition({
  ...valid,funding:[{ticketId:124,amountUwolo:BigInt(15_000_000)}],
 }),/funding_ticket_set_mismatch/);
});
test("claim's market and source wager must be present in the whole ticket",()=>{
 assert.throws(()=>verifyFullTicketSourcePartition({
  ...valid,legs:[
   {...winner,wager:{...winner.wager!,id:999}},
   desync,
  ],
 }),/claimed_market_leg_not_in_original_ticket/);
 assert.throws(()=>verifyFullTicketSourcePartition({
  ...valid,legs:[{...winner,amountWolo:11,wager:{...winner.wager!,amountWolo:11}},
   {...desync,amountWolo:4,wager:{...desync.wager!,amountWolo:4}}],
 }),/claim_principal_not_exact_original_leg/);
});
