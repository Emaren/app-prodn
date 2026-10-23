/** Caller failure classification only. Policy/PG/SDK authentication is covered
 * by the actual fence and connected lifecycle suites, not these dependencies. */
import assert from "node:assert/strict";
import {Module,createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {resolve,dirname} from "node:path";
import test from "node:test";
import ts from "typescript";
const originalRequire=createRequire(import.meta.url);
const id="10000000-0000-4000-8000-000000000001",operation="satchel:withdrawal:"+id;
const keys=["WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY","WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED","WAR_SATCHEL_SIGNER_CLIENT_ENABLED","WAR_SATCHEL_SIGNER_AUTH_TOKEN","WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS"];
function fixture(mode:"closed"|"commit_ack_lost"|"send_ack_lost"|"database_unavailable"){
  let status="reserved",markCalls=0,sendCalls=0,reconcileCalls=0,admissions=0,observations=0;
  const file=resolve("lib/warSatchelWithdrawalRuntime.ts"),m=new Module(file);m.filename=file;
  // @ts-expect-error Isolated dependency loader only; no production export changes.
  m.paths=Module._nodeModulePaths(dirname(file));
  m.require=(name:string)=>{
    if(name==="./hdFinancialMaintenanceFence.ts")return {withHdFinancialLease:async(_input:unknown,action:(signal:AbortSignal)=>Promise<unknown>)=>{
      admissions++;if(mode==="closed")throw Error("HD_FINANCIAL_FENCE_HELD");return action(new AbortController().signal);
    }};
    if(name==="./warSatchelFinancialBridgeHold.ts")return {requireSatchelFinancialBridge:()=>{}};
    if(name==="./warSatchelFundedLedger.ts")return {markSatchelWithdrawalAttempt:async()=>{
      markCalls++;status="unknown_hold"; // already committed, acknowledgement may be lost
      if(mode==="commit_ack_lost"||mode==="database_unavailable")throw Error("database_commit_acknowledgement_lost");
      return {request:{operation_id:operation}};
    },finalizeProvenSatchelWithdrawal:async()=>{throw Error("not an authenticated confirmation fixture");}};
    return originalRequire(name.startsWith(".")?resolve(dirname(file),name):name);
  };
  // @ts-expect-error The module exists only inside this test process.
  m._compile(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
  const db={satchelFundedWithdrawal:{findUnique:async()=>({id,ownerUserId:1,status})},
    satchelWithdrawalAttempt:{findUnique:async()=>({operationId:operation})},
    satchelWithdrawalObservation:{create:async()=>{observations++;if(mode==="database_unavailable")throw Error("database_unavailable");}}};
  const reader=async(url:RequestInfo|URL)=>{
    if(String(url).endsWith("/v1/satchel/withdrawals")){sendCalls++;throw Error("broadcast_acknowledgement_lost");}
    reconcileCalls++;return Response.json({operation_id:operation,request_id:operation,chain_id:"wolo-1",signer_role:"exclusive-war-satchel-v1",durable_request_fenced:true,status:"UNKNOWN"});
  };
  return {run:()=>m.exports.processCertifiedSatchelWithdrawal(db,id,reader),counts:()=>({markCalls,sendCalls,reconcileCalls,admissions,observations,status})};
}
for(const mode of ["closed","commit_ack_lost","send_ack_lost","database_unavailable"] as const)test("withdrawal maintenance classification: "+mode,async()=>{
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,{WAR_SATCHEL_WITHDRAWAL_EXECUTOR_READY:"true",WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",WAR_SATCHEL_SIGNER_CLIENT_ENABLED:"true",
      WAR_SATCHEL_SIGNER_AUTH_TOKEN:"T".repeat(64),WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:"wolo1"+"p".repeat(38)});
    const f=fixture(mode);
    if(mode==="closed"){
      assert.deepEqual(await f.run(),{state:"release_held"});
      assert.deepEqual(f.counts(),{markCalls:0,sendCalls:0,reconcileCalls:0,admissions:1,observations:0,status:"reserved"});
    }else{
      assert.deepEqual(await f.run(),{state:"unknown_hold"});await f.run();await f.run();
      const c=f.counts();assert.equal(c.markCalls,1);assert.equal(c.admissions,1);assert.equal(c.status,"unknown_hold");
      assert.equal(c.sendCalls,mode==="send_ack_lost"?1:0);assert.equal(c.reconcileCalls,2);
    }
  }finally{for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
