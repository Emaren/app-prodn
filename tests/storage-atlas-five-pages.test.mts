import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {Script} from "node:vm";
import {
  ATLAS_IDS,ATLAS_SCALES,KIND_STYLES,
  projectStorageAtlas,tileGroups,type AtlasSurface
} from "../lib/storageAtlasMosaic.ts";
const req=createRequire(import.meta.url);
const ts=req("typescript");
const routes=[
 ["all","app/admin/storage-os/atlas/page.tsx","null"],
 ["hel1-root","app/admin/storage-os/atlas/hel1-root/page.tsx","hel1-root"],
 ["hel1-data","app/admin/storage-os/atlas/hel1-data/page.tsx","hel1-data"],
 ["m1","app/admin/storage-os/atlas/m1/page.tsx","m1"],
 ["intel","app/admin/storage-os/atlas/intel/page.tsx","intel"]
] as const;
const ui=readFileSync("components/storage-os/StorageSpatialAtlas.tsx","utf8");
const endpoint=readFileSync("app/api/admin/storage-os/atlas/route.ts","utf8");
const visual=readFileSync("lib/storageAtlasMosaic.ts","utf8");
const now=new Date("2026-11-22T04:10:00Z");
import type {StorageCommandCenter} from "../lib/storageCommandCenterProjection.ts";
import type {VisualHog} from "../lib/storageVisualPrivate.ts";
import type {IntelColdView} from "../lib/intelColdStorageEvidence.ts";
type TestResponse={status:number;headers:Record<string,string>;
  body:{surfaces:AtlasSurface[];detail?:string}};

