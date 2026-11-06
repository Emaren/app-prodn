import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import test from "node:test";
import ts from "typescript";

// Tests the real production transport functions in a hermetic JS sandbox.
// There is no network, database, Wolo keyring, or financial authorization.
const src=readFileSync("lib/woloBetSettlement.ts","utf8");
function between(start:string,end:string){
  const a=src.indexOf(start),b=src.indexOf(end,a);
  assert.ok(a>=0&&b>a, "reviewed native source function was not found");
  return src.slice(a,b);
}
const execution=between("export async function executeServiceOnlySatchelEscrowReturn(","/** Query-free read-only recovery");
const recovery=between("export async function inspectServiceOnlySatchelEscrowReturn(","export async function verifyStakeTransfer(");
const compiled=ts.transpileModule(
  'const SATCHEL_RETURN_ENDPOINT="http://127.0.0.1:8094/satchel/v1/returns";\n'+execution+"\n"+recovery,
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}
).outputText;
const escrow="wolo1"+"p".repeat(38);
const approval={version:2,claim_id:"101",owner_id:"synthetic-owner",signature:"synthetic-signature",
  allocation_digest:"a".repeat(64),allocation:{intent:"synthetic-only"}};
const unknown={operation_id:"satchel:claim-return:101",status:"UNKNOWN",reason:"broadcast_uncertain",durable_fenced:true};
type Call={url:string;options:RequestInit};
function harness(){
  const calls:Call[]=[];
  const leases:string[]=[];
  const lease=new AbortController();
  const exports:Record<string,Function>={};
  const sandbox={
    exports,Buffer,AbortSignal,structuredClone,Error,JSON,
    fetch(){throw Error("NETWORK_FORBIDDEN");},
    getWoloBetEscrowRuntime:()=>({escrowAddress:escrow}),
    satchelReturnClaim:(v:unknown)=>{
      if(typeof v!=="string"||!/^([1-9][0-9]{0,11})$/.test(v)||v==="889")throw Error("INVALID_CLAIM");
      return v;
    },
    satchelReturnHeaders:()=>({Authorization:"Bearer synthetic-no-auth"}),
    satchelReturnReply:async(r:{status:number;ok:boolean;json:()=>Promise<unknown>},claimId:string,signal:AbortSignal)=>{
      signal.throwIfAborted();
      if(!r.ok||r.status!==200)throw Error("UNKNOWN");
      const v=await r.json() as Record<string,unknown>;
      if(v.operation_id!=="satchel:claim-return:"+claimId||v.status!=="UNKNOWN"||v.durable_fenced!==true)
        throw Error("UNKNOWN");
      return v;
    },
    withHdFinancialLease:async(input:{scope:string;producer:string;wallet:string},callback:(s:AbortSignal)=>Promise<unknown>)=>{
      assert.deepEqual([input.scope,input.producer,input.wallet],["hd-legacy","settlement-run",escrow]);
      leases.push("signed-lease-mock");
      return callback(lease.signal);
    },
  };
  runInNewContext(compiled,sandbox);
  return {calls,leases,lease,
    execute:exports.executeServiceOnlySatchelEscrowReturn as
      (v:unknown,e:string,f:typeof fetch,c?:AbortSignal)=>Promise<Record<string,unknown>>,
    inspect:exports.inspectServiceOnlySatchelEscrowReturn as
      (id:string,f:typeof fetch)=>Promise<Record<string,unknown>>,
  };
}
function http(value:unknown,status=200){
  return {status,ok:status===200,json:async()=>value} as unknown as Response;
}
test("native execution uses one signed v2 approval POST on 8094, not legacy 8092",async()=>{
  const h=harness();
  const reader=(async(url:string,options:RequestInit)=>{
    h.calls.push({url,options});return http(unknown);
  }) as typeof fetch;
  const got=await h.execute(approval,escrow,reader);
  assert.equal(got.status,"UNKNOWN");
  assert.equal(h.leases.length,1);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].url,"http://127.0.0.1:8094/satchel/v1/returns/execute");
  assert.equal(h.calls[0].options.method,"POST");
  assert.equal(h.calls[0].options.body,JSON.stringify(approval));
  assert.equal(h.calls[0].options.redirect,"error");
  assert.equal(h.calls.some(x=>x.url.includes("8092")),false);
});
test("canceled original parent lease prevents a financial POST even with a fresh nested lease",async()=>{
  const h=harness();let calls=0;
  const canceled=new AbortController();canceled.abort(Error("parent_lease_expired"));
  await assert.rejects(h.execute(approval,escrow,(async()=>{calls++;return http(unknown);}) as typeof fetch,
    canceled.signal));
  assert.equal(calls,0);
});
test("uncertain native POST never retries and never falls back to 8092",async()=>{
  const h=harness();
  const reader=(async(url:string,options:RequestInit)=>{
    h.calls.push({url,options});throw Error("LOST_ACKNOWLEDGMENT");
  }) as typeof fetch;
  await assert.rejects(h.execute(approval,escrow,reader),/LOST_ACKNOWLEDGMENT/);
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].options.method,"POST");
  assert.equal(h.calls.some(x=>x.url.includes("8092")),false);
});
test("recovery calls GET with numeric claim ID only; 404 is UNKNOWN and never causes POST",async()=>{
  const h=harness();
  const reader=(async(url:string,options:RequestInit)=>{
    h.calls.push({url,options});return http({},404);
  }) as typeof fetch;
  await assert.rejects(h.inspect("101",reader),/UNKNOWN/);
  assert.deepEqual(h.calls.map(c=>c.options.method),["GET"]);
  assert.equal(h.calls[0].url,"http://127.0.0.1:8094/satchel/v1/returns/execution/101");
  assert.equal(h.calls.some(x=>x.url.includes("8092")),false);
});
test("malformed approvals are refused before opening lease or sending",async()=>{
  const h=harness();let calls=0;
  const reader=(async()=>{calls++;return http(unknown);}) as typeof fetch;
  await assert.rejects(h.execute({...approval,version:1},escrow,reader),/INVALID_APPROVAL/);
  assert.equal(calls,0);
  assert.equal(h.leases.length,0);
});
