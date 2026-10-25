import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,symlinkSync,rmSync,realpathSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";
import { diagnoseSatchelFinance, financeDoctorFindings, financeInspectionChecks, publicFinanceDiagnostics } from "../lib/warSatchelFinanceDiagnostics.ts";
import {parseFinanceObservationJson,readPrivateFinanceOpsJson,financeEvidenceFromOps,readSatchelFinanceCensus,
 readFinanceChainHead,collectSatchelFinanceDiagnostics,SATCHEL_FINANCE_CENSUS_SQL} from "../lib/warSatchelFinanceDiagnosticsServer.ts";

const NOW=Date.parse("2026-10-25T13:00:00Z");
const at=(seconds=0)=>new Date(NOW-seconds*1000).toISOString();
const digest="a".repeat(64),source="b".repeat(40);
function evidence(){return {
 observedAt:at(),sourceSha:source,publisher:"operator-one",
 build:{expectedSource:source,runningSource:source,expectedBuild:"build1234",runningBuild:"build1234"},
 writerRoster:{expected:digest,observed:digest},
 signerRoles:{execution:"1".repeat(64),wagerReview:"2".repeat(64),withdrawalReview:"3".repeat(64)},
 storage:{rootFreeBytes:10*1024**3,volumeFreeBytes:60*1024**3,volumeUsedPercent:70},
 backup:{capturedAt:at(60),restoredAt:at(30),offHostVerifiedAt:at(20),fullSize:true},
 recovery:{sourceSha:source,observedAt:at(60),boundedMountVerified:true,pairedRecoveryObserved:true},
};}
function census(){return {observedAt:at(),availableUwolo:"100",reservedUwolo:"20",withdrawalPendingUwolo:"5",
 ownerMismatchCount:0,negativeBucketCount:0,unknownReservations:0,unknownWithdrawals:0,
 frozenReservations:0,pendingRefunds:0,pendingWithdrawals:0,orphanCandidates:0,lastWatcherAt:at(2),lastReceiptAt:at(3)};}
function report(overrides={}){return diagnoseSatchelFinance({nowMs:NOW,collectionStartedAtMs:NOW-10,
 chain:{observedAt:at(),chainId:"wolo-1",height:"2634595",blockAt:at(6),catchingUp:false},
 evidence:evidence(),census:census(),...overrides});}
function finding(r:any,id:string){return r.findings.find((f:any)=>f.id===id)!;}