function signedModel(hogs:VisualHog[]=[],source:"SIGNED_PRIVATE_RECEIPT"|"NONE"="SIGNED_PRIVATE_RECEIPT",
  extras:Record<string,unknown>={}){
 return {
  schema:"aoe2war.private-storage-command-center.v1",
  visual:{source,authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[{
    id:"hel1-root",observedAt:"2026-11-22T04:09:00Z",status:"RECEIPT",
    coverage:"PARTIAL",hogs,events:[],...extras
  }]},
  planes:[
    {id:"hel1-root",status:"RECEIPT",source:"OPERATOR_ESTATE_SNAPSHOT",
      asOf:"2026-11-22T04:09:00Z",freeBytes:9000000000,usedPercent:null},
    {id:"hel1-volume-105319120",status:"UNKNOWN",source:"NONE",freeBytes:null,usedPercent:null},
    {id:"mac",status:"UNKNOWN",source:"NONE",freeBytes:null,usedPercent:null}
  ]
 } as unknown as StorageCommandCenter;
}
const hog=(key:string,bytes:number,overlaps=false,level=3)=>({
 key,label:key,grossBytes:bytes,overlaps,level
});
function routeModule(auth:"missing"|"ordinary"|"admin",badSource=false){
 const compiler=ts.transpileModule(endpoint,{fileName:"route.ts",
   compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
     esModuleInterop:true}});
 let observedReads=0;
 const json=(body:unknown,opts?:{status?:number;headers?:Record<string,string>})=>
   ({status:opts?.status??200,body,headers:opts?.headers??{}});
 const admin=auth==="admin"?{user:{id:1}}:{error:json({detail:auth==="missing"?"Unauthorized":"Forbidden"},
   {status:auth==="missing"?401:403})};
 const stub=(id:string):unknown=>{
   if(id==="next/server")return {NextResponse:{json},NextRequest:class{}};
   if(id==="@/lib/adminSession")return {requireAdmin:async()=>admin};
   if(id==="@/lib/aoe2Os")return {readAoe2OsStorageEvidence:async()=>{observedReads++;return {};}};
   if(id==="@/lib/aoe2StorageAtlasServer")return {readAuthenticatedStorageAtlas:async()=>{
     observedReads++;return null;}};
   if(id==="@/lib/storageVisualPrivate")return {readPrivateStorageVisual:async()=>{
     observedReads++;if(badSource)throw Error("BAD_HMAC");return {
       source:"NONE",authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",planes:[]
     };}};
   if(id==="@/lib/intelColdStorageEvidence")return {readIntelColdEvidence:async()=>{
     observedReads++;throw Error("INTEL_NOT_EXPECTED");}};
   if(id==="@/lib/storageCommandCenterProjection")return {projectPrivateStorage:()=>signedModel([],"NONE")};
   if(id==="@/lib/storageAtlasGenerationCohortServer")return {
     readRuntimeCohort:async()=>{observedReads++;return {
       schema:"aoe2war.storage-atlas.runtime-cohort.v1",status:"NOT_ADMITTED",
       sourceHash:null,rows:[],signedSourceAtRead:false
     };}};
   if(id==="@/lib/storageAtlasNativeCapacityServer")return {
     readAtlasNativeCapacityObservations:async()=>{observedReads++;return [];}};
   if(id==="@/lib/storageAtlasMosaic")return {projectStorageAtlas};
   throw Error("UNEXPECTED_API_MODULE:"+id);
 };
 const mod={exports:{} as Record<string,unknown>};
 new Script("(function(require,module,exports){"+compiler.outputText+"\n})",{
   filename:"atlas-private-route.mjs"}).runInThisContext()(stub,mod,mod.exports);
 return {get:mod.exports.GET as (x:unknown)=>Promise<TestResponse>,
   reads:()=>observedReads,originalEnv:process.env.AOE2WAR_INTEL_STATUS_CONTRACT_ADMITTED};
}
test("five real admin pages share one engine and protect server render",()=>{
 assert.equal(routes.length,5);
 for(const [name,path,prop] of routes){
  const body=readFileSync(path,"utf8");
  assert.match(body,/await requireServerAdmin\(\)/,name);
  assert.match(body,/StorageSpatialAtlas/);
  assert.match(body,/dynamic="force-dynamic"/);
  assert.match(body,new RegExp(prop==="null"?"initialPlane=\\{null\\}":"initialPlane=\\\""+prop+"\\\""));
  assert.doesNotMatch(body,/scan\(|spawn\(|fetch\(|delete\(|unlink\(/);
 }
 assert.match(ui,/Five private Storage Atlas pages/);
 assert.match(ui,/ROUTES\[surface\.id\]/);
 assert.match(ui,/\/admin\/storage-os\/explorer/);
 assert.equal(new Set(ATLAS_IDS).size,4);
});
test("private GET enforces real admin gate before source reads; 401,403,200; no POST",async()=>{
 for(const [role,expected] of [["missing",401],["ordinary",403],["admin",200]] as const){
   const m=routeModule(role);
   const res=await m.get({});
   assert.equal(res.status,expected,role);
   assert.equal(m.reads(),role==="admin"?5:0,"no evidence reads before admin");
   if(role==="admin"){
     assert.equal(res.headers["Cache-Control"],"private, no-store, max-age=0");
     assert.equal(res.headers["X-Content-Type-Options"],"nosniff");
     assert.equal(res.body.surfaces.length,4);
     assert.equal((res.body as {rootRuntimeCohort?:{status:string}}).rootRuntimeCohort?.status,
       "NOT_ADMITTED");
   }
 }
 assert.doesNotMatch(endpoint,/export async function (POST|PUT|DELETE|PATCH)/);
 assert.doesNotMatch(endpoint,/child_process|spawn\(|exec\(|ssh|rm -rf|unlink\(|writeFile/);
 assert.match(endpoint,/if\("error" in admin\)return admin\.error/);
});
test("malformed source fails closed 503, not a believable empty filesystem",async()=>{
 const m=routeModule("admin",true);
 const r=await m.get({});
 assert.equal(r.status,503);
 assert.equal(r.body.detail,"ATLAS_SOURCE_NOT_ADMITTED");
 assert.equal(r.headers["Cache-Control"],"private, no-store, max-age=0");
});
test("three computers across four independently identified storage surfaces",()=>{
 const p=projectStorageAtlas(null,null,now);
 assert.deepEqual(p.surfaces.map(s=>s.id),ATLAS_IDS);
 assert.deepEqual(p.surfaces.map(s=>s.host),["HEL1","HEL1","M1","INTEL"]);
 assert.equal(new Set(p.surfaces.map(s=>s.host)).size,3);
 for(const s of p.surfaces){
  assert.equal(s.totalBytes,null);
  assert.equal(s.usedBytes,null);
  assert.equal(s.reservedBytes,null);
  assert.equal(s.unattributedBytes,null);
  assert.equal(s.uniqueReclaimBytes,null);
  assert.equal(s.partitionCertified,false);
  assert.equal(s.source,"NOT_ADMITTED");
 }
 assert.equal(p.authority,"ADMIN_READ_ONLY_NO_SCAN_COPY_OR_RETIRE");
});
test("three native capacity observations keep exact numeric truth but never certify hogs",()=>{
 const obs=[
  {id:"hel1-root",observedAt:"2026-11-22T04:09:00Z",
   source:"NATIVE_HEL1_STATFS_UNCERTIFIED",deviceIdentity:"HEL1 root mount",
   totalBytes:1000,usedBytes:700,availableBytes:200,reservedBytes:100},
  {id:"hel1-data",observedAt:"2026-11-22T04:09:00Z",
   source:"NATIVE_HEL1_STATFS_UNCERTIFIED",deviceIdentity:"HEL1 mounted data volume",
   totalBytes:5000,usedBytes:4000,availableBytes:1000,reservedBytes:0},
  {id:"m1",observedAt:"2026-11-22T04:09:00Z",
   source:"OWNER_M1_APFS_DATED_UNCERTIFIED",deviceIdentity:"disk3 / owner APFS container",
   totalBytes:10000,usedBytes:9000,availableBytes:1000,reservedBytes:0}
 ] as const;
 const p=projectStorageAtlas(signedModel([]),null,now,obs);
 for(let i=0;i<3;i++){
  const s=p.surfaces[i];
  assert.equal(s.totalBytes,obs[i].totalBytes);
  assert.equal(s.usedBytes,obs[i].usedBytes);
  assert.equal(s.availableBytes,obs[i].availableBytes);
  assert.equal(s.capacityObservedAt,obs[i].observedAt);
  assert.equal(s.capacityAgeSeconds,60);
  assert.equal(s.capacityAuthority,obs[i].source);
  assert.equal(s.usedPercent,Math.round(obs[i].usedBytes/
    (obs[i].usedBytes+obs[i].availableBytes)*1000)/10,
    "native df ordinary denominator excludes reserved blocks");
  assert.equal(s.partitionCertified,false);
  assert.equal(s.unattributedBytes,null);
  assert.equal(s.uniqueReclaimBytes,null);
  assert.equal(s.categories.length,0);
  assert.ok(s.blockers.some(x=>x.includes("NOT signed")));
 }
 assert.equal(p.surfaces[3].totalBytes,null,"Intel needs independent current source");
 assert.equal(p.surfaces[0].coverage,"NOT_SCANNED");
 const fake=projectStorageAtlas(null,null,now,[{...obs[0],usedBytes:899}]);
 assert.equal(fake.surfaces[0].totalBytes,null,"reject invalid byte arithmetic");
 const spoof=projectStorageAtlas(null,null,now,[{...obs[0],id:"intel" as never}]);
 assert.equal(spoof.surfaces[3].totalBytes,null,"never accept Intel as HEL1");
 const aged=projectStorageAtlas(null,null,new Date("2026-11-23T04:10:00Z"),obs);
 assert.ok(aged.surfaces[0].blockers.some(x=>x.includes("older than 15")));
});
test("signed v1 zero hog entries are NOT SCANNED, not zero used or free",()=>{
 const s=projectStorageAtlas(signedModel([]),null,now).surfaces[0];
 assert.equal(s.id,"hel1-root");
 assert.equal(s.coverage,"NOT_SCANNED");
 assert.equal(s.categories.length,0);
 assert.equal(s.availableBytes,9000000000);
 assert.equal(s.capacityAuthority,"OBSERVED_OPERATOR_UNCERTIFIED");
 assert.equal(s.totalBytes,null);
 assert.equal(s.usedBytes,null);
 assert.equal(s.unattributedBytes,null);
 assert.ok(s.blockers.some(x=>x.includes("NOT SCANNED")));
 assert.equal(tileGroups(s,"gib").renderedTiles,0);
});
test("positive real-source-style gross sample is never certified occupied bytes",()=>{
 const s=projectStorageAtlas(signedModel([hog("HEL1_HISTORICAL_RUNTIME_4C14",1610612736)]),null,now).surfaces[0];
 assert.equal(s.categories.length,1);
 assert.equal(s.categories[0].grossBytes,1610612736);
 assert.equal(s.categories[0].kind,"REVIEW_HOLD");
 assert.equal(s.categories[0].level,3); // fixture metadata, not a human permit
 assert.equal(s.categories[0].allowedToDelete,false);
 assert.equal(s.categories[0].uniqueReclaimBytes,null);
 assert.equal(s.source,"SERVER_HMAC_ONLY");
 assert.equal(s.usedBytes,null);
 assert.equal(tileGroups(s,"gib").renderedTiles,2);
 assert.equal(tileGroups(s,"mib100").renderedTiles,16);
});
test("generic deployment builds are not automatically described as live services",()=>{
 const s=projectStorageAtlas(signedModel(
  [hog("HEL1_DEPLOY_BUILDS",3*1024**3,false,3)]),null,now).surfaces[0];
 assert.equal(s.categories[0].kind,"MEASURED_OTHER");
 assert.equal(s.categories[0].allowedToDelete,false);
 assert.equal(s.categories[0].allowedToTransfer,false);
});
test("overlapping/nested gross categories are not added to used or reclaimed",()=>{
 const raw=signedModel([
  hog("HEL1_ROOT_SYSTEM",15*1024**3,true,5),
  hog("HEL1_STAGING",4*1024**3,false,3)
 ]);
 const s=projectStorageAtlas(raw,null,now).surfaces[0];
 assert.equal(s.coverage,"OVERLAP_UNCERTAIN");
 assert.equal(s.categories[0].overlaps,true);
 assert.equal(s.uniqueMappedBytes,null);
 assert.equal(s.unattributedBytes,null);
 assert.equal(s.partitionCertified,false);
 assert.equal(tileGroups(s,"mib100",72).physicalPartitionValid,false);
});
test("stale signed source remains stale; negative or invalid observations are not displayed",()=>{
 const raw=signedModel([hog("HEL1_ROOT_SYSTEM",3*1024**3)]);
 raw.visual.planes[0].observedAt="2026-11-19T00:00:00Z";
 const stale=projectStorageAtlas(raw,null,now).surfaces[0];
 assert.equal(stale.coverage,"STALE");
 assert.equal(stale.categories[0].coverage,"STALE");
 const bad=signedModel([hog("HEL1_ROOT_SYSTEM",-200)]);
 const negative=projectStorageAtlas(bad,null,now).surfaces[0];
 assert.equal(negative.categories.length,0);
});
test("different capacity evidence does not infer total from percentage or free",()=>{
 const raw=signedModel([hog("HEL1_ROOT_SYSTEM",4*1024**3)]);
 raw.planes[0]={...raw.planes[0],source:"SIGNED_THREE_PLANE_RECEIPT",
  freeBytes:4*1024**3,usedPercent:95,status:"RECEIPT"};
 const p=projectStorageAtlas(raw,null,now).surfaces[0];
 assert.equal(p.capacityAuthority,"INDEPENDENT_SIGNED_POLICY_HOLD");
 assert.equal(p.availableBytes,4*1024**3);
 assert.equal(p.usedPercent,95);
 assert.equal(p.totalBytes,null);
 assert.equal(p.usedBytes,null);
 assert.equal(p.unattributedBytes,null);
 assert.equal(p.categories[0].uniqueReclaimBytes,null);
});
test("Intel absent/stale source never invents objects or a certified restored archive",()=>{
 const missing=projectStorageAtlas(null,null,now).surfaces[3];
 assert.equal(missing.categories.length,0);
 const intel={
   schema:"aoe2war.intel-cold.status.v1",
   source:"SIGNED_PRIVATE_RECEIPT",health:"STALE",
   authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL",observedAt:"2026-11-22T03:00:00Z",
   capacity:{availableBytes:200*1024**3},
   objects:[{alias:"INTEL_ABC",allocatedBytes:2*1024**3,
     protectionLevel:null,restore:"HISTORICAL_RESTORE_PROOF_PRESENT"}]
 } as unknown as IntelColdView;
 const stale=projectStorageAtlas(null,intel,now).surfaces[3];
 assert.equal(stale.coverage,"STALE");
 assert.equal(stale.categories.length,0);
 assert.equal(stale.availableBytes,null);
 const signed={...intel,health:"ONLINE",observedAt:"2026-11-22T04:09:00Z"};
 const current=projectStorageAtlas(null,signed,now).surfaces[3];
 assert.equal(current.categories.length,1);
 assert.equal(current.categories[0].kind,"RECOVERY_PROTECTED");
 assert.equal(current.categories[0].restore,"HISTORICAL_RESTORE_PROOF_PRESENT");
 assert.equal(current.categories[0].allowedToDelete,false);
 assert.equal(current.categories[0].uniqueReclaimBytes,null);
 assert.equal(current.totalBytes,null);
});
test("unqualified V1 cannot inject V2-only directory aliases or cross-device categories",()=>{
 const raw=signedModel([hog("HEL1_PRODUCT_ARTIFACT_RETENTION",5*1024**3)],"SIGNED_PRIVATE_RECEIPT",{
   nativeV2Source:true,reviewItems:[{alias:"FAKE_NONSOURCE",category:"HEL1_PRODUCT_ARTIFACT_RETENTION",
    grossBytes:5*1024**3,level:4,overlaps:false}]
 });
 // Legacy V1 lacks independently admitted WE2 Native V2 contract.
 const p=projectStorageAtlas(raw,null,now);
 assert.equal(p.surfaces[0].source,"SERVER_HMAC_ONLY");
 assert.equal(p.surfaces[0].categories[0].directories.length,0);
 assert.equal(p.surfaces[1].categories.length,0);
 assert.equal(p.surfaces[2].categories.length,0);
 assert.equal(p.surfaces[3].categories.length,0);
});
test("fresh source observation timestamps remain distinguished from browser polling",()=>{
 const raw=signedModel([hog("HEL1_ROOT_SYSTEM",5*1024**3)]);
 const p=projectStorageAtlas(raw,null,now);
 assert.equal(p.polledAt,"2026-11-22T04:10:00.000Z");
 assert.equal(p.surfaces[0].sourceObservedAt,"2026-11-22T04:09:00Z");
 assert.equal(p.surfaces[0].sourceAgeSeconds,60);
 assert.equal(p.surfaces[0].uniqueReclaimBytes,null);
});
test("Intel historical archive restoration does not assert current content verified",()=>{
 const source={
   schema:"aoe2war.intel-cold.status.v1",source:"SIGNED_PRIVATE_RECEIPT",
   health:"ONLINE",authority:"READ_ONLY_NO_CLEANUP_OR_REINSTALL",
   observedAt:"2026-11-22T04:09:00Z",
   capacity:{availableBytes:70*1024**3},
   objects:[{alias:"INTEL_0123456789ABCDEF01234567",allocatedBytes:2*1024**3,
     protectionLevel:null,restore:"HISTORICAL_RESTORE_PROOF_PRESENT",
     restoreReceiptSha256:"a".repeat(64),contentSha256VerifiedNow:false}]
 } as unknown as IntelColdView;
 const c=projectStorageAtlas(null,source,now).surfaces[3].categories[0];
 assert.equal(c.currentContentHashVerifiedNow,false);
 assert.equal(c.historicalRestoreReceiptSha256,"a".repeat(64));
 assert.equal(c.restore,"HISTORICAL_RESTORE_PROOF_PRESENT");
 assert.equal(c.uniqueReclaimBytes,null);
 assert.equal(c.allowedToTransfer,false);
});
test("1GiB / 100MiB and massive datasets render bounded groups, no 1 tile per inode",()=>{
 assert.equal(ATLAS_SCALES.gib,1024**3);
 assert.equal(ATLAS_SCALES.mib100,100*1024**2);
 const current=projectStorageAtlas(signedModel(
   [hog("HEL1_ROOT_SYSTEM",30000*1024**3)]),null,now).surfaces[0];
 const t=tileGroups(current,"mib100",80);
 assert.ok(t.renderedTiles<=80);
 assert.ok(t.unitBytes>=100*1024**2);
 assert.equal(t.physicalPartitionValid,false);
 assert.equal(KIND_STYLES.UNKNOWN.pattern,"crosshatch");
 assert.equal(KIND_STYLES.REVIEW_HOLD.pattern,"diagonal");
});
test("keyboard, accessible text, zoom and bounded view contain no dynamic scan/retire control",()=>{
 assert.match(ui,/aria-label="Storage evidence legend"/);
 assert.match(ui,/role="group" aria-label="Choose measured block scale"/);
 assert.match(ui,/role="group" aria-label="Choose mosaic geometry"/);
 assert.match(ui,/aria-pressed=\{scale===x\.id\}/);
 assert.match(ui,/aria-label=\{"Inspect "\+category\.label/);
 assert.match(ui,/focus-visible:outline-2/);
 assert.match(ui,/motion-reduce:transition-none/);
 assert.match(ui,/grid-cols-8/);
 assert.match(ui,/grid-cols-9/);
 assert.match(ui,/sm:grid-cols-12/);
 assert.match(ui,/max-w-\[1960px\]/);
 assert.match(ui,/No separately admitted child alias list/);
 assert.match(ui,/UNSCALED UNKNOWN REGION/);
 assert.match(ui,/1 GiB/);
 assert.match(ui,/100 MiB/);
 assert.doesNotMatch(ui,/<form\b|method="POST"|deleteFile|shellCommand/);
 assert.doesNotMatch(visual,/rm -rf|require\("node:child_process"\)/);
});
