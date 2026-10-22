#!/usr/bin/env node
/** Independent, read-only INTERNAL consistency check of a collected candidate
 * evidence directory. The trust root is the caller's exact Git SHA + BUILD_ID
 * and enrolled SpeedOS collector Git blob SHA, NOT metadata in any report.
 * Explicitly NOT GitHub-run origin authentication, production attestation,
 * a quality score, or approval of any specialized assurance gate.
 */
import {createHash} from "node:crypto";
import {lstat,readFile,realpath} from "node:fs/promises";
import {resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectIndexLoopbackChrome} from "./kingdom_index_loopback_browser_audit.mjs";

const SHA40=/^[0-9a-f]{40}$/;
const HEX64=/^[0-9a-f]{64}$/;
const fail=m=>{throw Error("KINGDOM BUNDLE STOP: "+m)};
const hash=x=>createHash("sha256").update(x).digest("hex");
const paths=[
 "source-checkout.json","source-dependencies.json","source-built.json","source-emitted.json",
 "emitted-closure.json","api-loopback.json","concurrent-loopback.json",
 "chrome-desktop/receipt.json","chrome-desktop/inspection.json",
 "chrome-phone/receipt.json","chrome-phone/inspection.json"
];
function digestBody(x,key){
 if(!x||typeof x!=="object"||Array.isArray(x)||!HEX64.test(x[key]))fail("Missing exact receipt checksum");
 const copy={...x};const declared=copy[key];delete copy[key];
 if(hash(Buffer.from(JSON.stringify(copy),"utf8"))!==declared)fail("Receipt checksum mismatch: "+key);
 return declared;
}
function percentile(values,q){
 const arr=[...values].sort((a,b)=>a-b),pos=(arr.length-1)*q,lo=Math.floor(pos),hi=Math.ceil(pos);
 return Math.round((arr[lo]+(arr[hi]-arr[lo])*(pos-lo))*1000)/1000;
}
async function loadFile(root,name,limit){
 const path=join(root,name),st=await lstat(path);
 if(!st.isFile()||st.nlink!==1||st.size<5||st.size>limit)
  fail("Missing, nonregular or oversized evidence: "+name);
 const bytes=await readFile(path);
 if(bytes.length!==st.size)fail("Evidence changed during read: "+name);
 return bytes;
}
function parse(bytes,name){
 let value;
 try{value=JSON.parse(bytes.toString("utf8"))}catch{fail("Malformed JSON: "+name)}
 if(!value||typeof value!=="object"||Array.isArray(value))fail("Invalid receipt: "+name);
 return value;
}
export async function verifyIndexCandidateBundle(root,{sourceSha,buildId,collectorSha}){
 if(typeof root!=="string"||!SHA40.test(sourceSha)||!SHA40.test(collectorSha)||
    typeof buildId!=="string"||buildId.length<5||buildId.length>128)
    fail("Independent source/build/collector identity absent");
 root=await realpath(resolve(root));
 const data=new Map();
 for(const name of paths){data.set(name,await loadFile(root,name,name==="emitted-closure.json"?2000000:6000000));}
 const sourceTree=new Set(),checkpoints={};
 for(const phase of ["checkout","dependencies","built","emitted"]){
  const name="source-"+phase+".json",row=parse(data.get(name),name);
  digestBody(row,"sha256");
  if(row.kind!=="aoe2war.kingdom-index.tracked-source-provenance.v1"||
     row.phase!==phase||row.expectedSha!==sourceSha||row.headSha!==sourceSha||
     !SHA40.test(row.headTreeSha)||row.trackedClean!==true||
     row.sourceIdentity!=="HEAD_AND_TRACKED_CONTENT_AGREE"||
     !Array.isArray(row.trackedChangedFiles)||row.trackedChangedFiles.length)
    fail("Dirty, wrong or incomplete tracked source checkpoint: "+phase);
  sourceTree.add(row.headTreeSha);checkpoints[phase]=row.sha256;
 }
 if(sourceTree.size!==1)fail("Tracked Git tree changed across build phases");
 const emitted=parse(data.get("emitted-closure.json"),"emitted-closure.json");
 digestBody(emitted,"receiptSha256");
 if(emitted.kind!=="aoe2war.kingdom-index.emitted-source-capture.v1"||
    emitted.route!=="/kingdom-index"||emitted.sourceSha!==sourceSha||
    emitted.buildId!==buildId||emitted.status!=="OBSERVED_NOT_CERTIFIED"||
    emitted.certified!==false||emitted.publicationAuthorized!==false||
    !Array.isArray(emitted.files)||emitted.files.length<9||
    !Array.isArray(emitted.missing)||emitted.missing.length||
    !Array.isArray(emitted.invalidTraces)||emitted.invalidTraces.length)
    fail("Missing or misleading exact-source emitted closure");
 const seen=new Set();let observedBytes=0;
 for(const file of emitted.files){
  if(typeof file.path!=="string"||file.path.startsWith("/")||file.path.includes("..")||
     seen.has(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<1||
     !HEX64.test(file.sha256))fail("Duplicated, unsafe or invalid emitted file");
  seen.add(file.path);observedBytes+=file.bytes;
 }
 for(const path of [".next/BUILD_ID",".next/server/app/kingdom-index/page.js",
 ".next/server/app/api/kingdom-index/route.js",
 ".next/server/app/kingdom-index/page.js.nft.json",
 ".next/server/app/api/kingdom-index/route.js.nft.json",
 "lib/generated/prisma/index.js"])
  if(!seen.has(path))fail("Missing critical emitted member: "+path);
 if(emitted.budget?.maxBytes!==805306368||
    emitted.budget.remainingBytes!==805306368-observedBytes)
    fail("Emitted artifact byte budget is self-contradictory");
 const api=parse(data.get("api-loopback.json"),"api-loopback.json");
 digestBody(api,"sha256");
 if(api.kind!=="aoe2war.kingdom-index.loopback-api-observation.v1"||
    api.origin!=="LOOPBACK_ONLY"||api.route!=="/api/kingdom-index"||
    api.buildId!==buildId||api.samples!==12||
    !Array.isArray(api.observed)||api.observed.length!==api.samples||
    api.consistent!==true||api.certified!==false||
    api.criterionPointsAwarded!==null)fail("Invalid bounded Next API cohort");
 const durations=[],sizes=new Set();
 for(let i=0;i<api.observed.length;i++){
  const row=api.observed[i];
  if(row.sequence!==i+1||typeof row.elapsedMs!=="number"||
     !Number.isFinite(row.elapsedMs)||row.elapsedMs<=0||
     !Number.isSafeInteger(row.responseBytes)||row.responseBytes<100||
     row.responseBytes>524288||row.kingdomIndexStatus!=="unmeasured"||
     row.indexScore!==null||row.certified!==0)
    fail("API response inconsistency or false score");
  durations.push(row.elapsedMs);sizes.add(row.responseBytes);
 }
 if(sizes.size!==1||!api.latencyMs||
    ["p50","p75","p95"].some((k,i)=>
      Math.abs(api.latencyMs[k]-percentile(durations,[.5,.75,.95][i]))>0.002))
    fail("API cohort percentile or response-size contradiction");
 const burst=parse(data.get("concurrent-loopback.json"),"concurrent-loopback.json");
 digestBody(burst,"sha256");
 if(burst.kind!=="aoe2war.kingdom-index.concurrent-loopback-smoke.v1"||
    burst.sourceSha!==sourceSha||burst.buildId!==buildId||
    burst.origin!=="LOOPBACK_ONLY"||burst.endpoint!=="/api/kingdom-index"||
    burst.requests!==40||burst.concurrency!==4||burst.errors!==0||
    burst.certified!==false||burst.criterionPointsAwarded!==null||
    burst.consistent!==true||!Number.isFinite(burst.wallMs)||burst.wallMs<=0||
    !Array.isArray(burst.observed)||burst.observed.length!==40)
    fail("Invalid or contradicted exact-head concurrent API smoke");
 const elapsed=[],burstRows=new Set();
 for(let i=0;i<burst.observed.length;i++){
  const row=burst.observed[i];
  if(row.sequence!==i+1||!Number.isFinite(row.elapsedMs)||row.elapsedMs<=0||
     row.routeCount!==88||row.certified!==0||row.indexScore!==null||
     row.indexStatus!=="unmeasured"||
     !Number.isInteger(row.responseBytes)||row.responseBytes<100||
     row.responseBytes>524288)
    fail("Concurrent API sample mismatch or false score");
  elapsed.push(row.elapsedMs);burstRows.add(row.responseBytes);
 }
 if(burstRows.size!==1||[...burstRows][0]!==[...sizes][0]||
    ["p50","p75","p95"].some((k,i)=>
      Math.abs(burst.latencyMs?.[k]-percentile(elapsed,[.5,.75,.95][i]))>0.002))
    fail("Concurrent API percentile or bounded response mismatch");
 const chrome={};
 for(const viewport of ["desktop","phone"]){
  const name="chrome-"+viewport+"/",raw=data.get(name+"receipt.json");
  const inspected=parse(data.get(name+"inspection.json"),name+"inspection.json");
  const expected={sourceSha,buildId,collectorSha,viewport,
    url:"http://127.0.0.1:3030/kingdom-index"};
  const computed=inspectIndexLoopbackChrome(raw,expected);
  if(computed.status!=="REAL_CHROME_LOOPBACK_OBSERVED"||
     computed.samples!==10||computed.certified!==false||computed.score!==null||
     computed.rawReceiptSha256!==hash(raw)||
     JSON.stringify(inspected)!==JSON.stringify(computed))
    fail("Chrome receipt and independent parser disagree: "+viewport);
  chrome[viewport]={sha256:computed.rawReceiptSha256,samples:computed.samples,
    lcpMs:computed.measured.lcpMs,networkTtfbMs:computed.measured.networkTtfbMs};
 }
 return Object.freeze({
  schema:1,kind:"aoe2war.kingdom-index.candidate-bundle-inspection.v1",
  sourceSha,buildId,collectorSha,headTreeSha:[...sourceTree][0],
  checkpoints,emitted:{files:emitted.files.length,bytes:observedBytes,
    receiptSha256:emitted.receiptSha256,missing:0,invalidTraces:0},
  api:{sha256:api.sha256,samples:12,latencyMs:api.latencyMs},
  concurrent:{sha256:burst.sha256,requests:burst.requests,concurrency:burst.concurrency,latencyMs:burst.latencyMs},
  chrome,certified:false,criterionPointsAwarded:null,
  status:"SELF_CONSISTENT_CANDIDATE_EVIDENCE_ONLY",
  limitation:"Receipt hashes and internal data consistency only. Original emitted asset bytes, independent GitHub run origin, live production, authentication, warm/a11y/load and criterion approvals are NOT established."
 });
}
async function main(){
 const args=process.argv.slice(2),map={};
 if(args.length!==8)fail("Require --evidence-dir --expected-source --expected-build-id --collector-sha");
 for(let i=0;i<args.length;i+=2){
  const key=args[i]?.startsWith("--")?args[i].slice(2):"";
  if(!["evidence-dir","expected-source","expected-build-id","collector-sha"].includes(key)||
     Object.hasOwn(map,key))fail("Invalid or duplicate option");
  map[key]=args[i+1];
 }
 const report=await verifyIndexCandidateBundle(map["evidence-dir"],{
  sourceSha:map["expected-source"],buildId:map["expected-build-id"],
  collectorSha:map["collector-sha"]
 });
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===
   await realpath(resolve(process.argv[1])).catch(()=>null))
 main().catch(e=>{console.error(String(e.message));process.exitCode=2});
