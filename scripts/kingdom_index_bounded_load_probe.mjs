#!/usr/bin/env node
/**
 * Read-only bounded concurrent Next API smoke observation, never a sustained
 * production load/capacity or database benchmark. Strict local origin only.
 */
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {realpath} from "node:fs/promises";
import {validateIndexApiSnapshot} from "./kingdom_index_loopback_api_probe.mjs";
const MAX_BYTES=524288;
const stop=m=>{throw Error("KINGDOM LOAD STOP: "+m)};
const percentile=(a,p)=>{
 const b=[...a].sort((x,y)=>x-y),n=(b.length-1)*p,lo=Math.floor(n),hi=Math.ceil(n);
 return Math.round((b[lo]+(b[hi]-b[lo])*(n-lo))*1000)/1000;
};
export async function captureIndexConcurrentLoopback({
 origin,expectedBuildId,sourceSha,concurrency=4,requests=40,fetchImpl=fetch
}){
 const SHA40=/^[a-f0-9]{40}$/;
 let u;try{u=new URL(origin)}catch{stop("Invalid local origin")}
 if(u.protocol!=="http:"||!["127.0.0.1","[::1]","localhost"].includes(u.hostname)||
    !u.port||u.pathname!=="/"||u.search||u.hash||u.username||u.password||
    !SHA40.test(sourceSha)||typeof expectedBuildId!=="string"||
    expectedBuildId.length<5||expectedBuildId.length>128||
    !Number.isInteger(concurrency)||concurrency<2||concurrency>4||
    !Number.isInteger(requests)||requests<20||requests>40||requests%concurrency!==0)
    stop("Unbounded request or untrusted exact candidate identity");
 const seen=new Array(requests),states=new Set();
 const started=performance.now();
 async function worker(id){
  for(let index=id;index<requests;index+=concurrency){
   const t=performance.now();
   const r=await fetchImpl(new URL("/api/kingdom-index",u),{
    method:"GET",cache:"no-store",redirect:"manual",credentials:"omit",
    headers:{accept:"application/json"},signal:AbortSignal.timeout(10000)
   });
   if(r.status!==200||!r.body)stop("Non-200, redirect or missing response");
   const declared=Number(r.headers.get("content-length")??0);
   if(!Number.isFinite(declared)||declared<0||declared>MAX_BYTES)stop("Oversized HTTP response");
   const reader=r.body.getReader(),parts=[];let bytes=0;
   try{for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;if(bytes>MAX_BYTES)stop("Unbounded streamed body");
    parts.push(value);
   }}finally{await reader.cancel().catch(()=>{})}
   const raw=new Uint8Array(bytes);let pos=0;
   for(const part of parts){raw.set(part,pos);pos+=part.byteLength}
   let d;try{d=JSON.parse(new TextDecoder().decode(raw))}catch{stop("Invalid response JSON")}
   const verified=validateIndexApiSnapshot(d,r.headers);
   const self=d.pages.find(x=>x.href==="/kingdom-index");
   if(!self||self.score!==null||self.status==="current"||
      self.authenticatedPublication!=null)stop("Unapproved score on candidate runtime");
   if(bytes!==declared&&declared!==0)stop("Content-length mismatch");
   const elapsed=Math.round((performance.now()-t)*1000)/1000;
   seen[index]={sequence:index+1,elapsedMs:elapsed,responseBytes:bytes,
    routeCount:verified.routes,certified:verified.certified,
    indexStatus:self.status,indexScore:self.score};
   states.add(JSON.stringify([verified.routes,verified.certified,self.status,self.score,bytes]));
  }
 }
 await Promise.all(Array.from({length:concurrency},(_,id)=>worker(id)));
 const wallMs=Math.round((performance.now()-started)*1000)/1000;
 if(seen.some(x=>!x)||states.size!==1)stop("Contradictory or missing concurrent responses");
 const latency=seen.map(x=>x.elapsedMs);
 const report={schema:1,kind:"aoe2war.kingdom-index.concurrent-loopback-smoke.v1",
  sourceSha,buildId:expectedBuildId,origin:"LOOPBACK_ONLY",
  endpoint:"/api/kingdom-index",concurrency,requests,wallMs,
  latencyMs:{p50:percentile(latency,.5),p75:percentile(latency,.75),p95:percentile(latency,.95)},
  consistent:true,observed:seen,errors:0,
  certified:false,criterionPointsAwarded:null,
  limitations:"Forty or fewer real isolated candidate GETs in a bounded concurrent burst. NOT sustained representative load, authenticated production environment, DB query plan, live performance budget or criterion credit."};
 return {...report,sha256:createHash("sha256").update(JSON.stringify(report)).digest("hex")};
}
async function main(){
 const a=process.argv.slice(2),args={};
 if(a.length!==6)stop("Require --origin, --source-sha and --expected-build-id");
 for(let i=0;i<a.length;i+=2){
  const key=a[i]?.startsWith("--")?a[i].slice(2):"";
  if(!["origin","source-sha","expected-build-id"].includes(key)||Object.hasOwn(args,key))
   stop("Invalid or duplicate argument");
  args[key]=a[i+1];
 }
 const actual=(await readFile(resolve(".next/BUILD_ID"),"utf8")).trim();
 if(actual!==args["expected-build-id"])stop("Local emitted BUILD_ID drift");
 const report=await captureIndexConcurrentLoopback({origin:args.origin,
  expectedBuildId:actual,sourceSha:args["source-sha"]});
 process.stdout.write(JSON.stringify(report,null,2)+"\n");
}
if(process.argv[1]&&await realpath(resolve(process.argv[1])).catch(()=>null)===fileURLToPath(import.meta.url))
 main().catch(e=>{console.error(String(e.message));process.exitCode=2});
