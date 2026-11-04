/** Wire/currentness unit tests. Bank trust is a controlled dependency here;
 * genuine H/H+1, signatures and unchanged-journal checks are exercised by the
 * native SDK TestEscrowCheck suite in Wolo #125. No production authority. */
import assert from "node:assert/strict";
import {Module,createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import test from "node:test";
import ts from "typescript";
import type {SatchelClaimReturnEconomics} from "../lib/warSatchelClaimReturnAuthorization.ts";

const requireOriginal=createRequire(import.meta.url);
const escrow="wolo1"+"p".repeat(38),vault="wolo1"+"q".repeat(38);
function economicsFixture():SatchelClaimReturnEconomics{
  const approval={version:2,claim_id:"101",owner_id:"owner-1",ticket_id:"7",market_id:"501",leg_id:"winner",entitlement_id:"entitlement:101",
    operation_id:"satchel:ticket:7",claim_kind:"bet_payout",amount_uwolo:"5000000",allocation_digest:"c".repeat(64),signature:"fixture-signature",
    allocation:{version:2,operation_id:"satchel:ticket:7",owner_id:"owner-1",ticket_id:"7",funding_tx_hash:"A".repeat(64),
      bank_evidence_digest:"E".repeat(64),funds_budget_id:"fixture-budget"}};
  return {claimId:"101",ownerId:"owner-1",ticketId:"7",marketId:"501",legId:"winner",entitlementId:"entitlement:101",operationId:"satchel:ticket:7",
    claimKind:"bet_payout",amountUwolo:"5000000",principalUwolo:"5000000",stakeUwolo:"5000000",fundedAmountUwolo:"7000000",
    escrowAddress:escrow,vaultAddress:vault,fundingTxHash:"A".repeat(64),approval};
}
function fixture(){
  const bank=Object.freeze({chainId:"wolo-1",denom:"uwolo",vaultAddress:escrow,height:41n,commitHeight:42n,blockHash:"A".repeat(64),appHash:"B".repeat(64),
    balanceUwolo:9000000n,observedAtMs:Date.now(),authenticatedHeadExpiresAtMs:Date.now()+25000});
  const file=resolve("lib/warSatchelClaimReturnReserve.ts"),m=new Module(file);m.filename=file;
  // @ts-expect-error Isolated Node loader only; no production export changes.
  m.paths=Module._nodeModulePaths(dirname(file));
  let bankCalls=0;
  m.require=(name:string)=>{
    if(name==="./warSatchelAuthenticatedBank.ts")return {
      authenticatedWarSatchelBankFreshAt:(value:unknown,now=Date.now())=>value===bank&&now>=bank.observedAtMs&&now<bank.authenticatedHeadExpiresAtMs,
      authenticateWarSatchelEscrowBank:async(address:string)=>{assert.equal(address,escrow);bankCalls++;return bank;},
    };
    return requireOriginal(name.startsWith(".")?resolve(dirname(file),name):name);
  };
  // @ts-expect-error Production bytes are compiled in memory, never rewritten.
  m._compile(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
  const api=m.exports as typeof import("../lib/warSatchelClaimReturnReserve.ts");
  const e=economicsFixture();
  const reply={protocol:1,kind:"escrow_return_execution_check",approval:structuredClone(e.approval),operation_permit_sha256:"d".repeat(64),reserve_review_sha256:"e".repeat(64),
    state_height:41,commit_height:42,commit_block_hash:bank.blockHash,expires_at:Math.floor(Date.now()/1000)+10,execution_authorized:false,credit_authorized:false};
  let calls=0;
  const reader=(body:unknown=reply,status=200,raw?:string)=>(async(url,init)=>{
    calls++;assert.equal(String(url),"http://127.0.0.1:8094/satchel/v1/returns/check-execution");assert.equal(init?.method,"POST");
    assert.equal(init?.redirect,"error");assert.deepEqual(JSON.parse(String(init?.body)),e.approval);
    return raw===undefined?Response.json(body,{status}):new Response(raw,{status,headers:{"Content-Type":"application/json"}});
  }) as typeof fetch;
  return {api,e,bank,reply,reader,calls:()=>({check:calls,bank:bankCalls})};
}
function configure(t:{after:(fn:()=>void)=>void}){const old=process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN;process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN="T".repeat(64);
  t.after(()=>{if(old===undefined)delete process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN;else process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN=old;});}

test("current check binds exact original approval, separate native bank and both authority digests",async t=>{
  configure(t);const f=fixture(),checked=await f.api.inspectCurrentSatchelReturnReserve(f.e,f.reader());
  f.api.assertCurrentSatchelReturnReserve(f.e,checked);
  assert.deepEqual(f.calls(),{check:1,bank:1});assert.equal(checked.binding.currentBankAppHash,f.bank.appHash);
  assert.equal(checked.operationPermitSha256,f.reply.operation_permit_sha256);assert.equal(checked.reserveReviewSha256,f.reply.reserve_review_sha256);
  assert.equal(checked.executionAuthorized,false);assert.equal(checked.creditAuthorized,false);assert.ok(Object.isFrozen(checked));
  assert.throws(()=>f.api.assertCurrentSatchelReturnReserve(f.e,structuredClone(checked)),/native_post_prepare_check_required/);
  assert.throws(()=>f.api.assertCurrentSatchelReturnReserve({...f.e,approval:{changed:true}},checked),/expired_or_changed/);
  assert.throws(()=>f.api.assertCurrentSatchelReturnReserve(f.e,checked,checked.expiresAtMs),/expired_or_changed/);
});

test("pre-prepare imported JSON or complete flags cannot mint a native check",async t=>{
  configure(t);const f=fixture();
  for(const value of [f.reply,{complete:true,covered:true},null,{},structuredClone(f.bank)])
    assert.throws(()=>f.api.assertCurrentSatchelReturnReserve(f.e,value),/native_post_prepare_check_required/);
  assert.deepEqual(f.calls(),{check:0,bank:0});
});

test("expired, foreign or authority-bearing replies never create an admission",async t=>{
  configure(t);
  for(const patch of [{credit_authorized:true},{execution_authorized:true},{state_height:40},{commit_height:43},{commit_block_hash:"F".repeat(64)},
    {operation_permit_sha256:"0".repeat(64)},{reserve_review_sha256:"0".repeat(64)},{expires_at:1},{expires_at:Math.floor(Date.now()/1000)+60},
    {approval:{wrong:"owner"}},{unexpected:true},{state_height:Number.MAX_SAFE_INTEGER+1}]){
    const f=fixture();await assert.rejects(f.api.inspectCurrentSatchelReturnReserve(f.e,f.reader({...f.reply,...patch})),/SATCHEL_CLAIM_RETURN_RESERVE_REFUSED/);
    assert.equal(f.calls().check,1,"a refusal never retries the check or executes");
  }
});

test("duplicate/case aliases, nonfinite data, oversize and missing route stay held",async t=>{
  configure(t);
  for(const kind of ["duplicate","case_alias","nested_duplicate","nonfinite","oversize","404"]){
    const f=fixture(),raw=JSON.stringify(f.reply);
    const bad=kind==="duplicate"?raw.slice(0,-1)+',"protocol":1}':kind==="case_alias"?raw.slice(0,-1)+',"Protocol":1}':
      kind==="nested_duplicate"?raw.replace('"version":2','"version":2,"Version":2'):kind==="nonfinite"?raw.replace('"state_height":41','"state_height":1e999'):
      kind==="oversize"?"x".repeat(65537):undefined;
    await assert.rejects(f.api.inspectCurrentSatchelReturnReserve(f.e,f.reader(f.reply,kind==="404"?404:200,bad)),/SATCHEL_CLAIM_RETURN_RESERVE_REFUSED/);
    assert.deepEqual(f.calls(),{check:1,bank:0});
  }
});
