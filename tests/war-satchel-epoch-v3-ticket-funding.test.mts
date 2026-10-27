import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectEpochV3TicketFunding} from "../lib/warSatchelEpochV3TicketFunding.ts";
const epoch="epoch_20261026_scope_1",txHash="B".repeat(64);
const basic=()=>({chainId:"wolo-1" as const,epochId:epoch,ownerUid:"warrior:alpha",
  ticketId:200,operationId:"satchel:e3:"+epoch+":200",txHash,messageIndex:0,
  totalUwolo:"200000000",legs:[
    {marketId:77,legId:11,amountUwolo:"100000000"},
    {marketId:78,legId:12,amountUwolo:"100000000"}]});
test("one physically funded 2-leg ticket does not double-consume original bank MsgSend",()=>{
 const v=inspectEpochV3TicketFunding(basic());
 assert.equal(v.economicLegs.length,2);
 assert.equal(v.onePhysicalFundingReceipt,"wolo-1:"+txHash+":0");
 assert.equal(v.totalFundingUwolo,"200000000");
 assert.equal(v.economicLegs[0].principalUwolo,"100000000");
 assert.equal(v.economicLegs[1].principalUwolo,"100000000");
 assert.notEqual(v.economicLegs[0].economicKey,v.economicLegs[1].economicKey);
 assert.equal(v.fundingConsumedOnce,true);
 assert.equal(v.nativePhysicalProofAuthenticated,false);
 assert.equal(v.financialCreditAuthorized,false);
});
test("no over-allocation, incomplete refund, or duplicate economic legs",()=>{
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),legs:[
   {marketId:77,legId:11,amountUwolo:"100000000"},
   {marketId:77,legId:11,amountUwolo:"100000000"}]}),/duplicated_economic_leg/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),legs:[
   {marketId:77,legId:11,amountUwolo:"100000000"}]}),/legs_do_not_conserve_original_ticket/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),legs:[
   {marketId:77,legId:11,amountUwolo:"101000000"},
   {marketId:78,legId:12,amountUwolo:"100000000"}]}),/legs_do_not_conserve_original_ticket/);
});
test("legacy operation/cross-epoch and wrong MsgSend ordinal rejected",()=>{
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),operationId:"satchel:claim-return:889"}),/invalid_original_ticket/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),epochId:"epoch_20261026_other"}),/invalid_original_ticket/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),messageIndex:1}),/invalid_original_ticket/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),txHash:"not-final"}),/invalid_original_ticket/);
});
test("single 10000 WOLO ticket allowed; 10001, too many legs and fractional amount rejected",()=>{
 const ok=inspectEpochV3TicketFunding({...basic(),totalUwolo:"10000000000",
   legs:[{marketId:77,legId:11,amountUwolo:"10000000000"}]});
 assert.equal(ok.totalFundingUwolo,"10000000000");
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),totalUwolo:"10001000000",
   legs:[{marketId:77,legId:11,amountUwolo:"10001000000"}]}),/ticket_principal_cap/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),legs:[]}),/missing_or_unbounded_legs/);
 assert.throws(()=>inspectEpochV3TicketFunding({...basic(),legs:[
   {marketId:77,legId:11,amountUwolo:"100000001"},
   {marketId:78,legId:12,amountUwolo:"99999999"}]}),/leg_amount_not_whole_wolo/);
});
