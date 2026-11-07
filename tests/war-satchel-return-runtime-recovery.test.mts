/** Runtime/transport failure classification with isolated dependencies. The
 * native bank/signature authority and real PG fence have separate integration
 * suites; these fixtures confer no financial or production authority. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {Module,createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {dirname,resolve} from "node:path";
import test from "node:test";
import ts from "typescript";

const originalRequire=createRequire(import.meta.url);
const escrow="wolo1"+"p".repeat(38),vault="wolo1"+"q".repeat(38),claimId=101;
const canonical=(x:unknown):string=>Array.isArray(x)?"["+x.map(canonical).join(",")+"]":x&&typeof x==="object"?
  "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical((x as Record<string,unknown>)[k])).join(",")+"}":JSON.stringify(x);
const digest=(x:unknown)=>createHash("sha256").update(canonical(x)).digest("hex");
const flags=["WAR_SATCHEL_CLAIM_RETURN_EXECUTOR_READY","WAR_SATCHEL_RETURN_REVIEW_IMPORT_ENABLED","WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
  "WAR_SATCHEL_SIGNER_CLIENT_ENABLED","WAR_SATCHEL_FUNDED_LEDGER_ENABLED","WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED","WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED","WAR_SATCHEL_CLAIM_RETURN_CREDIT_ENABLED"];
function configure(t:{after:(fn:()=>void)=>void}){
  const names=[...flags,"WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS","WAR_SATCHEL_SIGNER_AUTH_TOKEN"],old=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  for(const flag of flags)process.env[flag]="true";
  process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS=vault;process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN="T".repeat(64);
  t.after(()=>{for(const k of names){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
}
function fixture(mode="normal"){
  const approval={version:2,claim_id:"101",owner_id:"owner-1",ticket_id:"7",market_id:"501",leg_id:"winner",entitlement_id:"entitlement:101",operation_id:"satchel:ticket:7",
    claim_kind:"bet_payout",amount_uwolo:"5000000",allocation_digest:"c".repeat(64),signature:"fixture-signature",
    allocation:{version:2,operation_id:"satchel:ticket:7",owner_id:"owner-1",ticket_id:"7",funding_tx_hash:"A".repeat(64),bank_evidence_digest:"E".repeat(64),funds_budget_id:"fixture-budget"}};
  const e={claimId:"101",ownerId:"owner-1",ticketId:"7",marketId:"501",legId:"winner",entitlementId:"entitlement:101",operationId:"satchel:ticket:7",claimKind:"bet_payout",
    amountUwolo:"5000000",principalUwolo:"5000000",stakeUwolo:"5000000",fundedAmountUwolo:"7000000",escrowAddress:escrow,vaultAddress:vault,fundingTxHash:"A".repeat(64),approval};
  const review={claimId,ownerUserId:8,ownerUid:"owner-1",entitlementId:e.entitlementId,allocationDigest:approval.allocation_digest,economicsJson:e,
    reserveReviewJson:{pre_prepare_audit_only:true},reviewDigest:""};review.reviewDigest=digest({economics:e,reserveReview:review.reserveReviewJson});
  const run={settlement_run_id:"satchel:claim-return:101",source_app:"aoe2hdbets",source_event_id:e.operationId,signer_role:"escrow",
    payouts:[{request_id:"satchel:claim-return:101",to_address:vault,amount_uwolo:e.amountUwolo,memo:"aoe2war/satchel/claim-return/v1/101"}]};
  let attempt:Record<string,unknown>|null=mode==="legacy"?{runId:run.settlement_run_id,requestJson:run,requestDigest:digest(run)}:null;
  const events:string[]=[];let created=0,execute=0,inspects=0,checks=0,proofs=0,credits=0,observations=0,bankValid=true,lost=false;
  const bank={chainId:"wolo-1",denom:"uwolo",vaultAddress:escrow,height:41n,commitHeight:42n,blockHash:"A".repeat(64),appHash:"B".repeat(64),
    observedAtMs:Date.now(),authenticatedHeadExpiresAtMs:Date.now()+25000,balanceUwolo:9000000n};
  const bankModule={authenticatedWarSatchelBankFreshAt:(b:unknown,now=Date.now())=>b===bank&&bankValid&&now>=bank.observedAtMs&&now<bank.authenticatedHeadExpiresAtMs,
    authenticateWarSatchelEscrowBank:async()=>{events.push("bank");return bank;}};
  const tx={
    $executeRaw:async()=>{},
    pendingWoloClaim:{findUnique:async()=>({id:claimId,status:"pending",payoutAttemptedAt:null})},
    satchelClaimReturnExecutionAttempt:{findUnique:async()=>attempt,create:async({data}:{data:Record<string,unknown>})=>{
      if(attempt)throw Error("unique_attempt");events.push("durable_UNKNOWN");created++;attempt=structuredClone(data);return attempt;
    }},
  };
  let queue=Promise.resolve();
  const db={...tx,satchelClaimReturnExecutionReview:{findUnique:async()=>review},
    satchelClaimReturnExecutionObservation:{create:async()=>{observations++;}},
    $transaction:async(action:(value:typeof tx)=>Promise<unknown>)=>{
      const prior=queue;let unlock!:()=>void;queue=new Promise<void>(resolve=>{unlock=resolve;});await prior;
      try{const result=await action(tx);if(mode==="commit_ack_lost"&&attempt&&!lost){lost=true;throw Error("COMMIT_ACK_LOST");}return result;}finally{unlock();}
    },
  };
  const lease={withHdFinancialLease:async(_scope:unknown,action:(signal:AbortSignal)=>Promise<unknown>)=>{
    if(mode==="maintenance")throw Error("HD_FINANCIAL_FENCE_HELD");return action(new AbortController().signal);
  }};
  function compile(rel:string,dependencies:Record<string,unknown>){
    const file=resolve(rel),m=new Module(file);m.filename=file;
    // @ts-expect-error Isolated test dependency loader.
    m.paths=Module._nodeModulePaths(dirname(file));
    m.require=(name:string)=>Object.hasOwn(dependencies,name)?dependencies[name]:originalRequire(name.startsWith(".")?resolve(dirname(file),name):name);
    // @ts-expect-error Exact production source is compiled only in memory.
    m._compile(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
    return m.exports;
  }
  const reserve=compile("lib/warSatchelClaimReturnReserve.ts",{"./warSatchelAuthenticatedBank.ts":bankModule});
  const adapter=compile("lib/woloBetSettlement.ts",{
    "./hdFinancialMaintenanceFence.ts":lease,
    "@/lib/woloChain":{isWoloMainnet:()=>true,getWoloBetEscrowRuntime:()=>({escrowAddress:escrow})},
    "@cosmjs/proto-signing":{DirectSecp256k1HdWallet:{fromMnemonic:()=>{throw Error("LOCAL_SIGNER_FORBIDDEN");}}},
    "@cosmjs/stargate":{SigningStargateClient:{connectWithSigner:()=>{throw Error("LOCAL_SIGNER_FORBIDDEN");}}},
    "./woloPayoutSignerIdentity.ts":{},
  });
  const runtime=compile("lib/warSatchelClaimReturnRuntime.ts",{
    "@/lib/generated/prisma":{Prisma:{TransactionIsolationLevel:{Serializable:"Serializable"}}},"./hdFinancialMaintenanceFence.ts":lease,
    "./warSatchelFinancialBridgeHold.ts":{requireSatchelFinancialBridge:()=>{}},"./warSatchelAuthenticatedBank.ts":bankModule,
    "./warSatchelClaimReturnAuthorization.ts":{loadSatchelClaimReturnEconomics:async()=>{if(mode==="expired_under_lock"&&events.includes("bank"))bankValid=false;return e;},satchelReturnContextFingerprint:digest},
    "./warSatchelAuthenticatedClaimReturn.ts":{authenticateSatchelClaimReturn:async()=>{proofs++;throw Error("NO_AUTHENTICATED_RETURN");},authenticatedWarSatchelClaimReturnFreshAt:()=>false},
    "./warSatchelFundedLedger.ts":{creditVerifiedSatchelClaimReturn:async()=>{credits++;throw Error("RAW_UNKNOWN_NEVER_CREDIT");}},
    "./warSatchelClaimReturnReserve.ts":reserve,"./woloBetSettlement.ts":adapter,"./woloChain.ts":{getWoloBetEscrowRuntime:()=>({escrowAddress:escrow})},
  });
  const unknown={operation_id:run.settlement_run_id,status:"UNKNOWN",reason:"broadcast_started",durable_fenced:true};
  const reader=(async(url:RequestInfo|URL,init?:RequestInit)=>{
    const target=String(url);assert.ok(target.startsWith("http://127.0.0.1:8094/"),"zero legacy8092 calls");
    if(target.endsWith("/prepare")){events.push("prepare");assert.deepEqual(JSON.parse(String(init?.body)),approval);return Response.json({kind:"escrow_run_prepared",run,execution_authorized:false,credit_authorized:false});}
    if(target.endsWith("/check-execution")){checks++;events.push("check");return mode==="check_refused"?Response.json({}, {status:409}):Response.json({protocol:1,kind:"escrow_return_execution_check",approval,
      operation_permit_sha256:"d".repeat(64),reserve_review_sha256:"e".repeat(64),state_height:41,commit_height:42,commit_block_hash:bank.blockHash,
      expires_at:Math.floor(Date.now()/1000)+10,execution_authorized:false,credit_authorized:false});}
    if(target.endsWith("/execute")){execute++;events.push("execute");assert.ok(attempt,"durable fence precedes POST");assert.deepEqual(JSON.parse(String(init?.body)),approval);
      if(mode==="send_ack_lost")throw Error("TRANSPORT_UNKNOWN");return Response.json(mode==="candidate_hash"?{...unknown,tx_hash:"F".repeat(64)}:unknown);}
    if(target.includes("/execution/")){inspects++;assert.equal(init?.method,"GET");assert.ok(target.endsWith("/execution/101"));return Response.json({}, {status:404});}
    if(target.endsWith("/reconcile")){assert.equal(mode,"candidate_hash");return Response.json({});}
    throw Error("UNEXPECTED_ENDPOINT");
  }) as typeof fetch;
  return {run:()=>runtime.processCertifiedSatchelClaimReturn(db,claimId,reader),events,counts:()=>({created,execute,inspects,checks,proofs,credits,observations}),attempt:()=>attempt};
}

test("prepare then current check then durable exact approval then exactly one execute",async t=>{
  configure(t);const f=fixture();assert.deepEqual(await f.run(),{state:"unknown_hold"});
  assert.deepEqual(f.events,["prepare","check","bank","durable_UNKNOWN","execute"]);
  const a=f.attempt()!;assert.equal((a.requestJson as {kind:string}).kind,"satchel_claim_return_8094");
  await f.run();await f.run();assert.equal(f.counts().execute,1);assert.equal(f.counts().checks,1);assert.equal(f.counts().inspects,2);assert.equal(f.counts().credits,0);
});
for(const mode of ["send_ack_lost","commit_ack_lost"]){
  test(mode+" preserves the durable fence; 404 never permits another execute",async t=>{
    configure(t);const f=fixture(mode);assert.deepEqual(await f.run(),{state:"unknown_hold"});await f.run();await f.run();
    assert.equal(f.counts().created,1);assert.equal(f.counts().execute,mode==="send_ack_lost"?1:0);assert.equal(f.counts().checks,1);assert.equal(f.counts().inspects,2);assert.equal(f.counts().credits,0);
  });
}
for(const mode of ["check_refused","expired_under_lock","maintenance"]){
  test(mode+" cannot create an execution attempt or call a signer",async t=>{
    configure(t);const f=fixture(mode);
    assert.deepEqual(await f.run(),{state:mode==="maintenance"?"financial_maintenance_hold":"pre_execution_hold"});
    assert.equal(f.counts().created,0);assert.equal(f.counts().execute,0);assert.equal(f.counts().credits,0);
  });
}
test("legacy attempts retain their original bytes and stay held without any network",async t=>{
  configure(t);const f=fixture("legacy"),before=structuredClone(f.attempt());assert.deepEqual(await f.run(),{state:"legacy_attempt_hold"});assert.deepEqual(f.attempt(),before);
  assert.deepEqual(f.events,[]);assert.equal(f.counts().execute,0);assert.equal(f.counts().inspects,0);
});
test("a raw candidate hash cannot mark a claim paid or credit a ledger",async t=>{
  configure(t);const f=fixture("candidate_hash");assert.deepEqual(await f.run(),{state:"unknown_hold"});assert.equal(f.counts().execute,1);assert.equal(f.counts().proofs,1);assert.equal(f.counts().credits,0);
});
test("concurrent claim workers still create at most one attempt and execution",async t=>{
  configure(t);const f=fixture();await Promise.all(Array.from({length:8},()=>f.run()));assert.equal(f.counts().created,1);assert.equal(f.counts().execute,1);assert.equal(f.counts().credits,0);
});
