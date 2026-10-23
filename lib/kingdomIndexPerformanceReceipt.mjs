/**
 * Offline typed performance receipts: independently recompute reported sample
 * percentiles and pin the route/build/criterion/time/environment.
 * This only proves INTERNAL RECEIPT CONSISTENCY, never real-world observation,
 * workload representativeness, benchmark budgets, or public certification.
 */
export const PERFORMANCE_SCHEMA="aoe2war.kingdom-index.performance-samples.v1";
const EXACT=(x,keys)=>x&&typeof x==="object"&&!Array.isArray(x)&&JSON.stringify(Object.keys(x).sort())===JSON.stringify([...keys].sort());
const N=(x,lo,hi)=>typeof x==="number"&&Number.isFinite(x)&&x>=lo&&x<=hi;
const I=(x,lo,hi)=>Number.isInteger(x)&&x>=lo&&x<=hi;
const S=(x,max)=>typeof x==="string"&&x.length>0&&x.length<=max;
const SHA40=/^[a-f0-9]{40}$/,SHA64=/^[a-f0-9]{64}$/;
const DATE=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString()===s;
const TYPES=Object.freeze({
 measured_latency:["coldMs","warmMs"],
 bounded_data:["queryMs","rowsScanned","responseBytes"],
 render_efficiency:["rerenders","heapBytes","jsBytes"],
 sustained_load:["requestCount","errorCount","latencyMs","cpuPct"]
});
const round=x=>Math.round(x*1000)/1000;
function p(samples,key,q){
 const arr=samples.map(x=>x[key]).sort((a,b)=>a-b);
 const ix=(arr.length-1)*q,lo=Math.floor(ix),hi=Math.ceil(ix);
 return round(arr[lo]+(arr[hi]-arr[lo])*(ix-lo));
}
export function summarizePerformanceSamples(id,rows){
 if(!TYPES[id]||!Array.isArray(rows)||rows.length<10||rows.length>200)throw Error("Invalid performance cohort");
 if(id==="measured_latency")return {coldP75Ms:p(rows,"coldMs",0.75),coldP95Ms:p(rows,"coldMs",0.95),warmP75Ms:p(rows,"warmMs",0.75),warmP95Ms:p(rows,"warmMs",0.95)};
 if(id==="bounded_data")return {queryP95Ms:p(rows,"queryMs",0.95),rowsScannedP95:p(rows,"rowsScanned",0.95),responseBytesP95:p(rows,"responseBytes",0.95)};
 if(id==="render_efficiency")return {rerendersP95:p(rows,"rerenders",0.95),heapBytesP95:p(rows,"heapBytes",0.95),jsBytesP95:p(rows,"jsBytes",0.95)};
 const total=rows.reduce((s,r)=>s+r.requestCount,0),failed=rows.reduce((s,r)=>s+r.errorCount,0);
 return {failurePct:round(failed*100/total),latencyP95Ms:p(rows,"latencyMs",0.95),cpuP95Pct:p(rows,"cpuPct",0.95)};
}
export function verifyKingdomPerformanceReceipt(bytes,{source,criterionId,measuredAt}={}){
 try {
  if(!Buffer.isBuffer(bytes)||bytes.length<200||bytes.length>1048576||!TYPES[criterionId])return false;
  const raw=bytes.toString("utf8");
  if(!Buffer.from(raw).equals(bytes))return false;
  const r=JSON.parse(raw);
  if(JSON.stringify(r)!==raw||!EXACT(r,["schema","source","criterionId","measuredAt","environment","samples","summary"])||
   r.schema!==PERFORMANCE_SCHEMA||r.criterionId!==criterionId||!DATE(r.measuredAt)||r.measuredAt!==measuredAt)return false;
  const SOURCE=["route","template","gitSha","closureSha256","buildId","releaseSha256"];
  if(!EXACT(source,SOURCE)||!EXACT(r.source,SOURCE)||JSON.stringify(r.source)!==JSON.stringify(source)||
   !SHA40.test(r.source.gitSha)||!SHA64.test(r.source.closureSha256)||!SHA64.test(r.source.releaseSha256))return false;
  const e=r.environment;
  if(!EXACT(e,["device","network","region","runId","concurrency"])||
   !S(e.device,100)||!S(e.network,100)||!S(e.region,100)||!S(e.runId,160)||
   !I(e.concurrency,1,1000)||(criterionId==="sustained_load"&&e.concurrency<2))return false;
  if(!Array.isArray(r.samples)||r.samples.length<10||r.samples.length>200)return false;
  for(const s of r.samples){
   if(!EXACT(s,TYPES[criterionId]))return false;
   if(criterionId==="measured_latency"&&!(N(s.coldMs,0.001,120000)&&N(s.warmMs,0.001,120000)))return false;
   if(criterionId==="bounded_data"&&!(N(s.queryMs,0.001,120000)&&I(s.rowsScanned,0,1000000000)&&I(s.responseBytes,0,1000000000)))return false;
   if(criterionId==="render_efficiency"&&!(I(s.rerenders,0,1000000)&&I(s.heapBytes,1,1000000000)&&I(s.jsBytes,1,1000000000)))return false;
   if(criterionId==="sustained_load"&&!(I(s.requestCount,1,1000000)&&I(s.errorCount,0,s.requestCount)&&N(s.latencyMs,0.001,120000)&&N(s.cpuPct,0,100)))return false;
  }
  if(criterionId==="sustained_load"&&r.samples.reduce((s,x)=>s+x.requestCount,0)<100)return false;
  const calculated=summarizePerformanceSamples(criterionId,r.samples);
  return EXACT(r.summary,Object.keys(calculated))&&Object.entries(calculated).every(([key,value])=>r.summary[key]===value);
 }catch{return false;}
}
