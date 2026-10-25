/** Publicly safe, candidate-only Renaissance observations in a private operator file. */
import {open} from "node:fs/promises";
import {constants} from "node:fs";
import {dirname,isAbsolute} from "node:path";
import catalog from "../config/kingdom-index-routes.json" with {type:"json"};
const SHA=/^[a-f0-9]{40}$/, DIGEST=/^[a-f0-9]{64}$/, BUILD=/^[A-Za-z0-9_-]{5,128}$/;
const STATES=["PASS","FAIL","UNKNOWN","UNMEASURED"];
const ROUTES=new Set(catalog.map(r=>r.href));
const MAX_BYTES=48000, MAX_AGE_MS=36*60*60*1000, FUTURE_MS=2*60*1000;
const empty=(status="UNAVAILABLE")=>({
 schema:1,kind:"aoe2war.kingdom-index.live-candidate-public.v1",
 status,sourceAuthority:"GITHUB_ACTIONS_CANDIDATE_NOT_CERTIFICATION",
 checkedAt:null,runId:null,runUrl:null,sourceSha:null,buildId:null,
 routeCounts:null,routes:null,accessibility:null,
 signedCriteriaApproved:null,certifiedScores:null,certificationAuthority:"NOT_PROVIDED"
});
const object=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const date=x=>typeof x==="string"&&x.length<=40&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
export function projectLiveCandidate(input,nowMs=Date.now()){
 if(!object(input)||input.schema!==1||
    input.kind!=="aoe2war.kingdom-index.candidate-browser-feed.v1"||
    input.authority!=="CI_CANDIDATE_ONLY"||
    input.certified!==false||input.score!==null||
    typeof input.runId!=="number"||!Number.isSafeInteger(input.runId)||input.runId<1||
    !SHA.test(input.sourceSha)||!BUILD.test(input.buildId)||
    !DIGEST.test(input.artifactSha256)||!DIGEST.test(input.coverageSha256)||
    input.runUrl!==("https://github.com/Emaren/app-prodn/actions/runs/"+input.runId)||
    !object(input.routes)||Object.keys(input.routes).length!==88||
    ROUTES.size!==88||!object(input.counts))
  return empty("INVALID");
 const when=date(input.observedAt);
 if(!Number.isFinite(when)||when>nowMs+FUTURE_MS)return empty("INVALID");
 const counts={PASS:0,FAIL:0,UNKNOWN:0,UNMEASURED:0};
 for(const [href,state] of Object.entries(input.routes)){
  if(!ROUTES.has(href)||!STATES.includes(state))return empty("INVALID");
  counts[state]++;
 }
 if(STATES.some(k=>input.counts[k]!==counts[k])||
    Object.keys(input.counts).length!==4||
    Object.values(counts).reduce((a,b)=>a+b,0)!==88)
  return empty("INVALID");
 let accessibility=null;
 if(input.accessibility!==null){
  const a=input.accessibility;
  if(!object(a)||Object.keys(a).sort().join(",")!=="affectedRoutes,scannedRoutes"||
    !Number.isInteger(a.scannedRoutes)||a.scannedRoutes<0||a.scannedRoutes>88||
    !Number.isInteger(a.affectedRoutes)||a.affectedRoutes<0||
    a.affectedRoutes>a.scannedRoutes)return empty("INVALID");
  accessibility={scannedRoutes:a.scannedRoutes,affectedRoutes:a.affectedRoutes};
 }
 const stale=nowMs-when>MAX_AGE_MS;
 return {...empty(stale?"STALE":"CURRENT"),checkedAt:new Date(when).toISOString(),
  runId:input.runId,runUrl:input.runUrl,sourceSha:input.sourceSha,buildId:input.buildId,
  routeCounts:counts,routes:input.routes,accessibility};
}
async function privateFile(file){
 if(!isAbsolute(file)||file.includes("\0"))throw Error("Invalid private path");
 const folder=await open(dirname(file),constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{
  const dir=await folder.stat();
  if(!dir.isDirectory()||(dir.mode&0o077)!==0||
     (typeof process.geteuid==="function"&&dir.uid!==process.geteuid()))
    throw Error("Unsafe feed directory");
  const fd=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
   const st=await fd.stat();
   if(!st.isFile()||st.nlink!==1||st.size<50||st.size>MAX_BYTES||
     (st.mode&0o077)!==0||
     (typeof process.geteuid==="function"&&st.uid!==process.geteuid()))
    throw Error("Unsafe feed file");
   const bytes=Buffer.alloc(st.size+1);
   const read=await fd.read(bytes,0,bytes.length,0);
   if(read.bytesRead!==st.size)throw Error("Feed changed during read");
   return bytes.subarray(0,read.bytesRead).toString("utf8");
  }finally{await fd.close();}
 }finally{await folder.close();}
}
export async function readKingdomIndexLiveCandidate(nowMs=Date.now()){
 try{
  const file=process.env.KINGDOM_INDEX_LIVE_PROGRESS_PATH;
  if(!file)return empty();
  return projectLiveCandidate(JSON.parse(await privateFile(file)),nowMs);
 }catch{return empty();}
}
