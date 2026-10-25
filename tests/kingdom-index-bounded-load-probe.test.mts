import test from "node:test";
import assert from "node:assert/strict";
import {captureIndexConcurrentLoopback} from "../scripts/kingdom_index_bounded_load_probe.mjs";
import inventory from "../config/kingdom-index-inventory.json" with {type:"json"};
const sourceSha="a".repeat(40),buildId="next-build-exact-123";
const opts={origin:"http://127.0.0.1:3030/",expectedBuildId:buildId,sourceSha};
function response({status=200,score=null,cache="no-store",wrongRows=false}:{status?:number;score?:number|null;cache?:string;wrongRows?:boolean}={}){
 const pages=Array.from({length:88},(_,i)=>({
  href:i===0?"/kingdom-index":"/fixture-route-"+i,
  score:i===0?score:null,
  status:i===0&&score!==null?"current":"unmeasured",
  kind:i===0&&score!==null?"certified":null,
  authenticatedPublication:null
 }));
 if(wrongRows)pages.pop();
 const body=JSON.stringify({schema:1,pages,certified:0,
  generatedAt:"2026-10-22T21:20:00.000Z",
  estate:{...inventory.counts}});
 return new Response(body,{status,headers:{"cache-control":cache,"content-length":String(Buffer.byteLength(body))}});
}
test("40 bounded concurrent real-shaped GET samples never imply sustainable load or a score",async()=>{
 let observed=0;
 const report=await captureIndexConcurrentLoopback({...opts,
  fetchImpl:async()=>{observed++;return response()}
 });
 assert.equal(observed,40);
 assert.equal(report.requests,40);assert.equal(report.concurrency,4);
 assert.equal(report.errors,0);assert.equal(report.certified,false);
 assert.equal(report.criterionPointsAwarded,null);
 assert.equal(report.observed.length,40);
 assert.equal(report.latencyMs.p95>=report.latencyMs.p75,true);
 assert.match(report.sha256,/^[a-f0-9]{64}$/);
});
test("untrusted target and excessive concurrency/burst requests refuse",async()=>{
 for(const input of [{...opts,origin:"https://aoe2war.com/"},
 {...opts,origin:"http://127.0.0.1:3030/extra"},
 {...opts,concurrency:5},{...opts,requests:100},
 {...opts,sourceSha:"bad"}]){
  await assert.rejects(captureIndexConcurrentLoopback({...input,fetchImpl:async()=>response()}));
 }
});
test("fail closed on HTML/redirect, missing route, public certificate, unsafe caching",async()=>{
 for(const make of [
  ()=>response({status:302}),()=>response({wrongRows:true}),
  ()=>response({score:100}),()=>response({cache:"public,max-age=600"})
 ]){
  await assert.rejects(captureIndexConcurrentLoopback({...opts,requests:20,
   fetchImpl:async()=>make()}));
 }
});
test("bounded declared body ceiling rejects without accumulating large bytes",async()=>{
 await assert.rejects(captureIndexConcurrentLoopback({...opts,requests:20,
  fetchImpl:async()=>new Response("{}",{status:200,headers:{
   "cache-control":"no-store","content-length":"99999999"
  }})}));
});

test("stale or forged bounded-load estate counts are never accepted",async()=>{
 const previous=inventory.counts.pageTemplates;
 assert.ok(Number.isSafeInteger(previous) && previous>=88);
 const malformed=response();
 const payload=await malformed.json();
 payload.estate.routeHandlerTemplates=inventory.counts.routeHandlerTemplates-1;
 const bad=async()=>new Response(JSON.stringify(payload),{
  status:200,headers:{"cache-control":"no-store"}
 });
 await assert.rejects(captureIndexConcurrentLoopback({
  ...opts,requests:20,fetchImpl:bad
 }),/Untrusted\/missing estate contract/);
});
