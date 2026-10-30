import assert from "node:assert/strict";
import { test } from "node:test";
import {
  byteLabel, measuredProgress, projectTransferPublication,
  type TransferCohort, type TransferPublication,
} from "../lib/storageTransferPresentation.ts";
import { readFileSync } from "node:fs";

const time=new Date("2026-10-30T12:30:00Z");
function cohort():TransferCohort{
 return {
  id:"pilot_57802",label:"M1 encrypted pilot",campaignId:"oct30_archive",
  source:"mac",destination:"intel",protectedLevel:5,
  originalBytes:57802,compressedBytes:42000,codec:"zstd",
  ciphertextBytes:44000,ciphertextSha256:"a".repeat(64),
  ageRecipientFingerprint:"age1publicplaceholder",
  bytesSent:30000,bytesReadback:20000,
  stage:{"DISCOVER":"VERIFIED","SNAPSHOT":"VERIFIED","COMPRESS":"VERIFIED",
   "AGE ENCRYPT":"VERIFIED","TRANSFER":"ACTIVE","READBACK":"WAITING",
   "ISOLATED RESTORE":"UNKNOWN"},
  samples:[
   {at:"2026-10-30T12:28:30Z",bytesSent:10000},
   {at:"2026-10-30T12:29:00Z",bytesSent:20000},
   {at:"2026-10-30T12:29:30Z",bytesSent:30000}
  ],
  sourceObservedAt:"2026-10-30T12:29:45Z",
  receiverObservedAt:"2026-10-30T12:29:40Z",
  expiresAt:"2026-10-30T12:35:00Z",
  senderAuthenticated:true,receiverAuthenticated:true,
  sourceHashMatched:true,receiverReadbackMatched:false,
  independentRestore:null,sourceReclaim:null,receiptDigest:"b".repeat(64),
 };
}
function publication(c:TransferCohort=cohort()):TransferPublication{
 return {schema:"aoe2war.storage-transfer.admitted-publication.v1",
  issuer:"C_NATIVE_SENDER_RECEIVER_VERIFIER",campaignId:c.campaignId,
  observedAt:"2026-10-30T12:30:00Z",
  expiresAt:"2026-10-30T12:35:00Z",
  cohorts:[c],intelFreeBytes:null,intelReserveBytes:null};
}
test("uninstalled authenticated sender/receiver feed is UNKNOWN, not zero bytes",()=>{
 const x=projectTransferPublication(null,time);
 assert.equal(x.status,"UNKNOWN");
 for(const k of ["transferredBytes","readbackBytes","reclaimedBytes","verifiedArchives",
  "independentRestores","intelFreeBytes"] as const)assert.equal(x[k],null,k);
 assert.deepEqual(x.cohorts,[]);
});
test("fresh admitted sender/receiver produces only observed bytes and measured ETA",()=>{
 const x=projectTransferPublication(publication(),time);
 assert.equal(x.status,"VERIFIED");
 assert.equal(x.transferredBytes,30000);
 assert.equal(x.readbackBytes,20000);
 assert.equal(x.reclaimedBytes,null);
 assert.equal(x.independentRestores,0);
 const progress=measuredProgress(x.cohorts[0],time);
 assert.ok(progress.percent!==null&&Math.abs(progress.percent-(30000/44000*100))<1e-9);
 assert.equal(progress.label,"ESTIMATED");
 assert.ok(progress.bytesPerSecond!>0&&progress.etaSeconds!>0);
});
test("unknown original size or zero speed never creates ETA",()=>{
 const c=cohort();c.samples=c.samples.slice(0,2);
 assert.equal(measuredProgress(c,time).etaSeconds,null);
 c.samples=[{at:"2026-10-30T12:28:30Z",bytesSent:10000},
  {at:"2026-10-30T12:29:00Z",bytesSent:10000},
  {at:"2026-10-30T12:29:30Z",bytesSent:30000}];
 assert.equal(measuredProgress(c,time).etaSeconds,null);
 c.bytesSent=44000;
 c.ciphertextBytes=null;
 assert.equal(measuredProgress(c,time).percent,null);
});
test("stale, forged sender/receiver, wrong origin, replay and cohort duplicate HOLD",()=>{
 const c=cohort();const raw=publication(c);
 assert.equal(projectTransferPublication({...raw,issuer:"UNVERIFIED" as never},time).status,"UNKNOWN");
 assert.equal(projectTransferPublication({...raw,expiresAt:"2026-10-30T12:20:00Z"},time).status,"UNKNOWN");
 assert.equal(projectTransferPublication({...raw,cohorts:[c,{...c}]},time).status,"UNKNOWN");
 assert.equal(projectTransferPublication({...raw,cohorts:[{...c,senderAuthenticated:false}]},time).status,"UNKNOWN");
 assert.equal(projectTransferPublication({...raw,cohorts:[{...c,receiverAuthenticated:false}]},time).status,"UNKNOWN");
 assert.equal(projectTransferPublication({...raw,cohorts:[{...c,source:"unknown" as never}]},time).status,"UNKNOWN");
 assert.equal(projectTransferPublication({...raw,cohorts:[{...c,label:"/Users/secret/wallet"}]},time).status,"UNKNOWN");
});
test("readback/restore claims without matching native proof cannot be promoted",()=>{
 const c=cohort();
 c.stage.READBACK="VERIFIED";
 assert.equal(projectTransferPublication(publication(c),time).status,"UNKNOWN");
 c.stage.READBACK="WAITING";c.independentRestore={verified:true,failureDomainId:null,observedAt:null};
 assert.equal(projectTransferPublication(publication(c),time).status,"UNKNOWN");
 c.independentRestore=null;c.sourceReclaim={bytes:1000,filesystem:"APFS",
  observedAt:"2026-10-30T12:29:00Z",approvedOriginal:true};
 assert.equal(projectTransferPublication(publication(c),time).status,"UNKNOWN");
});
test("true source reclaim requires independent restore and exact original approval",()=>{
 const c=cohort();c.receiverReadbackMatched=true;
 c.stage.READBACK="VERIFIED";
 c.independentRestore={verified:true,failureDomainId:"intel-physical-failure-domain",
  observedAt:"2026-10-30T12:29:00Z"};
 c.sourceReclaim={bytes:2048,filesystem:"APFS",
  observedAt:"2026-10-30T12:29:45Z",approvedOriginal:true};
 const x=projectTransferPublication(publication(c),time);
 assert.equal(x.independentRestores,1);
 assert.equal(x.verifiedArchives,1);
 assert.equal(x.reclaimedBytes,2048);
});
test("huge byte values never overflow UI, false sum or leak paths",()=>{
 const c=cohort();c.bytesSent=Number.MAX_SAFE_INTEGER;
 c.ciphertextBytes=Number.MAX_SAFE_INTEGER;
 c.bytesReadback=0;
 c.samples=[];
 assert.equal(projectTransferPublication(publication(c),time).transferredBytes,
  Number.MAX_SAFE_INTEGER);
 assert.equal(byteLabel(Number.MAX_SAFE_INTEGER).includes("PiB"),true);
 assert.equal(byteLabel(null),"—");
});
test("production GET remains independently protected and transfer producer uninstalled",()=>{
 const api=readFileSync(new URL("../app/api/admin/storage-transfer/route.ts",import.meta.url),"utf8");
 assert.match(api,/requireAdmin\(request\)/);
 assert.match(api,/private, no-store/);
 assert.match(api,/transferReceipt:\s*null/);
 assert.doesNotMatch(api,/\b(execSync|spawnSync|child_process|fetch\s*\(|unlink|rmSync)\b/);
 assert.doesNotMatch(api,/\bexport\s+(?:async\s+)?function\s+(POST|DELETE|PUT|PATCH)\b/);
 const page=readFileSync(new URL("../app/admin/storage-transfer/page.tsx",import.meta.url),"utf8");
 assert.match(page,/TransferMissionPanels/);
 assert.match(page,/visibilityState/);
 assert.match(page,/AbortController/);
 assert.match(page,/30_000/);
});
