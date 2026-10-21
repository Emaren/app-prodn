/**
 * Read-only audit adapter for existing SpeedOS real-Chrome cold-LCP receipts.
 * It does NOT run Chrome, initiate network traffic or award a Kingdom score.
 * The source identity is an independently supplied exact expected tuple; the
 * raw evidence must additionally be authenticated by the operator before use.
 */
import { createHash } from "node:crypto";

const fail=m=>{throw Error("KINGDOM BROWSER STOP: "+m);};
const HEX40=/^[a-f0-9]{40}$/;
const stamp=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
const validNumber=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=120000;
const exact=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&
 JSON.stringify(Object.keys(x).sort())===JSON.stringify([...keys].sort());
function percentile(values,q){
 const sorted=[...values].sort((a,b)=>a-b),at=(sorted.length-1)*q;
 const a=Math.floor(at),b=Math.ceil(at);
 return sorted[a]+(sorted[b]-sorted[a])*(at-a);
}
function summary(values){
 const v=[...values];
 return {count:v.length,p50:percentile(v,0.5),p75:percentile(v,0.75),
  p95:percentile(v,0.95),max:Math.max(...v)};
}
function equalSummary(a,b){
 if(!a||typeof a!=="object"||!b)return false;
 return ["count","p50","p75","p95","max"].every(k=>
  typeof a[k]==="number"&&Number.isFinite(a[k])&&Math.abs(a[k]-b[k])<=1e-6);
}
/**
 * Source-aligned diagnostic only. The source's collector SHA, release SHA and
 * buildVersion are checked against independently provided expected values.
 * Does not infer live deployment, browser authenticity, site health or speed
 * improvement from self-declared fields; origin attestation remains external.
 */
export function inspectKingdomColdBrowserReceipt(bytes,expected){
 if(!Buffer.isBuffer(bytes)||bytes.length<1000||bytes.length>6000000)fail("Evidence byte bounds");
 if(!exact(expected,["url","releaseSha","buildVersion","collectorSha","viewport"])||
  !HEX40.test(expected.releaseSha)||!HEX40.test(expected.collectorSha)||
  typeof expected.buildVersion!=="string"||expected.buildVersion.length<1||
  expected.buildVersion.length>128||!["desktop","phone"].includes(expected.viewport)||
  expected.url!=="https://aoe2war.com/kingdom-index")fail("Independent expected browser authority missing");
 const raw=bytes.toString("utf8");
 if(!Buffer.from(raw,"utf8").equals(bytes))fail("Non-UTF8 browser receipt");
 let receipt;try{receipt=JSON.parse(raw);}catch{fail("Invalid browser JSON");}
 // Existing SpeedOS emits this exact pretty serialization. It forbids duplicate
 // keys and ambiguous JSON escaping without changing the original collector.
 if(JSON.stringify(receipt,null,2)+"\n"!==raw)fail("Noncanonical browser receipt");
 if(receipt.schema!==1||receipt.kind!=="aoe2war-cold-process-lcp"||
  receipt.releaseSha!==expected.releaseSha||receipt.buildVersion!==expected.buildVersion||
  receipt.collectorSourceSha!==expected.collectorSha||receipt.url!==expected.url||
  receipt.viewport!==expected.viewport||!stamp(receipt.generatedAt)||
  receipt.productionMutated!==false||receipt.databaseMutated!==false||
  receipt.woloMutated!==false)fail("Source, collector or capture identity mismatch");
 const count=receipt.samples;
 if(!Number.isInteger(count)||count<10||count>20||
  !Array.isArray(receipt.rows)||receipt.rows.length!==count)fail("Incomplete browser cohort");
 const ready=[],lcp=[],ttfb=[],seen=new Set();
 for(const row of receipt.rows){
  if(!Number.isInteger(row.sample)||row.sample<1||row.sample>count||seen.has(row.sample)||
   row.loaded!==true||row.documentStatus!==200||row.viewport!==expected.viewport||
   !Number.isInteger(row.harnessAttempt)||row.harnessAttempt<1||
   row.harnessAttempt>receipt.sampleAttempts||
   !Array.isArray(row.failedResources)||row.failedResources.length>20)
   fail("Missing, duplicated or unsuccessful Chrome sample");
  seen.add(row.sample);
  const metrics=row.metrics,nav=metrics?.navigation,final=metrics?.finalLcp;
  if(metrics?.href!==expected.url||!nav||
   !validNumber(nav.responseStart)||nav.responseStart<=0||
   !validNumber(nav.responseEnd)||nav.responseEnd<nav.responseStart||
   !validNumber(final?.startTime)||final.startTime<=0)fail("Missing measured navigation/LCP evidence");
  ttfb.push(nav.responseStart);lcp.push(final.startTime);
  if(validNumber(metrics.readyMs)&&metrics.readyMs>0)ready.push(metrics.readyMs);
 }
 const summaries={documentTtfbMs:summary(ttfb),lcpMs:summary(lcp)};
 if(!equalSummary(receipt.summary?.documentTtfbMs,summaries.documentTtfbMs)||
  !equalSummary(receipt.summary?.lcpMs,summaries.lcpMs))fail("Reported percentile does not match Chrome samples");
 // Readiness can legitimately be missing. Preserve that missingness, never
 // transform absent/partial Ready measurements into zero or a passing grade.
 let readiness=null;
 if(ready.length===count){
  readiness=summary(ready);
  if(!equalSummary(receipt.summary?.readyMs,readiness))fail("Ready percentile drift");
 }else if(receipt.summary?.readyMs?.count!==ready.length)fail("Missing Ready count drift");
 return Object.freeze({
  status:readiness?"SOURCE_BOUND_BROWSER_DIAGNOSTIC":"INCOMPLETE_BROWSER_READY",
  evidenceSha256:createHash("sha256").update(bytes).digest("hex"),
  route:expected.url,releaseSha:expected.releaseSha,
  buildVersion:expected.buildVersion,collectorSha:expected.collectorSha,
  viewport:expected.viewport,samples:count,
  documentTtfbMs:Object.freeze(summaries.documentTtfbMs),
  lcpMs:Object.freeze(summaries.lcpMs),
  readyMs:readiness?Object.freeze(readiness):null,
  readyCoverage:ready.length,
  current:false,certified:false,score:null,
  limitations:"Raw SpeedOS cold Chrome data only; collector/run authenticity, protected live version, transitive dependencies and calibrated scoring require independent attestation. No warm-browser or sustained-load claim."
 });
}
