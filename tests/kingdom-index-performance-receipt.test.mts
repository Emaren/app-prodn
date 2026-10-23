import test from "node:test";
import assert from "node:assert/strict";
import {PERFORMANCE_SCHEMA,summarizePerformanceSamples,verifyKingdomPerformanceReceipt} from "../lib/kingdomIndexPerformanceReceipt.mjs";
const source={route:"/kingdom-index",template:"app/kingdom-index/page.tsx",gitSha:"a".repeat(40),closureSha256:"b".repeat(64),buildId:"test-build",releaseSha256:"c".repeat(64)};
const at="2026-10-21T20:00:00.000Z",ids=["measured_latency","bounded_data","render_efficiency","sustained_load"];
function fixture(id){
 const samples=Array.from({length:20},(_,i)=>id==="measured_latency"?{coldMs:100+i*10,warmMs:50+i*5}
  :id==="bounded_data"?{queryMs:10+i,rowsScanned:100+i*10,responseBytes:400+i}
  :id==="render_efficiency"?{rerenders:i,heapBytes:10000+i*100,jsBytes:1000+i*50}
  :{requestCount:10,errorCount:i===19?1:0,latencyMs:30+i,cpuPct:20+i});
 return {schema:PERFORMANCE_SCHEMA,source:{...source},criterionId:id,measuredAt:at,
  environment:{device:"test-device",network:"test-network",region:"test-region",runId:"fixture-not-real",concurrency:id==="sustained_load"?4:1},
  samples,summary:summarizePerformanceSamples(id,samples)};
}
const valid=(r,id)=>verifyKingdomPerformanceReceipt(Buffer.from(JSON.stringify(r)),{source,criterionId:id,measuredAt:at});
test("four named performance domains recompute percentiles from >=10 numeric samples",()=>{
 for(const id of ids)assert.equal(valid(fixture(id),id),true,id);
 assert.equal(fixture("measured_latency").summary.coldP75Ms,242.5);
 assert.equal(fixture("measured_latency").summary.coldP95Ms,280.5);
 assert.equal(fixture("measured_latency").summary.warmP95Ms,140.25);
});
test("tampered percentiles, invalid samples, forged zero and unsupported workload refuse",()=>{
 for(const id of ids){const x=fixture(id);x.summary[Object.keys(x.summary)[0]]+=0.01;assert.equal(valid(x,id),false,id);}
 let x=fixture("measured_latency");x.samples[0].coldMs=0;assert.equal(valid(x,"measured_latency"),false);
 x=fixture("sustained_load");x.environment.concurrency=1;assert.equal(valid(x,"sustained_load"),false);
 x=fixture("sustained_load");x.samples[0].errorCount=100;assert.equal(valid(x,"sustained_load"),false);
 x=fixture("bounded_data");x.samples[0].rowsScanned=-1;assert.equal(valid(x,"bounded_data"),false);
});
test("exact source, build, time, criterion and sample schema bind measurements",()=>{
 const r=fixture("measured_latency");assert.equal(valid(r,"render_efficiency"),false);
 r.source.buildId="wrong";assert.equal(valid(r,"measured_latency"),false);
 r.source.buildId=source.buildId;r.measuredAt="2026-10-20T20:00:00.000Z";assert.equal(valid(r,"measured_latency"),false);
 r.measuredAt=at;r.samples[0].unexpected=1;assert.equal(valid(r,"measured_latency"),false);
});
test("noncanonical, duplicate key, short, huge and invalid UTF-8 bytes refuse",()=>{
 const r=fixture("measured_latency"),raw=JSON.stringify(r),ctx={source,criterionId:"measured_latency",measuredAt:at};
 for(const b of [Buffer.from(raw+"\n"),Buffer.from(raw.replace('"schema":','"schema":"evil","schema":')),Buffer.from([255]),Buffer.alloc(1048577)])
  assert.equal(verifyKingdomPerformanceReceipt(b,ctx),false);
});
