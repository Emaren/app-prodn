#!/usr/bin/env node
/** Exact-source, loopback-only real Chrome receipt inspector.
 * Reuses SpeedOS real Chrome snapshots; never substitutes DOM mocks or
 * certifies production, accessibility, warm-load or an awarded quality score.
 */
import {createHash} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const fail=m=>{throw Error("KINGDOM LOOPBACK CHROME STOP: "+m)};
const HEX40=/^[a-f0-9]{40}$/;
function summary(a){
 const b=[...a].sort((x,y)=>x-y);
 const p=q=>{const at=(b.length-1)*q,lo=Math.floor(at),hi=Math.ceil(at);return Math.round((b[lo]+(b[hi]-b[lo])*(at-lo))*1000)/1000};
 return {count:b.length,p50:p(.5),p75:p(.75),p95:p(.95),max:b.at(-1)};
}
export function inspectIndexLoopbackChrome(bytes,expected){
 if(!Buffer.isBuffer(bytes)||bytes.length<1000||bytes.length>6000000)fail("Missing/oversized raw Chrome bytes");
 if(!expected||typeof expected!=="object"||
    !HEX40.test(expected.sourceSha)||!HEX40.test(expected.collectorSha)||
    typeof expected.buildId!=="string"||expected.buildId.length<5||
    !["desktop","phone"].includes(expected.viewport)||expected.url!=="http://127.0.0.1:3030/kingdom-index")
    fail("Independent exact local route/build/source authority missing");
 const raw=bytes.toString("utf8");if(!Buffer.from(raw,"utf8").equals(bytes))fail("Untrusted UTF8");
 let d;try{d=JSON.parse(raw)}catch{fail("Malformed receipt JSON")}
 if(JSON.stringify(d,null,2)+"\n"!==raw)fail("Noncanonical receipt (including duplicate JSON keys)");
 if(d.kind!=="aoe2war-cold-process-lcp"||d.schema!==1||
    d.url!==expected.url||d.releaseSha!==expected.sourceSha||
    d.buildVersion!==expected.buildId||d.collectorSourceSha!==expected.collectorSha||
    d.viewport!==expected.viewport||d.productionMutated!==false||
    d.databaseMutated!==false||d.woloMutated!==false||
    !Number.isInteger(d.samples)||d.samples<10||d.samples>20||
    !Array.isArray(d.rows)||d.rows.length!==d.samples)
    fail("Wrong exact source, build, viewport or incomplete real Chrome cohort");
 const lcp=[],ttfb=[],ready=[],seen=new Set();
 for(const row of d.rows){
  const nav=row.metrics?.navigation,final=row.metrics?.finalLcp;
  if(!Number.isInteger(row.sample)||row.sample<1||row.sample>d.samples||seen.has(row.sample)||
     row.viewport!==expected.viewport||row.documentStatus!==200||row.loaded!==true||
     row.documentFromDiskCache!==false||row.documentFromServiceWorker!==false||
     row.metrics?.href!==expected.url||
     !Number.isFinite(nav?.requestStart)||nav.requestStart<=0||
     !Number.isFinite(nav?.responseStart)||nav.responseStart<=nav.requestStart||
     !Number.isFinite(nav?.responseEnd)||nav.responseEnd<nav.responseStart||
     !Number.isFinite(final?.startTime)||final.startTime<nav.responseStart)
     fail("Unsuccessful, duplicated, cached, or nonobserved Chrome navigation");
  seen.add(row.sample);lcp.push(final.startTime);ttfb.push(nav.responseStart-nav.requestStart);
  if(Number.isFinite(row.metrics?.readyMs)&&row.metrics.readyMs>0)ready.push(row.metrics.readyMs);
 }
 const calculated=summary(lcp),reported=d.summary?.lcpMs;
 if(!reported||reported.count!==d.samples||
    ["p50","p75","p95","max"].some(k=>Math.abs(reported[k]-calculated[k])>0.002))
    fail("Chrome summary does not match actual sample measurements");
 return {schema:1,kind:"aoe2war.kingdom-index.loopback-chrome-observation.v1",
  sourceSha:expected.sourceSha,buildId:expected.buildId,collectorSha:expected.collectorSha,
  viewport:expected.viewport,route:expected.url,samples:d.samples,
  rawReceiptSha256:createHash("sha256").update(bytes).digest("hex"),
  measured:{lcpMs:calculated,networkTtfbMs:summary(ttfb),readyMs:ready.length===d.samples?summary(ready):null,
   readinessSamples:ready.length},
  status:ready.length===d.samples?"REAL_CHROME_LOOPBACK_OBSERVED":"INCOMPLETE_BROWSER_READINESS",
  certified:false,score:null,criterionPointsAwarded:null,
  limitations:"Actual isolated candidate Chrome cold navigation, not authenticated production evidence, accessibility, warm-cache behavior or independent criterion approval."};
}
async function main(){
 const argv=process.argv.slice(2),args={};
 if(argv.length!==10)fail("Require --input --source-sha --build-id --collector-sha --viewport");
 for(let i=0;i<argv.length;i+=2){
  const k=argv[i].startsWith("--")?argv[i].slice(2):"";
  if(!["input","source-sha","build-id","collector-sha","viewport"].includes(k)||Object.hasOwn(args,k))
   fail("Invalid/duplicate option");
  args[k]=argv[i+1];
 }
 const data=await readFile(args.input);
 const report=inspectIndexLoopbackChrome(data,{sourceSha:args["source-sha"],buildId:args["build-id"],
  collectorSha:args["collector-sha"],viewport:args.viewport,url:"http://127.0.0.1:3030/kingdom-index"});
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
 if(report.status!=="REAL_CHROME_LOOPBACK_OBSERVED")process.exitCode=2;
}
const called=process.argv[1]?await realpath(resolve(process.argv[1])).catch(()=>null):null;
if(called===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(String(e.message));process.exitCode=2});
