import test from "node:test";
import assert from "node:assert/strict";
import {backfillWoloMainnetTransfers} from "../lib/woloMainnetTransfers.ts";
test("multiple-REST-query failure aborts all financial DML before partial credit without ANY financial DB write",async()=>{
 const originalFetch=globalThis.fetch;
 const originalRest=process.env.WOLO_INTERNAL_REST_URL;
 const originalRPC=process.env.WOLO_INTERNAL_RPC_URL;
 const calls:string[]=[];
 let reads=0,writes=0;
 process.env.WOLO_INTERNAL_RPC_URL="http://127.0.0.1:26657";
 process.env.WOLO_INTERNAL_REST_URL="http://127.0.0.1:1318";
 const fakeDB=new Proxy({},{
  get(_target,key){
   if(key==="woloIndexedTransfer"){
    return {create:async()=>{writes++;throw Error("NO_FINANCIAL_WRITES")},
      update:async()=>{writes++;throw Error("NO_FINANCIAL_WRITES")},
      findFirst:async()=>{reads++;return null;}};
   }
   return {findMany:async()=>{reads++;return [];}};
  },
 });
 globalThis.fetch=(async(input:RequestInfo|URL)=>{
  const url=String(input);
  calls.push(url);
  if(url.endsWith("/status"))
   return new Response(JSON.stringify({result:{
    node_info:{network:"wolo-1"},sync_info:{latest_block_height:"2879083"}}}),{status:200});
  // Global search succeeds with one otherwise-creditable real-format
  // bank-send message; the next wallet query fails. Old source would have
  // written the successful transaction and *then* returned ok:false.
  if(url.includes("message.action") && !url.includes("transfer.sender") &&
     !url.includes("transfer.recipient"))
   return new Response(JSON.stringify({tx_responses:[{
    txhash:"A".repeat(64),height:"2870000",code:0,
    timestamp:"2026-11-08T20:30:00Z",
    tx:{body:{memo:"fixture-transfer",
     messages:[{"@type":"/cosmos.bank.v1beta1.MsgSend",
       from_address:"wolo1"+"a".repeat(45),
       to_address:"wolo1"+"b".repeat(45),
       amount:[{denom:"uwolo",amount:"1000000"}]}]}}
   }]}),{status:200});
  return new Response(JSON.stringify({code:503,message:"native_temporarily_unavailable"}),{status:200});
 }) as typeof fetch;
 try{
  const result=await backfillWoloMainnetTransfers(fakeDB as never,{
   addressLimit:1,perAddressLimit:1,globalLimit:1,blockLimit:20000});
  assert.equal(result.ok,false);
  assert.ok(result.errors.length>0);
  assert.ok(result.queriesAttempted>=2);
  assert.equal(result.txsSeen,1,"one valid source result exists before another fails");
  assert.equal(result.created,0);
  assert.equal(result.updated,0);
  assert.equal(result.transfersParsed,0);
  assert.equal(writes,0);
  assert.ok(reads>0);
  assert.ok(calls.some(x=>x.includes("/cosmos/tx/v1beta1/txs")));
 }finally{
  globalThis.fetch=originalFetch;
  if(originalRest===undefined)delete process.env.WOLO_INTERNAL_REST_URL;
  else process.env.WOLO_INTERNAL_REST_URL=originalRest;
  if(originalRPC===undefined)delete process.env.WOLO_INTERNAL_RPC_URL;
  else process.env.WOLO_INTERNAL_RPC_URL=originalRPC;
 }
});
