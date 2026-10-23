import assert from "node:assert/strict";
import test from "node:test";
import { captureIndexLoopback,validateIndexApiSnapshot } from "../scripts/kingdom_index_loopback_api_probe.mjs";
type Row={href:string;status:string;score:number|null;kind:string|null;authenticatedPublication:null|{buildId:string}};
const mk=()=>{
 const pages:Row[]=Array.from({length:87},(_,i)=>({
   href:"/fixture-"+i,status:"unmeasured",score:null,kind:null,
   authenticatedPublication:null
 }));
 pages.push({href:"/kingdom-index",status:"unmeasured",score:null,kind:null,authenticatedPublication:null});
 return {schema:1,generatedAt:"2026-10-22T18:00:00.000Z",
   estate:{pageTemplates:144,routeHandlerTemplates:279},certified:0,pages};
};
const headers=new Headers({"cache-control":"private, no-store, max-age=0"});
test("valid finite loopback cohort returns measured local latency but never a certificate",async()=>{
 let calls=0;const response=async(url:URL,options:RequestInit)=>{
   assert.equal(url.href,"http://127.0.0.1:3000/api/kingdom-index");
   assert.equal(options.method,"GET");
   assert.equal(options.credentials,"omit");
   assert.equal(options.redirect,"manual");
   calls++;
   return new Response(JSON.stringify(mk()),{status:200,headers});
 };
 const r=await captureIndexLoopback({origin:"http://127.0.0.1:3000/",samples:4,
   expectedBuildId:"example-Next-BUILD-ID",fetchImpl:response});
 assert.equal(calls,4);assert.equal(r.samples,4);
 assert.equal(r.certified,false);assert.equal(r.criterionPointsAwarded,null);
 assert.equal(r.consistent,true);assert.match(r.sha256,/^[a-f0-9]{64}$/);
});
test("no arbitrary network targets, credentials, DNS redirect or oversized sample cohort",async()=>{
 const args={samples:4,expectedBuildId:"exact-build-123",fetchImpl:async()=>{throw Error("unexpected fetch")}};
 for(const origin of ["https://aoe2war.com/","http://example.com:3000/",
   "http://user:password@127.0.0.1:3000/","http://127.0.0.1:3000/secret",
   "http://127.0.0.1:3000/?foo=1","http://127.0.0.1:3000/"]){
   if(origin==="http://127.0.0.1:3000/")continue;
   await assert.rejects(captureIndexLoopback({...args,origin}),/Only explicit local HTTP/);
 }
 await assert.rejects(captureIndexLoopback({...args,origin:"http://127.0.0.1:3000/",samples:200}),/Invalid finite sample/);
});
test("denies invented 100 and unsupported cached current certificate",()=>{
 const v=mk();v.pages.at(-1)!.score=100;
 assert.throws(()=>validateIndexApiSnapshot(v,headers),/unqualified 100/);
 const w=mk();w.pages.at(-1)!.status="current";w.pages.at(-1)!.kind="certified";w.pages.at(-1)!.score=100;w.certified=1;
 assert.throws(()=>validateIndexApiSnapshot(w,headers),/without proof metadata/);
 const safe=mk();
 assert.throws(()=>validateIndexApiSnapshot(safe,new Headers({"cache-control":"public, max-age=3600"})),/cacheable/);
});
test("rejects duplicate inventory rows, invented counts and inconsistent certified totals",()=>{
 const x=mk();x.pages[0].href=x.pages[1].href;
 assert.throws(()=>validateIndexApiSnapshot(x,headers),/duplicate/);
 const y=mk();y.estate.pageTemplates=145;
 assert.throws(()=>validateIndexApiSnapshot(y,headers),/estate/);
 const z=mk();z.certified=1;
 assert.throws(()=>validateIndexApiSnapshot(z,headers),/certified total mismatch/);
});
test("rejects non-200, redirect and untrusted JSON without following network",async()=>{
 const args={origin:"http://localhost:3011/",samples:4,expectedBuildId:"example-BUILD-ID"};
 const fn=async()=>new Response("redirect",{status:302,headers:{location:"https://example.com"}});
 await assert.rejects(captureIndexLoopback({...args,fetchImpl:fn}),/non-200 or redirected/);
 const bad=async()=>new Response("invalid-json",{status:200,headers});
 await assert.rejects(captureIndexLoopback({...args,fetchImpl:bad}),/invalid JSON/);
});
