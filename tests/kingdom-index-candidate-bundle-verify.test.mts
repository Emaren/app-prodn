import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {inspectIndexLoopbackChrome} from "../scripts/kingdom_index_loopback_browser_audit.mjs";
import {verifyIndexCandidateBundle} from "../scripts/kingdom_index_candidate_bundle_verify.mjs";

const sha="1".repeat(40),tree="2".repeat(40),collector="3".repeat(40),buildId="next-exact-build-123";
const args={sourceSha:sha,buildId,collectorSha:collector};
const hash=(x:Buffer|string)=>createHash("sha256").update(x).digest("hex");
const digest=(x:Record<string,unknown>,k:string)=>({...x,[k]:hash(JSON.stringify(x))});
const percentile=(values:number[],q:number)=>{
 const a=[...values].sort((x,y)=>x-y),at=(a.length-1)*q,lo=Math.floor(at),hi=Math.ceil(at);
 return Math.round((a[lo]+(a[hi]-a[lo])*(at-lo))*1000)/1000;
};
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),"kingdom-candidate-bundle-"));
 await mkdir(join(root,"chrome-desktop"));
 await mkdir(join(root,"chrome-phone"));
 const put=async(n:string,v:unknown)=>writeFile(join(root,n),JSON.stringify(v,null,2)+"\n");
 for(const phase of ["checkout","dependencies","built","emitted"]){
  const row=digest({kind:"aoe2war.kingdom-index.tracked-source-provenance.v1",schema:1,
   expectedSha:sha,headSha:sha,headTreeSha:tree,phase,trackedClean:true,
   trackedChangedFiles:[],sourceIdentity:"HEAD_AND_TRACKED_CONTENT_AGREE"},"sha256");
  await put("source-"+phase+".json",row);
 }
 const names=[".next/BUILD_ID",".next/build-manifest.json",".next/required-server-files.json",
 ".next/server/app-paths-manifest.json",".next/server/app/kingdom-index/page.js",
 ".next/server/app/api/kingdom-index/route.js",
 ".next/server/app/kingdom-index/page.js.nft.json",
 ".next/server/app/api/kingdom-index/route.js.nft.json",
 "lib/generated/prisma/index.js"];
 const files=names.map((path,i)=>({path,bytes:i+11,sha256:hash(path)}));
 const total=files.reduce((n,f)=>n+f.bytes,0);
 const emitted=digest({schema:1,kind:"aoe2war.kingdom-index.emitted-source-capture.v1",
  route:"/kingdom-index",sourceSha:sha,buildId,limitations:[],files,missing:[],invalidTraces:[],
  budget:{maxFiles:6000,maxBytes:805306368,remainingBytes:805306368-total},
  status:"OBSERVED_NOT_CERTIFIED",certified:false,publicationAuthorized:false},"receiptSha256");
 await put("emitted-closure.json",emitted);
 const times=Array.from({length:12},(_,i)=>12+i);
 const api=digest({schema:1,kind:"aoe2war.kingdom-index.loopback-api-observation.v1",
  origin:"LOOPBACK_ONLY",route:"/api/kingdom-index",buildId,samples:12,
  latencyMs:{p50:percentile(times,.5),p75:percentile(times,.75),p95:percentile(times,.95)},
  observed:times.map((v,i)=>({sequence:i+1,elapsedMs:v,responseBytes:1024,certified:0,
    kingdomIndexStatus:"unmeasured",indexScore:null})),
  consistent:true,certified:false,criterionPointsAwarded:null,note:"Uncertified synthetic fixture"},"sha256");
 await put("api-loopback.json",api);
 for(const viewport of ["desktop","phone"]){
  const url="http://127.0.0.1:3030/kingdom-index";
  const rows=Array.from({length:10},(_,i)=>({
   sample:i+1,viewport,loaded:true,documentStatus:200,
   documentFromDiskCache:false,documentFromServiceWorker:false,
   metrics:{href:url,readyMs:400+i,finalLcp:{startTime:700+i},
     navigation:{requestStart:80,responseStart:220+i,responseEnd:250+i}}
  }));
  const d={schema:1,kind:"aoe2war-cold-process-lcp",url,releaseSha:sha,buildVersion:buildId,
   collectorSourceSha:collector,viewport,samples:10,productionMutated:false,
   databaseMutated:false,woloMutated:false,
   rows,summary:{lcpMs:{count:10,p50:704.5,p75:706.75,p95:708.55,max:709}}};
  const raw=Buffer.from(JSON.stringify(d,null,2)+"\n");
  await writeFile(join(root,"chrome-"+viewport,"receipt.json"),raw);
  const inspected=inspectIndexLoopbackChrome(raw,{...args,viewport,url});
  await put("chrome-"+viewport+"/inspection.json",inspected);
 }
 return root;
}
async function mutate(root:string,path:string,cb:(doc:Record<string,unknown>)=>void){
 const p=join(root,path),doc=JSON.parse(await readFile(p,"utf8"));
 cb(doc);await writeFile(p,JSON.stringify(doc,null,2)+"\n");
}
test("complete synthetic exact-bound bundle is internally consistent but never certifies",async()=>{
 const root=await fixture();
 try{
  const r=await verifyIndexCandidateBundle(root,args);
  assert.equal(r.status,"SELF_CONSISTENT_CANDIDATE_EVIDENCE_ONLY");
  assert.equal(r.emitted.files,9);
  assert.equal(r.chrome.desktop.samples,10);
  assert.equal(r.chrome.phone.samples,10);
  assert.equal(r.api.samples,12);
  assert.equal(r.certified,false);
  assert.equal(r.criterionPointsAwarded,null);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("wrong expected source, build, collector and cross-route receipts are rejected",async()=>{
 const root=await fixture();
 try{
  for(const changed of [
   {...args,sourceSha:"9".repeat(40)},
   {...args,buildId:"different-Next-build"},
   {...args,collectorSha:"9".repeat(40)}
  ])await assert.rejects(verifyIndexCandidateBundle(root,changed));
  await mutate(root,"emitted-closure.json",d=>{d.route="/kingdom-brain"});
  await assert.rejects(verifyIndexCandidateBundle(root,args),/checksum mismatch/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("forged source-clean checkpoint and duplicate/missing critical emitted file refuse",async()=>{
 const root=await fixture();
 try{
  await mutate(root,"source-built.json",d=>{d.trackedClean=false});
  await assert.rejects(verifyIndexCandidateBundle(root,args),/checksum mismatch/);
  await mutate(root,"source-built.json",d=>{d.trackedClean=true;d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))))});
  const ok=await verifyIndexCandidateBundle(root,args);assert.equal(ok.certified,false);
  await mutate(root,"emitted-closure.json",d=>{
   const files=d.files as Array<{path:string}>;
   files[0].path=files[1].path;
   const next=Object.fromEntries(Object.entries(d).filter(([k])=>k!=="receiptSha256"));
   d.receiptSha256=hash(JSON.stringify(next));
  });
  await assert.rejects(verifyIndexCandidateBundle(root,args),/Duplicated|Missing critical/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("mutated Chrome raw bytes or mislabeled inspected SHA are rejected",async()=>{
 const root=await fixture();
 try{
  await mutate(root,"chrome-phone/inspection.json",d=>{d.rawReceiptSha256="0".repeat(64)});
  await assert.rejects(verifyIndexCandidateBundle(root,args),/Chrome receipt/);
  const newer=await fixture();
  try{
   const raw=await readFile(join(newer,"chrome-desktop/receipt.json"),"utf8");
   await writeFile(join(newer,"chrome-desktop/receipt.json"),raw.replace("127.0.0.1:3030/kingdom-index","127.0.0.1:3030/kingdom-tests"));
   await assert.rejects(verifyIndexCandidateBundle(newer,args));
  }finally{await rm(newer,{recursive:true,force:true})}
 }finally{await rm(root,{recursive:true,force:true})}
});
test("API contradictory percentile, false public certification, and missing evidence refuse",async()=>{
 const root=await fixture();
 try{
  await mutate(root,"api-loopback.json",d=>{d.latencyMs={p50:1,p75:1,p95:1};
    d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))))});
  await assert.rejects(verifyIndexCandidateBundle(root,args),/percentile/);
  const other=await fixture();
  try{
   await mutate(other,"api-loopback.json",d=>{d.certified=true;
     d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))))});
   await assert.rejects(verifyIndexCandidateBundle(other,args),/Invalid bounded Next API cohort/);
  }finally{await rm(other,{recursive:true,force:true})}
 }finally{await rm(root,{recursive:true,force:true})}
});
