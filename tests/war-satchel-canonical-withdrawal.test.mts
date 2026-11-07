import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectCanonicalSatchelWithdrawal } from "../lib/warSatchelCanonicalWithdrawal.ts";

const id="fd000000-1111-4111-8111-000000000041";
const hash="AB".repeat(32);
const vault="wolo1"+"p".repeat(38);
const owner="wolo1"+"q".repeat(38);
const memo="aoe2war/satchel/withdraw/v1/"+id;
const chainStatus={result:{node_info:{network:"wolo-1"},sync_info:{
  catching_up:false,latest_block_height:"504",
}}};
function tx(from=vault,to=owner,amount="25000000",denom="uwolo",messageCount=1){
 const bank={"@type":"/cosmos.bank.v1beta1.MsgSend",
   from_address:from,to_address:to,amount:[{denom,amount}]};
 return {tx_response:{txhash:hash,code:0,height:"502",tx:{
   body:{memo,messages:Array.from({length:messageCount},()=>bank)},
 }}};
}
const base={
 withdrawalId:id,txHash:hash,vaultAddress:vault,ownerWalletAddress:owner,
 amountUwolo:"25000000",chainStatus,txResponse:tx(),
};
test("confirmed one-owner bank send accepted only as evidence, not authorization",()=>{
 const proof=inspectCanonicalSatchelWithdrawal(base);
 assert.equal(proof.kind,"canonical_satchel_owner_withdrawal");
 assert.equal(proof.recipient,owner);
 assert.equal(proof.amountUwolo,"25000000");
 assert.equal(proof.headHeight,"504");
 assert.equal(proof.confirmedHeight,"502");
 assert(Object.isFrozen(proof));
});
test("unknown recipient or another vault forbidden",()=>{
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:tx(vault,"wolo1"+"r".repeat(38))}),/wrong_payee_or_vault/);
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:tx("wolo1"+"r".repeat(38))}),/wrong_payee_or_vault/);
});
test("denom, amount and multi-message bank sends cannot impersonate a withdrawal",()=>{
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:tx(vault,owner,"24999999")}),/wrong_amount_or_denom/);
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:tx(vault,owner,"25000000","atom")}),/wrong_amount_or_denom/);
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:tx(vault,owner,"25000000","uwolo",2)}),/ambiguous_multi_message_payout/);
});
test("unconfirmed or failed Tx is not proof",()=>{
 const behind={result:{node_info:{network:"wolo-1"},sync_info:{catching_up:false,latest_block_height:"503"}}};
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,chainStatus:behind}),/not_chain_final/);
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:{
   tx_response:{...tx().tx_response,code:8},
 }}),/failed_execution/);
});
test("wrong memo and hash cannot be reused for another request",()=>{
 const other={tx_response:{...tx().tx_response,tx:{body:{memo:"aoe2war/satchel/withdraw/v1/elsewhere",
 messages:tx().tx_response.tx.body.messages}}}};
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txResponse:other}),/memo_does_not_bind_request/);
 assert.throws(()=>inspectCanonicalSatchelWithdrawal({...base,txHash:"CD".repeat(32)}),/hash_mismatch/);
});
