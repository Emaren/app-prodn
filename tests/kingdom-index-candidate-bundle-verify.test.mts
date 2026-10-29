import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,rm,readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {inspectIndexLoopbackChrome} from "../scripts/kingdom_index_loopback_browser_audit.mjs";
import {verifyIndexCandidateBundle} from "../scripts/kingdom_index_candidate_bundle_verify.mjs";
import {candidateEvidenceLedger} from "../scripts/kingdom_index_candidate_evidence_ledger.mjs";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};
import profiles from "../config/kingdom-index-assurance-profiles.json" with {type:"json"};

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
    kingdomIndexStatus:"unmeasured",indexScore:null,
    indexSourceVersion:"src-aaaaaaaaaaaaaaaa",indexMeasuredVersion:null,indexObservationKind:null})),
  consistent:true,certified:false,criterionPointsAwarded:null,note:"Uncertified synthetic fixture"},"sha256");
 await put("api-loopback.json",api);
 const burstTimes=Array.from({length:40},(_,i)=>22+i);
 const concurrent=digest({schema:1,kind:"aoe2war.kingdom-index.concurrent-loopback-smoke.v1",
  sourceSha:sha,buildId,origin:"LOOPBACK_ONLY",endpoint:"/api/kingdom-index",
  concurrency:4,requests:40,wallMs:333,
  latencyMs:{p50:percentile(burstTimes,.5),p75:percentile(burstTimes,.75),p95:percentile(burstTimes,.95)},
  consistent:true,observed:burstTimes.map((elapsedMs,i)=>({sequence:i+1,elapsedMs,
   responseBytes:1024,routeCount:88,certified:0,indexStatus:"unmeasured",indexScore:null,
   indexSourceVersion:"src-aaaaaaaaaaaaaaaa",indexMeasuredVersion:null,indexObservationKind:null})),
  errors:0,certified:false,criterionPointsAwarded:null,
  limitations:"Untrusted synthetic burst fixture"},"sha256");
 await put("concurrent-loopback.json",concurrent);
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
  assert.equal(r.concurrent.requests,40);
  assert.equal(r.concurrent.concurrency,4);
  assert.equal(r.certified,false);
  assert.equal(r.criterionPointsAwarded,null);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("truthful provisional Index remains a noncertifying candidate observation",async()=>{
  const root=await fixture();
  const relabel=async(filename:string,field:"kingdomIndexStatus"|"indexStatus",value:string)=>{
    await mutate(root,filename,d=>{
      for(const row of d.observed as Array<Record<string,unknown>>)row[field]=value;
      d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))));
    });
  };
  try{
    await relabel("api-loopback.json","kingdomIndexStatus","provisional");
    await relabel("concurrent-loopback.json","indexStatus","provisional");
    const accepted=await verifyIndexCandidateBundle(root,args);
    assert.equal(accepted.status,"SELF_CONSISTENT_CANDIDATE_EVIDENCE_ONLY");
    assert.equal(accepted.certified,false);
    assert.equal(accepted.criterionPointsAwarded,null);
    await relabel("concurrent-loopback.json","indexStatus","unmeasured");
    await assert.rejects(verifyIndexCandidateBundle(root,args),/Concurrent API status differs/);
    await relabel("concurrent-loopback.json","indexStatus","provisional");
    await relabel("api-loopback.json","kingdomIndexStatus","current");
    await assert.rejects(verifyIndexCandidateBundle(root,args),/API response inconsistency/);
    await relabel("api-loopback.json","kingdomIndexStatus","provisional");
    await mutate(root,"api-loopback.json",d=>{
      (d.observed as Array<Record<string,unknown>>)[0].indexScore=100;
      d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))));
    });
    await assert.rejects(verifyIndexCandidateBundle(root,args),/API response inconsistency or false score/);
  }finally{await rm(root,{recursive:true,force:true})}
});
test("mixed provisional and unmeasured samples are rejected even with valid checksums",async()=>{
  const root=await fixture();
  try{
    await mutate(root,"api-loopback.json",d=>{
      (d.observed as Array<Record<string,unknown>>)[1].kingdomIndexStatus="provisional";
      d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))));
    });
    await assert.rejects(verifyIndexCandidateBundle(root,args),/API response inconsistency/);
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

test("canonical 20-criterion candidate ledger never awards points or passes any gate",async()=>{
 const root=await fixture();
 try{
  const report=await candidateEvidenceLedger({root,...args,rubric,profile:profiles.profiles.index});
  assert.equal(report.criteria.length,20);
  assert.equal(report.criteria.reduce((n,r)=>n+r.maximum,0),100);
  assert.equal(report.grade,null);
  assert.equal(report.earned,null);
  assert.equal(report.publicationAuthorized,false);
  assert.equal(report.certified,false);
  assert.equal(report.gates.length,3);
  for(const row of report.criteria){
   assert.equal(row.earned,null,row.id);
   assert.equal(row.approvedArtifactSha256,null,row.id);
   assert.equal(row.independentIssuer,null,row.id);
   assert.equal(row.approvalExpiresAt,null,row.id);
   assert.equal(row.status,"UNKNOWN_INDEPENDENT_APPROVAL",row.id);
   assert.equal(row.candidateSourceSha,sha);
   assert.equal(row.candidateBuildId,buildId);
  }
  assert.deepEqual(report.gates.map(g=>g.status),["UNKNOWN","UNKNOWN","UNKNOWN"]);
  assert.equal(report.criteria.find(r=>r.id==="accessibility")?.candidateObservation,"NOT_COLLECTED");
  assert.equal(report.criteria.find(r=>r.id==="measured_latency")?.candidateObservation,"PARTIAL_CANDIDATE_ONLY");
 }finally{await rm(root,{recursive:true,force:true})}
});
test("ledger cannot launder incomplete bundle or modified canonical weights into a grade",async()=>{
 const root=await fixture();
 try{
  const wrong=structuredClone(rubric);
  wrong.dimensions.performance.weight=21;
  await assert.rejects(candidateEvidenceLedger({root,...args,rubric:wrong,profile:profiles.profiles.index}),/Canonical weight/);
  const missing=structuredClone(profiles.profiles.index);
  missing.gates.pop();
  await assert.rejects(candidateEvidenceLedger({root,...args,rubric,profile:missing}),/Changed rubric/);
  await mutate(root,"api-loopback.json",d=>{d.certified=true});
  await assert.rejects(candidateEvidenceLedger({root,...args,rubric,profile:profiles.profiles.index}));
 }finally{await rm(root,{recursive:true,force:true})}
});