test("empty evidence produces explicit UNKNOWN, never financial readiness",()=>{
 const r=diagnoseSatchelFinance({nowMs:NOW,collectionStartedAtMs:NOW});
 assert.equal(r.status,"HOLD");assert.equal(r.financialAuthorized,false);
 assert.ok(r.findings.every(f=>f.state==="UNKNOWN"));
});
test("all observational checks still cannot authenticate chain, global liabilities or custody",()=>{
 const r=report();assert.equal(r.financialAuthorized,false);
 assert.equal(finding(r,"chain-trust").state,"UNKNOWN");
 assert.equal(finding(r,"bank-coverage").state,"UNKNOWN");
 assert.equal(finding(r,"global-obligations").state,"UNKNOWN");
 assert.ok(!JSON.stringify(r).includes('"PASS"'));
});
test("stale chain and future clocks are held independently of HTTP success",()=>{
 assert.equal(finding(report({chain:{observedAt:at(),chainId:"wolo-1",height:"2634595",blockAt:at(91),catchingUp:false}}),"chain-age").state,"STALE");
 assert.equal(finding(report({chain:{observedAt:at(-6),chainId:"wolo-1",height:"2634595",blockAt:at(-6),catchingUp:false}}),"chain-age").state,"UNKNOWN");
});
test("wrong chain, catching-up and malformed heights cannot be healthy",()=>{
 for(const change of [{chainId:"other"},{catchingUp:true},{height:"0"},{height:"1e6"}]){
  const c={observedAt:at(),chainId:"wolo-1",height:"2634595",blockAt:at(2),catchingUp:false,...change};
  assert.notEqual(finding(report({chain:c}),"chain-age").state,"OBSERVED");
 }
});
test("source/build, writer and signer role drift remain explicit",()=>{
 const e=evidence();e.build.runningSource="c".repeat(40);e.writerRoster.observed="d".repeat(64);e.signerRoles.withdrawalReview=e.signerRoles.execution;
 const r=report({evidence:e});
 for(const id of ["build-parity","writer-roster","signer-roles"])assert.equal(finding(r,id).state,"DRIFT");
});
test("ledger conservation checks each owner and excludes committed historical spending",()=>{
 const c=census();c.ownerMismatchCount=1;
 assert.equal(finding(report({census:c}),"ledger-conservation").state,"DRIFT");
 c.ownerMismatchCount=0;c.negativeBucketCount=1;
 assert.equal(finding(report({census:c}),"ledger-conservation").state,"DRIFT");
});
test("unknown transfers trigger human reconciliation and never retry instructions",()=>{
 const c=census();c.unknownReservations=1;c.unknownWithdrawals=1;
 const r=report({census:c});assert.equal(finding(r,"unknown-broadcasts").state,"BLOCKED");
 assert.equal(finding(r,"unknown-broadcasts").severity,"P0");
 assert.ok(r.findings.every(f=>f.automaticAction==="READ_ONLY"));
});
test("unsafe amounts and incomplete census cannot invent zero liabilities",()=>{
 for(const value of ["01","-1","1.5",1,9007199254740993,"9223372036854775808"]){
  const c:any=census();c.availableUwolo=value;
  assert.equal(finding(report({census:c}),"ledger-conservation").state,"UNKNOWN");
 }
 const c:any=census();delete c.unknownWithdrawals;
 assert.equal(finding(report({census:c}),"unknown-broadcasts").state,"UNKNOWN");
});
test("expiry is evaluated after collection and does not survive slow I/O",()=>{
 const c=census();c.observedAt=at(121);
 assert.equal(finding(report({census:c}),"ledger-conservation").state,"STALE");
 const r=report({collectionStartedAtMs:NOW-7000});
 assert.ok(r.findings.every(f=>f.state==="UNKNOWN"));
});
test("report adapters do not leak input fields or contribute fake green scores",()=>{
 const e:any=evidence();e.secret="PRIVATE_TOKEN";e.wallet="wolo1PRIVATE";e.txHash="PRIVATE_TRANSACTION";
 const r=report({evidence:e});const exposed=JSON.stringify([r,publicFinanceDiagnostics(r),financeDoctorFindings(r),financeInspectionChecks(r)]);
 assert.ok(!/PRIVATE_TOKEN|wolo1PRIVATE|PRIVATE_TRANSACTION/.test(exposed));
 assert.ok(financeInspectionChecks(r).every(x=>x.earned===0&&x.weight===0&&x.state!=="green"));
});

function ops(){return {bridge:{bridgeId:"operator-one",lastSeenAt:at()},intelligence:{bridgeId:"operator-one",generatedAt:at(),receivedAt:at(),payload:{source:{local:{head:source},github:{main_sha:source},production:{source_sha:source,active_build_id:"build1234"},certification:{active_build_id:"build1234"}},storage:{root_free_bytes:10*1024**3,volume_free_bytes:60*1024**3,volume_used_percent:70}}}};}
function directory(t:any){const dir=realpathSync(mkdtempSync(path.join(tmpdir(),"satchel-finance-diagnostics-")));chmodSync(dir,0o700);mkdirSync(path.join(dir,"state"),{mode:0o700});t.after(()=>rmSync(dir,{recursive:true,force:true}));return dir;}
function writeOps(dir:string,name:string,value:unknown){writeFileSync(path.join(dir,"state",name),JSON.stringify(value,null,2)+"\n",{mode:0o600});}
const rpcBody=()=>({jsonrpc:"2.0",result:{node_info:{network:"wolo-1"},sync_info:{latest_block_height:"2634595",latest_block_time:at(6),catching_up:false}}});
const fetchGood=(async()=>new Response(JSON.stringify(rpcBody()))) as typeof fetch;
function db(reads:string[]=[],value:unknown=census()){return {$transaction:async(action:any,options:any)=>{
 assert.deepEqual(options,{isolationLevel:"RepeatableRead",maxWait:500,timeout:3500});
 return action({$executeRawUnsafe:async(sql:string)=>{reads.push(sql);},$queryRawUnsafe:async(sql:string)=>{reads.push(sql);return [{census:value}];}});
}};}

