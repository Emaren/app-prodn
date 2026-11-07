import assert from "node:assert/strict";
import test from "node:test";
import { verifyCanonicalSatchelClaimReturn } from "../lib/warSatchelCanonicalClaimReturn.ts";

const vault="wolo1"+"v".repeat(38);
const escrow="wolo1"+"p".repeat(38);
const hash="EF".repeat(32);
const claimId=88321;
const memo="aoe2war/satchel/claim-return/v1/"+claimId;
const status={result:{node_info:{network:"wolo-1"},sync_info:{
  catching_up:false,latest_block_height:"702",
}}};
function tx(input:{
  to?:string,from?:string,amount?:string,denom?:string,memo?:string,
  messages?:number,height?:string,code?:number,
}={}){
  const send={"@type":"/cosmos.bank.v1beta1.MsgSend",
    from_address:input.from??escrow,to_address:input.to??vault,
    amount:[{amount:input.amount??"25000000",denom:input.denom??"uwolo"}]};
  return {tx_response:{txhash:hash,code:input.code??0,height:input.height??"700",
    tx:{body:{memo:input.memo??memo,
      messages:Array.from({length:input.messages??1},()=>send)}}}};
}
const base={claimId,claimKind:"bet_refund" as const,txHash:hash,
 escrowAddress:escrow,vaultAddress:vault,
 amountUwolo:"25000000",chainStatus:status,txResponse:tx()};
test("one 3-confirmed full unmatched refund to unique vault is chain evidence",()=>{
  const result=verifyCanonicalSatchelClaimReturn(base);
  assert.equal(result.amountUwolo,BigInt(25000000));
  assert.equal(result.claimId,88321);
  assert.equal(result.canonicalHeight,BigInt(700));
  assert(Object.isFrozen(result));
});
test("refund amount must equal full exact claim (no 2 percent or any fee)",()=>{
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({amount:"24500000"}),
  }),/return_amount_mismatch/);
});
test("an unrelated payer or wrong recipient cannot claim return ownership",()=>{
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({to:"wolo1"+"q".repeat(38)}),
  }),/not_escrow_to_exclusive_vault/);
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({from:"wolo1"+"r".repeat(38)}),
  }),/not_escrow_to_exclusive_vault/);
});
test("other claim memo or mixed-denom chain transfer cannot be credited",()=>{
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({memo:"aoe2war/satchel/claim-return/v1/88322"}),
  }),/claim_return_memo_mismatch/);
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({denom:"atom"}),
  }),/return_amount_mismatch/);
});
test("multiple MsgSend recipients or fewer than three blocks is not canonical",()=>{
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({messages:2}),
  }),/multi_message_ambiguous_return/);
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({height:"701"}),
  }),/unconfirmed_chain_transaction/);
});
test("failed transaction or mismatched hash is never a credit",()=>{
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txResponse:tx({code:9}),
  }),/failed_chain_transaction/);
  assert.throws(()=>verifyCanonicalSatchelClaimReturn({
    ...base,txHash:"AB".repeat(32),
  }),/wrong_tx_hash/);
});
