import test from "node:test";
import assert from "node:assert/strict";
import {inspectKingdomColdBrowserReceipt} from "../lib/kingdomIndexBrowserReceipt.mjs";
const exp={url:"https://aoe2war.com/kingdom-index",releaseSha:"a".repeat(40),
 buildVersion:"fixture-build",collectorSha:"b".repeat(40),viewport:"desktop"};
function percent(a,q){
 const sorted=[...a].sort((x,y)=>x-y),at=(a.length-1)*q,lo=Math.floor(at),hi=Math.ceil(at);
 return sorted[lo]+(sorted[hi]-sorted[lo])*(at-lo);
}
function sum(a){return {count:a.length,p50:percent(a,0.5),p75:percent(a,0.75),p95:percent(a,0.95),max:Math.max(...a)};}
function fixture(){
 const rows=Array.from({length:10},(_,k)=>{
  const i=k+1;
  return {sample:i,viewport:"desktop",loaded:true,harnessAttempt:1,documentStatus:200,
   documentFromDiskCache:false,documentFromServiceWorker:false,failedResources:[],
   metrics:{href:exp.url,readyMs:300+i*10,finalLcp:{startTime:700+i*20},
    navigation:{requestStart:60+i*5,responseStart:80+i*5,responseEnd:120+i*5}}};
 });
 return {schema:1,kind:"aoe2war-cold-process-lcp",generatedAt:"2026-10-21T20:30:00.000Z",
  releaseSha:exp.releaseSha,buildVersion:exp.buildVersion,collectorSourceSha:exp.collectorSha,
  url:exp.url,viewport:exp.viewport,samples:10,sampleAttempts:2,retriedSamples:[],productionMutated:false,
  databaseMutated:false,woloMutated:false,
  summary:{readyMs:sum(rows.map(x=>x.metrics.readyMs)),documentTtfbMs:sum(rows.map(x=>x.metrics.navigation.responseStart)),
   lcpMs:sum(rows.map(x=>x.metrics.finalLcp.startTime))},rows};
}
const audit=(receipt,expect=exp)=>inspectKingdomColdBrowserReceipt(Buffer.from(JSON.stringify(receipt,null,2)+"\n"),expect);
test("SpeedOS exact Chrome cold receipts recompute LCP/TTFB and preserve original byte digest",()=>{
 const r=audit(fixture());
 assert.equal(r.samples,10);assert.equal(r.status,"SOURCE_BOUND_BROWSER_DIAGNOSTIC");
 assert.equal(r.lcpMs.p95,891);assert.equal(r.readyCoverage,10);
 assert.equal(r.navigationResponseStartMs.p95,127.75);
 assert.equal(r.networkTtfbMs.p95,20);
 assert.notEqual(r.navigationResponseStartMs.p95,r.networkTtfbMs.p95);
 assert.equal(r.certified,false);assert.equal(r.current,false);assert.equal(r.score,null);
 assert.match(r.evidenceSha256,/^[a-f0-9]{64}$/);
});
test("cannot project another source/build/collector/URL/viewport",()=>{
 const r=fixture();
 for(const delta of [{buildVersion:"wrong"},{releaseSha:"c".repeat(40)},{collectorSha:"d".repeat(40)},{viewport:"phone"},{url:"https://aoe2war.com/kingdom"}])
  assert.throws(()=>audit(r,{...exp,...delta}),/mismatch|authority/);
});
test("refuses duplicate and short samples, HTTP failures and incomplete Chrome navigation",()=>{
 const r=fixture();r.rows[0].sample=2;assert.throws(()=>audit(r),/duplicated|unsuccessful/);
 r.rows=fixture().rows.slice(1);assert.throws(()=>audit(r),/Incomplete/);
 r.rows=fixture().rows;r.rows[0].documentStatus=500;assert.throws(()=>audit(r),/unsuccessful/);
 r.rows=fixture().rows;r.rows[0].metrics.navigation.responseStart=null;assert.throws(()=>audit(r),/Missing or impossible/);
});
test("forged LCP/TTFB percentiles and unverifiable content refuse",()=>{
 let r=fixture();r.summary.lcpMs.p95+=100;assert.throws(()=>audit(r),/Reported percentile/);
 r=fixture();r.rows[0].metrics.finalLcp.startTime=0;assert.throws(()=>audit(r),/Missing or impossible/);
 r=fixture();const bytes=Buffer.from(JSON.stringify(r,null,2)+"\n"+" ");
 assert.throws(()=>inspectKingdomColdBrowserReceipt(bytes,exp),/Noncanonical/);
 const duplicate=Buffer.from(JSON.stringify(r,null,2).replace('"schema": 1','"schema": 1,\n  "schema": 1')+"\n");
 assert.throws(()=>inspectKingdomColdBrowserReceipt(duplicate,exp),/Noncanonical/);
});
test("missing Ready remains explicitly incomplete, never a zero-filled success",()=>{
 const r=fixture();r.rows[0].metrics.readyMs=null;
 const values=r.rows.map(x=>x.metrics.readyMs).filter(x=>x!==null);
 r.summary.readyMs=sum(values);
 const out=audit(r);assert.equal(out.status,"INCOMPLETE_BROWSER_READY");
 assert.equal(out.readyMs,null);assert.equal(out.readyCoverage,9);assert.equal(out.score,null);
});

