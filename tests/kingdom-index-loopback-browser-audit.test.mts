import test from "node:test";
import assert from "node:assert/strict";
import {inspectIndexLoopbackChrome} from "../scripts/kingdom_index_loopback_browser_audit.mjs";
const SHA="1".repeat(40),COLLECTOR="2".repeat(40),ID="next-build-id-exact";
const URL="http://127.0.0.1:3030/kingdom-index";
const expected={sourceSha:SHA,collectorSha:COLLECTOR,buildId:ID,url:URL,viewport:"desktop"};
function sample(i:number){
 const start=220+i;
 return {sample:i,viewport:"desktop",loaded:true,documentStatus:200,
   documentFromDiskCache:false,documentFromServiceWorker:false,
   metrics:{href:URL,readyMs:400+i,finalLcp:{startTime:700+i},
     navigation:{requestStart:80,responseStart:start,responseEnd:250+i}}};
}
function receipt(){
 const rows=Array.from({length:10},(_,i)=>sample(i+1));
 return {schema:1,kind:"aoe2war-cold-process-lcp",releaseSha:SHA,buildVersion:ID,
 collectorSourceSha:COLLECTOR,url:URL,viewport:"desktop",samples:10,
 productionMutated:false,databaseMutated:false,woloMutated:false,rows,
 summary:{lcpMs:{count:10,p50:705.5,p75:707.75,p95:709.55,max:710}}};
}
const raw=(doc:any)=>Buffer.from(JSON.stringify(doc,null,2)+"\n");
test("10 actual-shaped source aligned Chrome samples produce ONLY noncertifying loopback observation",()=>{
 const d=inspectIndexLoopbackChrome(raw(receipt()),expected);
 assert.equal(d.samples,10);assert.equal(d.certified,false);assert.equal(d.score,null);
 assert.equal(d.status,"REAL_CHROME_LOOPBACK_OBSERVED");
 assert.equal(d.measured.lcpMs.p95,709.55);
 assert.match(d.rawReceiptSha256,/^[a-f0-9]{64}$/);
});
test("refuse wrong source SHA, build, route, viewport and incomplete Chrome cohort",()=>{
 const changes=[
  {releaseSha:"f".repeat(40)},{buildVersion:"wrong-build"},{url:"http://127.0.0.1:3030/kingdom-tests"},
  {viewport:"phone"},{samples:9}
 ];
 for(const change of changes)assert.throws(()=>inspectIndexLoopbackChrome(raw({...receipt(),...change}),expected));
});
test("duplicate, cached, failure, no LCP and untrustworthy percentile refuse",()=>{
 for(const rewrite of [
  (d:any)=>{d.rows[9].sample=1},
  (d:any)=>{d.rows[0].documentStatus=500},
  (d:any)=>{d.rows[0].documentFromDiskCache=true},
  (d:any)=>{d.rows[0].metrics.finalLcp=null},
  (d:any)=>{d.rows[0].metrics.href="/another-route"},
  (d:any)=>{d.summary.lcpMs.p95=1},
 ]){
  const d=receipt();rewrite(d);
  assert.throws(()=>inspectIndexLoopbackChrome(raw(d),expected));
 }
});
test("missing readiness never silently becomes positive completion",()=>{
 const d=receipt();d.rows[1].metrics.readyMs=undefined as never;
 const v=inspectIndexLoopbackChrome(raw(d),expected);
 assert.equal(v.status,"INCOMPLETE_BROWSER_READINESS");
 assert.equal(v.measured.readyMs,null);assert.equal(v.certified,false);
});
test("reject duplicate keys and underpopulated sample bytes",()=>{
 const d=raw(receipt());const changed=d.toString().replace('"schema": 1,','"schema": 1,\n  "schema": 1,');
 assert.throws(()=>inspectIndexLoopbackChrome(Buffer.from(changed),expected),/Noncanonical/);
 assert.throws(()=>inspectIndexLoopbackChrome(Buffer.from("{}"),expected),/Missing\/oversized/);
});
