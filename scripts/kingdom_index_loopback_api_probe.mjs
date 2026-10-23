#!/usr/bin/env node
/**
 * Bounded, loopback-only Kingdom Index API observation.
 * Never calls finance, admin, signing or mutation endpoints; no redirects,
 * credentials or production hosts. Real local runtime required for evidence.
 * This does not certify origin, web-browser UX, database truth or 100 points.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const MAX_BYTES=512*1024;
const CHECKS=88;
const stop=m=>{throw Error("KINGDOM API PROBE STOP: "+m)};
const pct=(a,q)=>{
 const values=[...a].sort((x,y)=>x-y);const pos=(values.length-1)*q;
 return Math.round((values[Math.floor(pos)]+(values[Math.ceil(pos)]-values[Math.floor(pos)])*(pos-Math.floor(pos)))*1000)/1000;
};
export function validateIndexApiSnapshot(obj,headers){
 if(!obj||obj.schema!==1||!Array.isArray(obj.pages)||obj.pages.length!==CHECKS||
   !obj.estate||obj.estate.pageTemplates!==144||
   obj.estate.routeHandlerTemplates!==279||
   typeof obj.certified!=="number"||typeof obj.generatedAt!=="string")
   stop("Untrusted/missing estate contract");
 const hrefs=new Set(),invalid=[];
 for(const row of obj.pages){
   if(!row||typeof row.href!=="string"||hrefs.has(row.href))invalid.push("duplicate/invalid route");
   else hrefs.add(row.href);
   if(row.score!==null && (!Number.isInteger(row.score)||row.score<0||row.score>100))
      invalid.push("unbounded score");
   if(row.status==="current"&&row.kind==="certified"&&
      (!row.authenticatedPublication||row.score!==100))
      invalid.push("self-certified without proof metadata");
   if(row.status!=="current"&&row.score===100)
      invalid.push("unqualified 100");
   if(row.href==="/kingdom-index"&&row.authenticatedPublication?.buildId &&
     typeof row.authenticatedPublication.buildId!=="string")
      invalid.push("invalid build id");
 }
 if(!hrefs.has("/kingdom-index"))invalid.push("Index missing");
 const certified=obj.pages.filter(x=>x.status==="current"&&x.kind==="certified").length;
 if(obj.certified!==certified)invalid.push("certified total mismatch");
 const cache=headers.get("cache-control")?.toLowerCase()??"";
 if(!cache.includes("no-store"))invalid.push("public cacheable certification endpoint");
 if(invalid.length)stop("Data integrity or privacy fence: "+invalid.join(", "));
 return {routes:hrefs.size,certified,estate:obj.estate.pageTemplates};
}
export async function captureIndexLoopback({origin,samples=12,expectedBuildId,delayMs=0,fetchImpl=fetch}){
 let u;
 try{u=new URL(origin)}catch{stop("Invalid loopback origin")}
 if(u.protocol!=="http:"||!["127.0.0.1","[::1]","localhost"].includes(u.hostname)||
   u.username||u.password||u.search||u.hash||u.pathname!=="/"||!u.port)
   stop("Only explicit local HTTP host/port permitted");
 if(!Number.isInteger(samples)||samples<4||samples>20||
   !Number.isInteger(delayMs)||delayMs<0||delayMs>250||
   typeof expectedBuildId!=="string"||expectedBuildId.length<5||expectedBuildId.length>128)
   stop("Invalid finite sample or exact build parameters");
 const rows=[],states=[];
 for(let i=0;i<samples;i++){
   const start=performance.now();
   const response=await fetchImpl(new URL("/api/kingdom-index",u),{
     method:"GET",redirect:"manual",credentials:"omit",cache:"no-store",
     headers:{"accept":"application/json"},signal:AbortSignal.timeout(10000),
   });
   if(response.status!==200)stop("API non-200 or redirected "+response.status);
   const declared=Number(response.headers.get("content-length")??"0");
   if(!Number.isFinite(declared)||declared<0||declared>MAX_BYTES)
      stop("API declared body exceeds safe bound");
   if(!response.body)stop("Missing API response body");
   const reader=response.body.getReader(),chunks=[];
   let byteCount=0;
   try{
     for(;;){
       const {value,done}=await reader.read();
       if(done)break;
       byteCount+=value.byteLength;
       if(byteCount>MAX_BYTES)stop("API streaming body exceeds safe bound");
       chunks.push(value);
     }
   }finally{await reader.cancel().catch(()=>{});}
   if(byteCount<2)stop("Missing API response data");
   const raw=new Uint8Array(byteCount);
   let offset=0;
   for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
   let snapshot;
   try{snapshot=JSON.parse(new TextDecoder().decode(raw))}catch{stop("API invalid JSON")}
   const elapsed=Math.round((performance.now()-start)*1000)/1000;
   const state=validateIndexApiSnapshot(snapshot,response.headers);
   const self=snapshot.pages.find(x=>x.href==="/kingdom-index");
   if(self?.authenticatedPublication&&self.authenticatedPublication.buildId!==expectedBuildId)
      stop("Observed public certificate build mismatches local emitted build");
   rows.push({sequence:i+1,elapsedMs:elapsed,responseBytes:byteCount,
     certified:state.certified,kingdomIndexStatus:self?.status??"unmeasured",
     indexScore:self?.score??null});
   states.push(JSON.stringify({certified:snapshot.certified,score:self?.score??null,status:self?.status}));
   if(delayMs&&i!==samples-1)await new Promise(r=>setTimeout(r,delayMs));
 }
 const timings=rows.map(x=>x.elapsedMs);
 const output={schema:1,kind:"aoe2war.kingdom-index.loopback-api-observation.v1",
   origin:"LOOPBACK_ONLY",route:"/api/kingdom-index",buildId:expectedBuildId,
   samples:rows.length,latencyMs:{p50:pct(timings,0.5),p75:pct(timings,0.75),p95:pct(timings,0.95)},
   observed:rows,consistent:states.every(x=>x===states[0]),
   certified:false,criterionPointsAwarded:null,
   note:"An actual local API request cohort only. NOT mobile browser, controlled DB workload, production parity, sustained external concurrency or independent certification."
 };
 return {...output,sha256:createHash("sha256").update(JSON.stringify(output)).digest("hex")};
}
async function main(){
  const argv=process.argv.slice(2),options={};
  if(argv.length!==6)stop("Require exactly --origin, --samples, --expected-build-id");
  for(let i=0;i<argv.length;i+=2){
    const k=argv[i]?.startsWith("--")?argv[i].slice(2):"";
    if(!["origin","samples","expected-build-id"].includes(k)||Object.hasOwn(options,k))
      stop("Unsupported/repeated argument");
    options[k]=argv[i+1];
  }
  const realBuildId=(await readFile(resolve(".next/BUILD_ID"),"utf8")).trim();
  if(options["expected-build-id"]!==realBuildId)stop("Runtime Next BUILD_ID mismatches local emitted build");
  const report=await captureIndexLoopback({
    origin:options.origin,samples:Number(options.samples),
    expectedBuildId:realBuildId,delayMs:150,
  });
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(!report.consistent)process.exitCode=2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1]))
  main().catch(e=>{console.error(String(e.message));process.exitCode=2;});