test("cold Chrome flags and retry metadata cannot contradict individual samples",()=>{
 let r=fixture();r.rows[0].documentFromDiskCache=true;
 assert.throws(()=>audit(r),/cached or unsuccessful/);
 r=fixture();r.rows[0].documentFromServiceWorker=true;
 assert.throws(()=>audit(r),/cached or unsuccessful/);
 r=fixture();r.rows[0].harnessAttempt=2;
 assert.throws(()=>audit(r),/unsuccessful/);
 r=fixture();r.rows[0].harnessAttempt=2;r.retriedSamples=[1];
 assert.equal(audit(r).status,"SOURCE_BOUND_BROWSER_DIAGNOSTIC");
 r.retriedSamples=[1,1];
 assert.throws(()=>audit(r),/retry metadata/);
 r=fixture();r.sampleAttempts=4;
 assert.throws(()=>audit(r),/retry metadata/);
});
test("impossible LCP-before-TTFB and forged partial Ready percentiles refuse",()=>{
 let r=fixture();r.rows[0].metrics.finalLcp.startTime=1;
 assert.throws(()=>audit(r),/impossible/);
 r=fixture();r.rows[0].metrics.readyMs=null;
 const partial=r.rows.map(x=>x.metrics.readyMs).filter(x=>x!==null);
 r.summary.readyMs=sum(partial);
 assert.equal(audit(r).readyCoverage,9);
 r.summary.readyMs.p95+=50;
 assert.throws(()=>audit(r),/Partial Ready percentile drift/);
});

test("legacy responseStart is not mislabeled as network TTFB",()=>{
 const r=fixture();
 // Same network duration across samples, but navigation overhead changes.
 r.rows.forEach((row,i)=>{row.metrics.navigation.requestStart=10+i*2;});
 const out=audit(r);
 assert.equal(out.navigationResponseStartMs.p95,127.75);
 assert.ok(Math.abs(out.networkTtfbMs.p95-100.65)<1e-9);
});
test("missing or later-than-response requestStart is rejected as non-measured TTFB",()=>{
 let r=fixture();delete r.rows[0].metrics.navigation.requestStart;
 assert.throws(()=>audit(r),/Missing or impossible/);
 r=fixture();r.rows[0].metrics.navigation.requestStart=r.rows[0].metrics.navigation.responseStart;
 assert.throws(()=>audit(r),/Missing or impossible/);
 r=fixture();r.rows[0].metrics.navigation.requestStart=-1;
 assert.throws(()=>audit(r),/Missing or impossible/);
});
