/**
 * Explicitly isolated C02 wire test against the REAL WoloChain private
 * HTTP handler with an INERT no-key backend on Mac loopback 8094.
 * This tests bytes/routes/auth/UNKNOWN behavior only: not a funded canary.
 * Harness is not committed or installed on HEL1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { nativeReturnIdentity, submitFreshNativeReturnOnce, recoverFreshNativeReturn,
  type NativeAttemptIdentity } from "../lib/warSatchelNativeOnlyReturn.ts";

const url="http://127.0.0.1:8094";
const token="T".repeat(64);
const claimId="900000000001";
const issued=Math.floor(Date.now()/1000);
const approval={
 version:2,ticket_id:"41",market_id:"77",leg_id:"winner",
 entitlement_id:"fresh-41-winning-leg",operation_id:"satchel:ticket:41",
 claim_id:claimId,owner_id:"new-owner-uid",
 claim_kind:"bet_payout",amount_uwolo:"1000000",
 allocation_digest:"a".repeat(64),
 issued_at:issued-15,expires_at:issued+60,
 allocation:{version:2,allocation_id:"fresh-funded-wager-41"},
 signature:"test-only-no-private-key-exists",
};
const journal=new Map<string,NativeAttemptIdentity>();
const requestLog: Array<{url:string;method:string}>=[];
const wrappedFetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const target=String(input);
 assert.ok(target.startsWith(url+"/satchel/v1/returns/"));
 requestLog.push({url:target,method:init?.method||"GET"});
 return fetch(input,init);
};
const reader=wrappedFetch as typeof fetch;
async function counters(){
 const response=await fetch(url+"/__test/c02-wire-counts");
 assert.equal(response.status,200,"actual WoloChain HTTP test handler is required");
 return response.json() as Promise<{post:number;get:number}>;
}
test("cross-process App -> actual Chain native 8094 handler, original-op recovery only",{skip:process.env.C02_INERT_GO_HTTP_WIRE_TEST!=="true"},async()=>{
 const initial=await counters();
 assert.equal(initial.post,0,"one isolated handler must start clean");
 const j={insertOnce:async(identity:NativeAttemptIdentity)=>{
  const previous=journal.get(identity.operationKey);
  if(previous){
   assert.deepEqual(previous,identity);
   return false;
  }
  journal.set(identity.operationKey,identity);
  return true;
 }};
 assert.deepEqual(nativeReturnIdentity(approval).operationKey,
   "satchel:claim-return:"+claimId);
 const first=await submitFreshNativeReturnOnce(approval,token,j,reader);
 assert.equal(first.state,"unknown_hold");
 assert.equal(first.creditAuthorized,false);
 assert.equal(first.broadcastPermitted,false);
 assert.equal(first.candidateTxHash,"F".repeat(64));
 const second=await submitFreshNativeReturnOnce(approval,token,j,reader);
 assert.equal(second.state,"unknown_hold");
 assert.equal(second.creditAuthorized,false);
 assert.deepEqual(requestLog.map(x=>x.method),["POST","GET"]);
 assert.deepEqual(requestLog.map(x=>new URL(x.url).port),["8094","8094"]);
 const after=await counters();
 assert.equal(after.post-initial.post,1);
 assert.equal(after.get-initial.get,1);
 const missing=await recoverFreshNativeReturn("900000000002",token,reader);
 assert.equal(missing.state,"unknown_hold");
 assert.equal(missing.candidateTxHash,null);
 assert.equal((await counters()).post,1);
 assert.equal(journal.size,1);
});
