import assert from "node:assert/strict";
import test from "node:test";
import {
  freshSatchelClaimId, nativeReturnIdentity, submitFreshNativeReturnOnce,
  recoverFreshNativeReturn, type NativeAttemptIdentity,
} from "../lib/warSatchelNativeOnlyReturn.ts";

const CLAIM="900000000001";
const NOW=Math.floor(Date.now()/1000);
const approval=(claim=CLAIM)=>({
 version:2,ticket_id:"41",market_id:"77",leg_id:"winner",
 entitlement_id:"new-ticket-41-winner",operation_id:"satchel:ticket:41",
 claim_id:claim,owner_id:"fresh-owner-uid",claim_kind:"bet_payout",
 amount_uwolo:"1000000",allocation_digest:"a".repeat(64),
 issued_at:NOW-15,expires_at:NOW+65,
 allocation:{allocation_id:"new-escrow-41",funding_tx_hash:"B".repeat(64)},
 signature:"signed-by-independent-reviewed-owner-key",
});
const unknown=(id=CLAIM,hash?:string)=>JSON.stringify({
 operation_id:"satchel:claim-return:"+id,status:"UNKNOWN",
 reason:"broadcast_accepted_unconfirmed",durable_fenced:true,
 ...(hash?{tx_hash:hash}:{}),
});
function journal() {
 const rows=new Map<string,NativeAttemptIdentity>();
 let calls=0;
 return {
  get calls(){return calls}, rows,
  async insertOnce(id:NativeAttemptIdentity){
   calls++;
   const previous=rows.get(id.operationKey);
   if(previous){
    if(JSON.stringify(previous)!==JSON.stringify(id))throw Error("IMMUTABLE_CONFLICT");
    return false;
   }
   rows.set(id.operationKey,id);
   return true;
  },
 };
}
function mock(fn:(url:string,init:RequestInit)=>Response|Promise<Response>) {
 const calls:Array<{url:string;method:string}>=[];
 const reader=async (input:URL|RequestInfo,init?:RequestInit)=>{
  const url=String(input),method=init?.method||"GET";
  calls.push({url,method});
  assert.ok(url.startsWith("http://127.0.0.1:8094/satchel/v1/returns/"));
  assert.equal(init?.redirect,"error");
  return fn(url,init||{});
 };
 return {calls,reader:reader as typeof fetch};
}
const token="T".repeat(64);
test("fresh ID is a disjoint 12-digit native namespace, never old payout",()=>{
 assert.equal(freshSatchelClaimId(CLAIM),CLAIM);
 for(const id of ["889","9645","69","1000","0","-1","99999999999",
   "1000000000000","9999999999999","0900000000001","900000000000","1200.1"]) {
  assert.throws(()=>freshSatchelClaimId(id),/fresh_claim_namespace_required/);
 }
});
test("one durable attempt before exactly one POST, then GET on duplicate",async()=>{
 const db=journal();const m=mock(()=>new Response(unknown(),{status:200}));
 const first=await submitFreshNativeReturnOnce(approval(),token,db,m.reader);
 const second=await submitFreshNativeReturnOnce(approval(),token,db,m.reader);
 assert.equal(first.state,"unknown_hold");
 assert.equal(first.creditAuthorized,false);
 assert.equal(second.broadcastPermitted,false);
 assert.equal(db.rows.size,1);
 assert.deepEqual(m.calls.map(v=>v.method),["POST","GET"]);
 assert.equal(m.calls[0].url,"http://127.0.0.1:8094/satchel/v1/returns/execute");
 assert.equal(m.calls[1].url,"http://127.0.0.1:8094/satchel/v1/returns/execution/"+CLAIM);
});
test("crash after durable INSERT is recovery-only; zero POST",async()=>{
 const db=journal(),identity=nativeReturnIdentity(approval());
 await db.insertOnce(identity);
 const m=mock(()=>new Response(unknown(CLAIM,"A".repeat(64))));
 const result=await submitFreshNativeReturnOnce(approval(),token,db,m.reader);
 assert.deepEqual(m.calls.map(x=>x.method),["GET"]);
 assert.equal(result.candidateTxHash,"A".repeat(64));
 assert.equal(result.creditAuthorized,false);
});
test("timeout AFTER ambiguous broadcast receives one GET, no rebroadcast",async()=>{
 const db=journal(),m=mock((u,init)=>{
  if(init.method==="POST")throw Error("ECONNRESET_AFTER_BROADCAST");
  return new Response(unknown(CLAIM,"F".repeat(64)),{status:200});
 });
 const result=await submitFreshNativeReturnOnce(approval(),token,db,m.reader);
 assert.deepEqual(m.calls.map(x=>x.method),["POST","GET"]);
 assert.equal(result.candidateTxHash,"F".repeat(64));
 assert.equal(result.creditAuthorized,false);
});
test("timeout and 404 recovery never authorize a second POST",async()=>{
 const db=journal(),m=mock((u,init)=>init.method==="POST"?
  new Response("unavailable",{status:503}):new Response("missing",{status:404}));
 for(let n=0;n<3;n++){
  const v=await submitFreshNativeReturnOnce(approval(),token,db,m.reader);
  assert.equal(v.candidateTxHash,null);
  assert.equal(v.state,"unknown_hold");
 }
 assert.deepEqual(m.calls.map(x=>x.method),["POST","GET","GET","GET"]);
});
test("concurrent same-operation attempt creates one POST",async()=>{
 const db=journal(),m=mock(()=>new Response(unknown(CLAIM),{status:200}));
 const both=await Promise.all(Array.from({length:16},()=>submitFreshNativeReturnOnce(approval(),token,db,m.reader)));
 assert.equal(m.calls.filter(x=>x.method==="POST").length,1);
 assert.equal(m.calls.filter(x=>x.method==="GET").length,15);
 assert.equal(both.every(v=>v.state==="unknown_hold"),true);
});
test("different signed approval for same operation conflicts; no second POST",async()=>{
 const db=journal(),m=mock(()=>new Response(unknown(CLAIM),{status:200}));
 await submitFreshNativeReturnOnce(approval(),token,db,m.reader);
 const conflict={...approval(), amount_uwolo:"2000000"};
 const r=await submitFreshNativeReturnOnce(conflict,token,db,m.reader);
 assert.equal(r.creditAuthorized,false);
 assert.equal(r.candidateTxHash,null);
 assert.deepEqual(m.calls.map(x=>x.method),["POST"]);
});
test("failed local durable attempt never sends network request",async()=>{
 const m=mock(()=>{throw Error("never");});
 const r=await submitFreshNativeReturnOnce(approval(),token,{insertOnce:async()=>{throw Error("DB_LOST_COMMIT_ACK");}},m.reader);
 assert.equal(r.state,"unknown_hold");
 assert.equal(m.calls.length,0);
});
test("malformed reply, duplicate keys, wrong operation, zero hash all fail closed",async()=>{
 for(const raw of [
  '{"operation_id":"satchel:claim-return:'+CLAIM+'","status":"UNKNOWN","status":"UNKNOWN","reason":"broadcast_uncertain","durable_fenced":true}',
  unknown("900000000002"),unknown(CLAIM,"0".repeat(64)),
  '{"operation_id":"satchel:claim-return:'+CLAIM+'","status":"SUCCESS","reason":"intent_persisted","durable_fenced":true}',
  JSON.stringify({operation_id:"satchel:claim-return:"+CLAIM,status:"UNKNOWN",reason:"exploited",durable_fenced:true}),
 ]) {
  const m=mock(()=>new Response(raw,{status:200}));
  const r=await recoverFreshNativeReturn(CLAIM,token,m.reader);
  assert.equal(r.candidateTxHash,null);
  assert.equal(r.state,"unknown_hold");
  assert.deepEqual(m.calls.map(x=>x.method),["GET"]);
 }
});
test("invalid claim and token deny before journal or network",async()=>{
 const m=mock(()=>new Response(unknown(),{status:200})),db=journal();
 await assert.rejects(submitFreshNativeReturnOnce(approval("889"),token,db,m.reader),/fresh_claim_namespace_required/);
 await assert.rejects(submitFreshNativeReturnOnce(approval(),"bad",db,m.reader),/dedicated_8094_private_token_required/);
 assert.equal(db.calls,0);assert.equal(m.calls.length,0);
});
test("no legacy transport or signer key read in the source", async()=>{
 const {readFileSync}=await import("node:fs");
 const source=readFileSync(new URL("../lib/warSatchelNativeOnlyReturn.ts",import.meta.url),"utf8");
 for(const forbidden of ["127.0.0.1:8092","127.0.0.1:8093","/settlement/v1/runs",
     "execSync","privateKey","mnemonic","broadcastTx","retryPost"]) {
  assert.equal(source.includes(forbidden),false,forbidden);
 }
 assert.equal(source.includes("127.0.0.1:8094"),true);
});

test("new native return leaves original funded journal Prisma columns compatible with a 13-migration database", async()=>{
 const {readFileSync}=await import("node:fs");
 const schema=readFileSync(new URL("../prisma/schema.prisma",import.meta.url),"utf8");
 const block=schema.match(/model SatchelFundedJournal \{([\s\S]*?)\n\}/)?.[1]||"";
 assert.ok(block.includes("claimReturnId"));
 assert.ok(block.includes("receiptId"));
 assert.ok(!block.includes("nativeReturnCreditId"));
 const migration=readFileSync(new URL("../prisma/migrations/20261108_212700_c02_native_forward_only_returns/migration.sql",import.meta.url),"utf8");
 assert.ok(migration.includes("'native_return_credit'"));
 assert.ok(migration.includes("C02_NATIVE_JOURNAL_NOT_BOUND_TO_ORIGINAL_CREDIT"));
 assert.ok(!migration.includes("ADD COLUMN native_return_credit_id"));
});