test("forged concurrent burst build/response/P95 and false certificate are rejected",async()=>{
 const root=await fixture();
 try{
  await mutate(root,"concurrent-loopback.json",d=>{
   d.buildId="wrong-build";
   d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))));
  });
  await assert.rejects(verifyIndexCandidateBundle(root,args),/concurrent API smoke/);
  const other=await fixture();
  try{
   await mutate(other,"concurrent-loopback.json",d=>{
    d.latencyMs={p50:1,p75:1,p95:1};
    d.sha256=hash(JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k])=>k!=="sha256"))));
   });
   await assert.rejects(verifyIndexCandidateBundle(other,args),/Concurrent API percentile/);
  }finally{await rm(other,{recursive:true,force:true})}
 }finally{await rm(root,{recursive:true,force:true})}
});

test("actual CI catch-all Next chunk [...slug] is legal and does not waive path traversal",async()=>{
 const root=await fixture();
 try{
  // First real rejected entry (index 488) in run 39857248772.
  const route=".next/static/chunks/app/champions/[...slug]/page-8ca9a9142d8d1345.js";
  await mutate(root,"emitted-closure.json",d=>{
   const files=d.files as Array<{path:string;bytes:number;sha256:string}>;
   files.push({path:route,bytes:2550,
    sha256:"6857df9c9d15bd6dd4da694e90490188e9820398c9233ec9e94c1c357416f455"});
   const budget=d.budget as {remainingBytes:number};
   budget.remainingBytes-=2550;
   d.receiptSha256=hash(JSON.stringify(Object.fromEntries(
    Object.entries(d).filter(([k])=>k!=="receiptSha256"))));
  });
  const inspected=await verifyIndexCandidateBundle(root,args);
  assert.equal(inspected.emitted.files,10);
  assert.equal(inspected.certified,false);
 }finally{await rm(root,{recursive:true,force:true})}
});
test("literal dot or parent components, absolute, UNC, drive, backslash, control and duplicate emitted paths refuse",async()=>{
 const illegal=[
  "a/../b","a/./b","../a","./a","a//b","a/","/a",
  "C:/outside/build.js","a\\b","\\\\server\\share\\a",
  "a/\u0000b","a/\nb"
 ];
 for(const unsafe of illegal){
  const root=await fixture();
  try{
   await mutate(root,"emitted-closure.json",d=>{
    const files=d.files as Array<{path:string}>;
    files[1].path=unsafe;
    d.receiptSha256=hash(JSON.stringify(Object.fromEntries(
     Object.entries(d).filter(([k])=>k!=="receiptSha256"))));
   });
   await assert.rejects(verifyIndexCandidateBundle(root,args),
    /Duplicated, unsafe or invalid emitted file/,JSON.stringify(unsafe));
  }finally{await rm(root,{recursive:true,force:true})}
 }
 const root=await fixture();
 try{
  await mutate(root,"emitted-closure.json",d=>{
   const files=d.files as Array<{path:string}>;
   files[1].path=files[0].path;
   d.receiptSha256=hash(JSON.stringify(Object.fromEntries(
    Object.entries(d).filter(([k])=>k!=="receiptSha256"))));
  });
  await assert.rejects(verifyIndexCandidateBundle(root,args),
   /Duplicated, unsafe or invalid emitted file/);
 }finally{await rm(root,{recursive:true,force:true})}
});

test("real-world drifted historical Index review is eligible only when source mismatch is evidenced",async()=>{
 const root=await fixture();
 const update=async(name:string,kind:"api"|"burst",source="src-aaaaaaaaaaaaaaaa",measured="src-bbbbbbbbbbbbbbbb")=>{
  await mutate(root,name,doc=>{
   const rows=doc.observed as Array<Record<string,unknown>>;
   for(const row of rows){
    if(kind==="api")row.kingdomIndexStatus="drifted";
    else row.indexStatus="drifted";
    row.indexSourceVersion=source;
    row.indexMeasuredVersion=measured;
    row.indexObservationKind="source-review";
   }
   const unsigned=Object.fromEntries(Object.entries(doc).filter(([k])=>k!=="sha256"));
   doc.sha256=hash(JSON.stringify(unsigned));
  });
 };
 try{
  await update("api-loopback.json","api");
  await update("concurrent-loopback.json","burst");
  const result=await verifyIndexCandidateBundle(root,args);
  assert.equal(result.certified,false);
  assert.equal(result.criterionPointsAwarded,null);
  assert.equal(result.api.indexStatus,"drifted");
  // An attacker can recompute unsigned cohort hashes. Matching source values
  // or contradictory two-cohort lineage must STILL be rejected.
  await update("concurrent-loopback.json","burst","src-aaaaaaaaaaaaaaaa","src-aaaaaaaaaaaaaaaa");
  await assert.rejects(verifyIndexCandidateBundle(root,args),/drift|historical|cohort|status|version/i);
 }finally{await rm(root,{recursive:true,force:true})}
});
