/** Disposable PostgreSQL only. Native responses, bank and claim economics
 * are fixtures. Runtime, adapter, lease registry and DB transactions are real. */
import assert from "node:assert/strict";
import {fork} from "node:child_process";
import {createHash, generateKeyPairSync, sign} from "node:crypto";
import {once} from "node:events";
import {readFileSync} from "node:fs";
import {Module, createRequire} from "node:module";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {Prisma, PrismaClient} from "../lib/generated/prisma/index.js";
import {hdFinancialPermitMessage} from "../lib/hdFinancialMaintenanceFence.ts";
import {startLifecycleDatabase} from "./fixtures/satchel-lifecycle-db.mts";
import ts from "typescript";

const require = createRequire(import.meta.url);
const escrow = "wolo1" + "p".repeat(38), vault = "wolo1" + "q".repeat(38);
const identity = {source: "f".repeat(40), deployment: "e".repeat(64)};
const role = "return_fixture_reader";
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return "{" + Object.keys(object).sort().map(k => JSON.stringify(k)+":"+canonical(object[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");

function economics(id: number) {
  const claimId = String(id), ownerId = "fixture-owner", ticketId = claimId;
  const operationId = "satchel:ticket:"+ticketId, entitlementId = "entitlement:"+claimId;
  const fundingTxHash = "A".repeat(64), amountUwolo = "5000000";
  const approval = {version:2, claim_id:claimId, owner_id:ownerId, ticket_id:ticketId, market_id:"501",
    leg_id:"winner", entitlement_id:entitlementId, operation_id:operationId, claim_kind:"bet_payout", amount_uwolo:amountUwolo,
    allocation_digest:"c".repeat(64), signature:"fixture-signature",
    allocation:{version:2, operation_id:operationId, owner_id:ownerId, ticket_id:ticketId,
      funding_tx_hash:fundingTxHash, bank_evidence_digest:"E".repeat(64), funds_budget_id:"fixture-budget"}};
  return {claimId,ownerId,ticketId,marketId:"501",legId:"winner",entitlementId,operationId,claimKind:"bet_payout",
    amountUwolo,principalUwolo:amountUwolo,stakeUwolo:amountUwolo,fundedAmountUwolo:"7000000",
    escrowAddress:escrow,vaultAddress:vault,fundingTxHash,approval};
}
function compile(rel:string,deps:Record<string,unknown>,edit=(s:string)=>s) {
  const file=resolve(rel), m=new Module(file);
  m.filename=file;
  // @ts-expect-error Test-only loader for source with explicit fixture seams.
  m.paths=Module._nodeModulePaths(dirname(file));
  m.require=(name:string)=>Object.hasOwn(deps,name)?deps[name]:require(name.startsWith(".")?resolve(dirname(file),name):name);
  // @ts-expect-error Production source is compiled only in memory.
  m._compile(ts.transpileModule(edit(readFileSync(file,"utf8")),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file);
  return m.exports;
}
function configure() {
  for(const flag of ["WAR_SATCHEL_CLAIM_RETURN_EXECUTOR_READY","WAR_SATCHEL_RETURN_REVIEW_IMPORT_ENABLED","WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED",
    "WAR_SATCHEL_SIGNER_CLIENT_ENABLED","WAR_SATCHEL_FUNDED_LEDGER_ENABLED","WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED",
    "WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED","WAR_SATCHEL_CLAIM_RETURN_CREDIT_ENABLED"]) process.env[flag]="true";
  process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS=vault;
  process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN="T".repeat(64);
}
function transport(socket:string, db:PrismaClient, publicKey:string, execute:(id:number, signal:AbortSignal)=>Promise<Response>) {
  assert.match(publicKey,/^[a-f0-9]{64}$/);
  assert.match(socket,/^\/(?:private\/)?tmp\/aoe2-satchel-lifecycle-[A-Za-z0-9]+\/socket$/);
  // Replace the production root file reader and TLS dialer with the signed
  // fixture authority and its private socket. The actual lease kernel runs.
  const lease=compile("lib/hdFinancialMaintenanceFence.ts",{pg:{Client:class extends pg.Client {
    constructor(){super({host:socket,user:role,database:"postgres",ssl:false,connectionTimeoutMillis:3000});}
  }}},source=>{
    const start=source.indexOf("async function authority()"),end=source.indexOf("function assertRuntime",start);
    assert.ok(start>=0&&end>start);
    const configured=source.slice(0,start)+"async function authority(){return "+
      JSON.stringify({...identity,publicKey,readerRole:role})+";}\n"+source.slice(end);
    const build=/^const BUILD=.*;$/m;
    assert.match(configured,build);
    return configured.replace(build,"const BUILD="+JSON.stringify(identity)+";");
  });
  const bank={chainId:"wolo-1",denom:"uwolo",vaultAddress:escrow,height:41n,commitHeight:42n,
    blockHash:"A".repeat(64),appHash:"B".repeat(64),observedAtMs:Date.now(),authenticatedHeadExpiresAtMs:Date.now()+60000,balanceUwolo:9000000n};
  const bankModule={authenticatedWarSatchelBankFreshAt:(value:unknown)=>value===bank&&Date.now()<bank.authenticatedHeadExpiresAtMs,
    authenticateWarSatchelEscrowBank:async()=>bank};
  const chain={isWoloMainnet:()=>true,getWoloBetEscrowRuntime:()=>({escrowAddress:escrow})};
  const reserve=compile("lib/warSatchelClaimReturnReserve.ts",{"./warSatchelAuthenticatedBank.ts":bankModule});
  const adapter=compile("lib/woloBetSettlement.ts",{"./hdFinancialMaintenanceFence.ts":lease,
    "@/lib/woloChain":chain,"./woloPayoutSignerIdentity.ts":{},"@cosmjs/proto-signing":{},"@cosmjs/stargate":{}});
  const runtime=compile("lib/warSatchelClaimReturnRuntime.ts",{
    "@/lib/generated/prisma":{Prisma},"./hdFinancialMaintenanceFence.ts":lease,
    "./warSatchelFinancialBridgeHold.ts":{requireSatchelFinancialBridge:()=>{}},
    "./warSatchelAuthenticatedBank.ts":bankModule,
    "./warSatchelClaimReturnAuthorization.ts":{loadSatchelClaimReturnEconomics:async(_tx:unknown,owner:{claimId:number})=>economics(owner.claimId),
      satchelReturnContextFingerprint:digest},
    "./warSatchelAuthenticatedClaimReturn.ts":{authenticateSatchelClaimReturn:async()=>assert.fail("unexpected proof")},
    "./warSatchelFundedLedger.ts":{creditVerifiedSatchelClaimReturn:async()=>assert.fail("unexpected credit")},
    "./warSatchelClaimReturnReserve.ts":reserve,"./woloBetSettlement.ts":adapter,"./woloChain.ts":chain,
  });
  const events:string[]=[];
  const reader=(async(url:RequestInfo|URL,init?:RequestInit)=>{
    const target=new URL(String(url)), action=target.pathname.split("/").at(-1);
    assert.equal(target.origin,"http://127.0.0.1:8094");
    assert.equal(new Headers(init?.headers).get("Authorization"),"Bearer "+"T".repeat(64));
    if(init?.method==="GET"){
      assert.match(target.pathname,/^\/satchel\/v1\/returns\/execution\/[1-9][0-9]*$/);
      events.push("GET:"+action);return Response.json({}, {status:404});
    }
    assert.equal(init?.method,"POST");
    const approval=JSON.parse(String(init?.body)),id=Number(approval.claim_id),e=economics(id);
    assert.deepEqual(approval,e.approval);events.push(action+":"+id);
    if(action==="prepare")return Response.json({kind:"escrow_run_prepared",run:runtime.satchelClaimReturnExecutionRun(e),
      execution_authorized:false,credit_authorized:false});
    if(action==="check-execution")return Response.json({protocol:1,kind:"escrow_return_execution_check",approval,
      operation_permit_sha256:"d".repeat(64),reserve_review_sha256:"e".repeat(64),state_height:41,commit_height:42,
      commit_block_hash:bank.blockHash,expires_at:Math.floor(Date.now()/1000)+20,execution_authorized:false,credit_authorized:false});
    assert.equal(action,"execute");
    const attempt=await db.satchelClaimReturnExecutionAttempt.findUniqueOrThrow({where:{claimId:id}});
    assert.equal(attempt.runId,"satchel:claim-return:"+id);
    assert.equal(attempt.requestDigest,digest(attempt.requestJson));
    assert.ok(init.signal);return execute(id,init.signal);
  }) as typeof fetch;
  return {events,reader,adapter,run:(id:number,prisma=db)=>runtime.processCertifiedSatchelClaimReturn(prisma,id,reader)};
}

const childFixture=process.env.SATCHEL_RETURN_TEST_CHILD;
if(childFixture&&process.send&&process.env.RUN_SATCHEL_PHYSICAL_PG_TESTS==="1"){
  const {socket,id,mode,publicKey}=JSON.parse(childFixture);
  assert.match(socket,/^\/(?:private\/)?tmp\/aoe2-satchel-lifecycle-[A-Za-z0-9]+\/socket$/);
  configure();
  const db=new PrismaClient({adapter:new PrismaPg({host:socket,user:"satchel_lifecycle_fixture",database:"postgres",ssl:false})});
  try{
    const child=transport(socket,db,publicKey,async(claimId,signal)=>{
      assert.equal(mode,"crash");
      process.send!({accepted:claimId});
      return new Promise((_resolve,reject)=>signal.addEventListener("abort",()=>reject(signal.reason),{once:true}));
    });
    const result=await child.run(id);
    process.send({result,events:child.events});
  }finally{
    await db.$disconnect();
    process.disconnect?.();
  }
}else{
  test("real PostgreSQL return attempts survive saturation, lost acknowledgements and worker death",{
    skip:process.env.RUN_SATCHEL_PHYSICAL_PG_TESTS!=="1",timeout:180000,
  },async t=>{
    configure();
    const key=generateKeyPairSync("ed25519");
    const publicKey=key.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
    const db=await startLifecycleDatabase();
    t.after(db.cleanup);
    assert.ok(db.migrations.includes("20261029_160000_war_satchel_claim_return_execution"));
    await db.sql.query(readFileSync(resolve("prisma/migrations/20261021_220000_hd_financial_maintenance_fence/migration.sql"),"utf8"));
    await db.sql.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON hd_financial_maintenance_policy TO ${role}`);
    let generation=BigInt((await db.sql.query("SELECT generation::text FROM hd_financial_maintenance_policy WHERE scope='hd-legacy'")).rows[0].generation);
    async function permit(expired=false){
      const now=Math.floor(Date.now()/1000), expires_at=expired?now-1:now+55;
      const payload={protocol:1,...identity,scope:"hd-legacy",generation:String(++generation),
        producers:["settlement-run"],wallets:[escrow],issued_at:now-2,expires_at};
      await db.sql.query("UPDATE hd_financial_maintenance_policy SET generation=$1,closed=false,permit=$2,signature=$3 WHERE scope='hd-legacy'",
        [payload.generation,payload,sign(null,hdFinancialPermitMessage(payload),key.privateKey).toString("base64")]);
    }
    const owner=await db.prisma.user.create({data:{uid:"fixture-owner",inGameName:"ReturnFixture"}});
    for(const id of [101,102,103,104,105,106,107,108,109]){
      const e=economics(id),reserveReview={pre_prepare_audit_only:true};
      await db.prisma.pendingWoloClaim.create({data:{id,normalizedPlayerName:"return-fixture",displayPlayerName:"ReturnFixture",amountWolo:5}});
      await db.prisma.satchelClaimReturnExecutionReview.create({data:{claimId:id,ownerUserId:owner.id,ownerUid:owner.uid,
        entitlementId:e.entitlementId,allocationDigest:e.approval.allocation_digest,economicsJson:e,
        reserveReviewJson:reserveReview,reviewDigest:digest({economics:e,reserveReview})}});
    }
    const attempt=(id:number)=>db.prisma.satchelClaimReturnExecutionAttempt.findUnique({where:{claimId:id}});
    await permit();
    const accepted=new Map<number,()=>void>(),release=Promise.withResolvers<void>();
    const held=transport(db.socket,db.prisma,publicKey,async id=>{accepted.get(id)!();await release.promise;throw Error("FIXTURE_HTTP_ACK_LOST");});
    const running:Promise<unknown>[]=[];
    try{
      for(const id of [101,102,103,104]){
        const entered=Promise.withResolvers<void>();
        accepted.set(id,entered.resolve);
        const operation=held.run(id);running.push(operation);
        await Promise.race([entered.promise,operation.then(result=>assert.fail("worker failed to reach execute: "+JSON.stringify(result)))]);
      }
      assert.deepEqual(await held.run(105),{state:"financial_maintenance_hold"});
      assert.equal(await attempt(105),null);
      assert.ok(!held.events.some(event=>event.endsWith(":105")));
    }finally{
      release.resolve();
      assert.deepEqual(await Promise.all(running),Array.from({length:running.length},()=>({state:"unknown_hold"})));
    }
    for(const id of [101,102,103,104])assert.equal(held.events.filter(event=>event==="execute:"+id).length,1);
    await assert.rejects(held.adapter.executeServiceOnlySatchelEscrowReturn(economics(105).approval,escrow,held.reader,new AbortController().signal),
      /existing_admission_invalid/);

    // Discard acknowledgement only after a real COMMIT returned successfully
    // and another PostgreSQL session can see the durable row.
    const neverPost=transport(db.socket,db.prisma,publicKey,async()=>assert.fail("no execute after lost COMMIT acknowledgement"));
    let dropped=false;
    const commitAckLoss=new Proxy(db.prisma,{get(target,property){
      if(property==="$transaction")return async(action:Parameters<PrismaClient["$transaction"]>[0],options:{isolationLevel?:Prisma.TransactionIsolationLevel;maxWait?:number;timeout?:number})=>{
        const result=await target.$transaction(action as (tx:Prisma.TransactionClient)=>Promise<unknown>,options);
        if(!dropped&&(await db.sql.query("SELECT claim_id FROM war_satchel_claim_return_execution_attempts WHERE claim_id=106")).rowCount===1){
          dropped=true;throw Error("FIXTURE_COMMIT_ACK_LOST");
        }
        return result;
      };
      const value=Reflect.get(target,property,target);return typeof value==="function"?value.bind(target):value;
    }});
    await permit();
    assert.deepEqual(await neverPost.run(106,commitAckLoss),{state:"unknown_hold"});
    assert.equal(dropped,true);
    assert.deepEqual(neverPost.events,["prepare:106","check-execution:106"]);

    async function worker(id:number,mode:"crash"|"recover"){
      const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^PG|^(?:DATABASE_URL|DIRECT_URL|SHADOW_DATABASE_URL)$/i.test(name)));
      env.SATCHEL_RETURN_TEST_CHILD=JSON.stringify({socket:db.socket,id,mode,publicKey});
      const child=fork(fileURLToPath(import.meta.url),[],{env,
        execArgv:process.execArgv.filter(arg=>arg!=="--test"),stdio:["ignore","inherit","inherit","ipc"]});
      const exit=once(child,"exit");
      const timer=setTimeout(()=>child.kill("SIGKILL"),12000);
      try{
        const message=await Promise.race([once(child,"message").then(([msg])=>msg),
          exit.then(([code,signal])=>assert.fail(`worker exited before reporting: ${code}/${signal}`))]);
        if(mode==="crash"){
          assert.deepEqual(message,{accepted:id});
          assert.ok(await attempt(id));
          child.kill("SIGKILL");
          assert.deepEqual(await exit,[null,"SIGKILL"]);
        }else{
          assert.deepEqual(message,{result:{state:"unknown_hold"},events:["GET:"+id]});
          assert.deepEqual(await exit,[0,null]);
        }
      }finally{
        clearTimeout(timer);
        if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");
        await exit;
      }
    }

    await worker(107,"crash");
    await permit();
    let timedOut=false;
    const timed=transport(db.socket,db.prisma,publicKey,async(_id,signal)=>{
      // The simulated native endpoint accepted the POST after checking the
      // committed PG row. It then loses the response until the real adapter
      // deadline aborts this request.
      await new Promise<void>(resolve=>signal.addEventListener("abort",()=>resolve(),{once:true}));
      timedOut=signal.reason instanceof DOMException&&signal.reason.name==="TimeoutError";
      throw signal.reason;
    });
    assert.deepEqual(await timed.run(109),{state:"unknown_hold"});
    assert.equal(timedOut,true);
    assert.deepEqual(timed.events,["prepare:109","check-execution:109","execute:109"]);
    await permit(true);
    assert.deepEqual(await neverPost.run(108),{state:"financial_maintenance_hold"});
    assert.equal(await attempt(108),null);
    assert.ok(!neverPost.events.some(event=>event.endsWith(":108")));
    // Same durable identities, separate Node process and fresh DB client
    // for every recovery. Includes never submitted and accepted/lost HTTP.
    for(const id of [101,106,107,109]){
      const before=await attempt(id);
      assert.ok(before);
      await worker(id,"recover");
      assert.deepEqual(await attempt(id),before);
      const claim=await db.prisma.pendingWoloClaim.findUniqueOrThrow({where:{id}});
      assert.equal(claim.status,"pending");
      assert.equal(claim.payoutTxHash,null);
      const observed=await db.prisma.satchelClaimReturnExecutionObservation.findMany({where:{claimId:id}});
      assert.ok(observed.length>=1);
      assert.ok(observed.every(row=>row.state==="unknown"&&row.txHash===null));
    }
  });
}
