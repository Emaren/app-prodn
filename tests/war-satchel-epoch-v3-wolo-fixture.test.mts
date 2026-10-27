import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {inspectEpochV3TicketFunding} from "../lib/warSatchelEpochV3TicketFunding.ts";
import {planNewEpochMarketSettlement} from "../lib/warSatchelNewEpochFinancialContracts.ts";

const f=JSON.parse(readFileSync(new URL("./fixtures/epoch-v3-conserved-ticket-wolo-candidate.json",import.meta.url),"utf8"));
test("HD ↔ Wolo #115 conserved ticket candidate: one physical transfer; multiple independent market legs",()=>{
 assert.equal(f.mainnet_authority,false);
 assert.equal(f.native_go_request_message_bytes,"CODEX_EXPORT_REQUIRED");
 const x=inspectEpochV3TicketFunding({
  chainId:f.funding.chain_id,epochId:f.funding.epoch_id,ownerUid:f.funding.owner_uid,
  operationId:f.funding.operation_id,ticketId:f.funding.ticket_id,
  txHash:f.funding.funding_tx_hash,messageIndex:f.funding.message_index,
  totalUwolo:f.funding.amount_uwolo,
  legs:f.allocations.map((v:{market_id:number;leg_id:number;amount_uwolo:string})=>({
   marketId:v.market_id,legId:v.leg_id,amountUwolo:v.amount_uwolo
  })),
 });
 assert.equal(x.onePhysicalFundingReceipt,f.funding.physical_receipt_key);
 assert.equal(x.totalFundingUwolo,f.assertions.sum_original_ticket_legs_uwolo);
 assert.equal(x.economicLegs.length,2);
 assert.equal(x.financialCreditAuthorized,false);
});
test("the same source ticket settles market77 at matched-only 2%, preserving unresolved market78",()=>{
 const a=f.allocations[0],b=f.opponent;
 const inputs=[a,b].map(v=>({
  wagerId:v.wager_id,marketId:v.market_id,ticketId:v.ticket_id,legId:v.leg_id,
  ownerUid:v.owner_uid,side:v.side,principalWolo:Number(BigInt(v.amount_uwolo)/BigInt(1000000)),
  originalOperationId:"satchel:e3:"+f.funding.epoch_id+":"+v.ticket_id,
  fundingTxHash:v.funding_tx_hash||f.funding.funding_tx_hash,fundingMessageIndex:v.message_index||0,
 }));
 const plan=planNewEpochMarketSettlement({epochId:f.funding.epoch_id,marketId:77,winningSide:"left",wagers:inputs});
 assert.equal(plan.totalFeeUwolo,f.market_77_resolution.fee_uwolo);
 assert.equal(plan.totalReturnUwolo,f.market_77_resolution.return_uwolo);
 assert.deepEqual(plan.entitlements.map(e=>e.entitlementId),f.market_77_resolution.entitlements.map((e:{id:string})=>e.id));
 assert.equal(plan.executionAuthorized,false);
 assert.equal(f.market_78_status,"UNRESOLVED_RESERVED_60000000");
});