test("strict bounded JSON rejects duplicate fields, malformed numbers, partial writes and oversized input",()=>{
 for(const raw of ['{"bridgeId":"one","bridgeId":"two"}','{"a":NaN}','{"a":1e400}','{"a":','[]','null',' '.repeat(1024*1024+1)])assert.throws(()=>parseFinanceObservationJson(raw));
 assert.deepEqual(parseFinanceObservationJson('{"a":1}'),{a:1});
 assert.throws(()=>parseFinanceObservationJson('{"a":1}',true));
});
test("private ops reads pin regular files and refuse symlink, broad write access and partial publications",async t=>{
 const root=directory(t);writeOps(root,"bridge.json",ops().bridge);
 assert.equal((await readPrivateFinanceOpsJson(root,"bridge.json")).bridgeId,"operator-one");
 const f=path.join(root,"state","bridge.json");chmodSync(f,0o666);
 await assert.rejects(readPrivateFinanceOpsJson(root,"bridge.json"));chmodSync(f,0o600);
 writeFileSync(f,'{"bridgeId":');await assert.rejects(readPrivateFinanceOpsJson(root,"bridge.json"));
 rmSync(f);symlinkSync(path.join(root,"outside.json"),f);await assert.rejects(readPrivateFinanceOpsJson(root,"bridge.json"));
});
test("intermediate symlink and oversized source do not escape private ops scope",async t=>{
 const root=directory(t);writeOps(root,"bridge.json",ops().bridge);
 writeFileSync(path.join(root,"state","bridge.json"),"x".repeat(1024*1024+1));
 await assert.rejects(readPrivateFinanceOpsJson(root,"bridge.json"));
 rmSync(path.join(root,"state"),{recursive:true});mkdirSync(path.join(root,"other"),{mode:0o700});symlinkSync(path.join(root,"other"),path.join(root,"state"));
 await assert.rejects(readPrivateFinanceOpsJson(root,"bridge.json"));
});
test("competing publisher, stale heartbeat and time skew are not silently combined",()=>{
 const b=ops();b.intelligence.bridgeId="operator-two";
 assert.equal(financeEvidenceFromOps(b.bridge,b.intelligence,NOW).publisherConflict,true);
 b.intelligence.bridgeId=b.bridge.bridgeId;b.bridge.lastSeenAt=at(121);
 assert.equal(financeEvidenceFromOps(b.bridge,b.intelligence,NOW).evidence,undefined);
 b.bridge.lastSeenAt=at(-6);assert.equal(financeEvidenceFromOps(b.bridge,b.intelligence,NOW).evidence,undefined);
 const r=report({publisherConflict:true});assert.equal(finding(r,"build-parity").reason,"COMPETING_PUBLISHER_OR_GENERATION");
});
test("census is one repeatable-read transaction with fixed READ ONLY SQL and no mutation path",async()=>{
 const reads:string[]=[];assert.deepEqual(await readSatchelFinanceCensus(db(reads)),census());
 assert.equal(reads[0],"SET TRANSACTION READ ONLY");assert.equal(reads[1],"SET LOCAL statement_timeout = '2500ms'");
 assert.equal(reads[2],SATCHEL_FINANCE_CENSUS_SQL);
 assert.match(SATCHEL_FINANCE_CENSUS_SQL,/FULL JOIN journal/);
 assert.doesNotMatch(SATCHEL_FINANCE_CENSUS_SQL,/\b(UPDATE|INSERT|DELETE|ALTER|DROP|CREATE|TRUNCATE|LOCK)\b/i);
});
test("missing tables, aborted reads and malformed aggregates cannot substitute a zero ledger",async t=>{
 const bad:any={$transaction:async()=>{throw Error("PRIVATE_DATABASE_ERROR");}};
 await assert.rejects(readSatchelFinanceCensus(bad));
 const dir=directory(t);const r=await collectSatchelFinanceDiagnostics({storeRoot:dir,database:bad,reader:fetchGood,now:()=>NOW});
 assert.equal(finding(r,"ledger-conservation").state,"UNKNOWN");assert.ok(!JSON.stringify(r).includes("PRIVATE_DATABASE_ERROR"));
 await assert.rejects(readSatchelFinanceCensus(db([],null)));
});
test("chain reads use fixed canonical27657 GET, reject forged/oversized data, and retry READS only",async()=>{
 let count=0;const reader=(async(url:any,options:any)=>{
  count++;assert.equal(url,"http://127.0.0.1:27657/status");assert.equal(options.method,"GET");assert.equal(options.redirect,"error");assert.equal(options.body,undefined);assert.equal(options.headers.Authorization,undefined);
  if(count===1)throw Error("temporary read failure");return new Response(JSON.stringify(rpcBody()));
 }) as typeof fetch;
 assert.equal((await readFinanceChainHead(reader,undefined,()=>NOW)).chainId,"wolo-1");assert.equal(count,2);
 for(const body of ['{"result":{},"result":{}}',' '.repeat(65537)]){
  let calls=0;await assert.rejects(readFinanceChainHead((async()=>{calls++;return new Response(body);}) as typeof fetch));assert.equal(calls,2);
 }
});
test("cancellation prevents reads and timeout bounds a noncooperative RPC",async()=>{
 const abort=new AbortController();abort.abort();let calls=0;
 await assert.rejects(readFinanceChainHead((async()=>{calls++;return new Response("{}");}) as typeof fetch,abort.signal));assert.equal(calls,0);
 const start=Date.now();await assert.rejects(readFinanceChainHead((async()=>new Promise(()=>{})) as typeof fetch));
 assert.ok(Date.now()-start<4000);
});
test("after-I/O clock expiry, restart without evidence, and partial inputs remain held",async t=>{
 const dir=directory(t);const data=ops();writeOps(dir,"bridge.json",data.bridge);writeOps(dir,"kingdom-intelligence.json",data.intelligence);
 let now=NOW;const slow=(async()=>{now+=7000;return new Response(JSON.stringify(rpcBody()));}) as typeof fetch;
 const expired=await collectSatchelFinanceDiagnostics({storeRoot:dir,database:db(),reader:slow,now:()=>now});
 assert.ok(expired.findings.every(f=>f.state==="UNKNOWN"));
 rmSync(path.join(dir,"state","kingdom-intelligence.json"));
 const restarted=await collectSatchelFinanceDiagnostics({storeRoot:dir,database:db(),reader:fetchGood,now:()=>NOW});
 assert.equal(finding(restarted,"build-parity").state,"UNKNOWN");assert.equal(finding(restarted,"ledger-conservation").state,"OBSERVED");
 assert.equal(restarted.financialAuthorized,false);
});
test("cancellation during I/O preserves no partial successful observation",async t=>{
 const dir=directory(t),abort=new AbortController();
 const reader=(async()=>{abort.abort();return new Response(JSON.stringify(rpcBody()));}) as typeof fetch;
 const r=await collectSatchelFinanceDiagnostics({storeRoot:dir,database:db(),reader,canceled:abort.signal,now:()=>NOW});
 assert.ok(r.findings.every(f=>f.state==="UNKNOWN"&&f.reason==="CANCELED"));
});
test("two live collectors hold a third without starting unbounded work",async t=>{
 const dir=directory(t);let releases:Array<()=>void>=[];
 const held=(async()=>new Promise<Response>(resolve=>{releases.push(()=>resolve(new Response(JSON.stringify(rpcBody()))));})) as typeof fetch;
 const a=collectSatchelFinanceDiagnostics({storeRoot:dir,reader:held,now:()=>NOW});
 const b=collectSatchelFinanceDiagnostics({storeRoot:dir,reader:held,now:()=>NOW});
 const third=await collectSatchelFinanceDiagnostics({storeRoot:dir,reader:held,now:()=>NOW});
 assert.ok(third.findings.every(f=>f.reason==="COLLECTOR_CAPACITY_HELD"));
 for(const release of releases)release();await Promise.all([a,b]);
});
test("admin GET authenticates first, remains no-store, and has no write/exported financial actions",()=>{
 const route=readFileSync(new URL("../app/api/admin/war-satchel/diagnostics/route.ts",import.meta.url),"utf8");
 assert.ok(route.indexOf("await requireAdmin(request)")<route.indexOf("await collectSatchelFinanceDiagnostics"));
 assert.match(route,/private, no-store/);assert.doesNotMatch(route,/export async function (POST|PUT|DELETE|PATCH)/);
 const hold=readFileSync(new URL("../lib/warSatchelFinancialBridgeHold.ts",import.meta.url),"utf8");
 assert.match(hold,/SATCHEL_FINANCIAL_BRIDGE_READY = false as const/);
});
