import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, readdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { HOG_CATALOG, INDIVIDUAL_TRANSPORT_ADOPTED, readPrivateStorageVisual, signVisualPayloadForTests, verifyVisualReceipt } from "../lib/storageVisualPrivate.ts";
import { appendOwnerReview, readOwnerReviews, effectiveOwnerDecision, latestEvent, type OwnerReviewEvent } from "../lib/storageOwnerReviews.ts";

const key="cd".repeat(32),clock=new Date("2026-10-28T21:40:00Z");
const fingerprint="a".repeat(64),digest="b".repeat(64),revision="c".repeat(40);
const item={alias:"BUILD_0001",category:"GUARDED_GENERATED",gross_allocated_bytes:536870912,
  fingerprint,source_digest:digest,source_revision:revision,
  source_status:"GUARDED",proof_state:"COMPLETE",overlaps:false};
const payload={schema:"aoe2war.storage-visual.private.v1",generated_at:"2026-10-28T21:39:00Z",
  planes:[{id:"mac",observed_at:"2026-10-28T21:38:00Z",coverage:"PARTIAL",
    hogs:[{key:"GUARDED_GENERATED",gross_allocated_bytes:536870912,overlaps:false}],
    events:[],review_items:[item],
    capacity_samples:[{at:"2026-10-28T21:30:00Z",ordinary_free_bytes:10000000000},
      {at:"2026-10-28T21:38:00Z",ordinary_free_bytes:10001000000}]}]};
function verify(v:unknown){return verifyVisualReceipt({schema:"aoe2war.storage-visual.signed.v1",payload:v,
  signature_hmac_sha256:signVisualPayloadForTests(v,key)},key,clock);}
type Mutable={planes:[{review_items:Record<string,unknown>[];capacity_samples:Record<string,unknown>[]}]};
function modified(fn:(x:Mutable)=>void){const next=JSON.parse(JSON.stringify(payload));fn(next);return next;}

test("five source-controlled levels preserve immutable legacy L4 protected as L5",()=>{
 assert.equal(HOG_CATALOG.GUARDED_GENERATED.level,1);
 assert.equal(HOG_CATALOG.CROSSOVER_STEAM_REPLAY.level,5);
 assert.equal(HOG_CATALOG.HEL1_ACTIVE_SWAP.level,5);
 assert.equal(HOG_CATALOG.WATCHER_SIGNED_DIST.level,5);
 assert.equal(HOG_CATALOG.OWNER_CHATGPT_CONVERSATION_ZIP.level,5);
 assert.equal(HOG_CATALOG.OWNER_ORIGINAL_PHOTOS.level,5);
 assert.equal(HOG_CATALOG.OWNER_INDEPENDENT_RECOVERY_COPY.level,5);
 assert.equal(HOG_CATALOG.FINANCIAL_ORIGINALS.level,5);
 assert.equal(HOG_CATALOG.EVIDENCE_ORIGINALS.level,5);
 assert.equal(HOG_CATALOG.HEL1_DEPLOY_BUILDS.level,3);
});
test("signed individual aliases and capacity samples are bounded and gross-only",()=>{
 const view=verify(payload),p=view.planes[0];
 assert.equal(p.reviewItems?.[0].alias,"BUILD_0001");
 assert.equal(p.reviewItems?.[0].level,1);
 assert.equal(p.capacitySamples?.length,2);
 assert.equal(p.capacitySamples![1].ordinaryFreeBytes-p.capacitySamples![0].ordinaryFreeBytes,1000000);
 assert.equal(view.authority,"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY");
});
test("no raw paths, fake receipts, missing proofs, duplicate aliases or unbounded samples",()=>{
 assert.throws(()=>verify(modified(x=>x.planes[0].review_items[0].alias="/Users/secret")) ,/REVIEW_ITEM_INVALID/);
 assert.throws(()=>verify(modified(x=>x.planes[0].review_items[0].fingerprint="broken")) ,/REVIEW_ITEM_INVALID/);
 assert.throws(()=>verify(modified(x=>x.planes[0].review_items[0].source_revision="0")) ,/REVIEW_ITEM_INVALID/);
 assert.throws(()=>verify(modified(x=>x.planes[0].review_items.push(x.planes[0].review_items[0]))) ,/REVIEW_ITEM_INVALID/);
 assert.throws(()=>verify(modified(x=>x.planes[0].review_items[0].proof_state="INCOMPLETE")) ,/REVIEW_POLICY_HOLD/);
 assert.throws(()=>verify(modified(x=>x.planes[0].capacity_samples.push({at:"2030-01-01T00:00:00Z",ordinary_free_bytes:1}))) ,/CAPACITY_SAMPLE_INVALID/);
 assert.throws(()=>verify(modified(x=>x.planes[0].capacity_samples.push(x.planes[0].capacity_samples[0]))) ,/CAPACITY_DUPLICATE/);
 assert.throws(()=>verify(modified(x=>x.planes[0].capacity_samples=Array(25).fill(x.planes[0].capacity_samples[0]))) ,/CAPACITY_ROWS_INVALID/);
});
const baseEvent={schema:"aoe2war.storage-owner-review.v1" as const,id:"00000000-0000-4000-8000-000000000000",
 at:"2026-10-28T21:35:00Z",plane:"mac" as const,alias:"BUILD_0001",fingerprint,
 sourceDigest:digest,sourceRevision:revision,category:"GUARDED_GENERATED",
 decision:"SINGLE_CANDIDATE_APPROVAL" as const,expiresAt:"2026-10-28T21:45:00Z",
 previousId:null,effect:"INTENT_ONLY_NO_DELETE" as const};
test("fingerprint/source drift, expiry and revocation invalidate review intent",()=>{
 const current=verify(payload).planes[0].reviewItems![0];
 assert.equal(effectiveOwnerDecision(baseEvent,current,clock),"SINGLE_CANDIDATE_APPROVAL");
 assert.equal(effectiveOwnerDecision(baseEvent,{...current,fingerprint:"f".repeat(64)},clock),null);
 assert.equal(effectiveOwnerDecision(baseEvent,{...current,sourceRevision:"f".repeat(40)},clock),null);
 assert.equal(effectiveOwnerDecision(baseEvent,current,new Date("2026-10-28T21:46:00Z")),null);
 assert.equal(effectiveOwnerDecision({...baseEvent,decision:"REVOKE"},current,clock),null);
 assert.equal(latestEvent([baseEvent as OwnerReviewEvent],"mac","BUILD_0001")?.id,baseEvent.id);
});
test("read-only telemetry GET remains untouched; owner POST requires admin, same origin and exact fingerprint",()=>{
 const visual=readFileSync("app/api/admin/storage-os/route.ts","utf8");
 const route=readFileSync("app/api/admin/storage-os/reviews/route.ts","utf8");
 const ledger=readFileSync("lib/storageOwnerReviews.ts","utf8");
 const ui=readFileSync("components/storage-os/StorageLevelPanels.tsx","utf8");
 assert.doesNotMatch(visual,/export async function POST/);
 assert.match(route,/requireAdmin\(request\)/);
 assert.match(route,/REVIEW_CROSS_ORIGIN_HOLD/);
 assert.match(route,/REVIEW_FINGERPRINT_DRIFT/);
 assert.match(route,/REVIEW_SINGLE_APPROVAL_NOT_QUALIFIED/);
 assert.match(route,/REVIEW_MIGRATION_LEVEL_HOLD/);
 assert.match(route,/admin.error.headers.set\("Cache-Control"/);
 assert.match(ui,/Largest measured consumers/);
 assert.match(ui,/L1 policy coverage UNKNOWN/);
 assert.match(ui,/REBUILD \/ ROLLBACK/);
 assert.match(ui,/UNIQUE APFS GAIN/);
 assert.match(ui,/policy exhaustion UNKNOWN/);
 assert.match(ledger,/O_NOFOLLOW/);
 assert.match(ledger,/O_EXCL/);
 assert.match(ledger,/handle\.sync\(\)/);
 assert.doesNotMatch(route+ledger+ui,/rmSync|unlinkSync|execFile|spawn\(|--apply|killall Finder/);
 assert.match(ui,/Five levels/);
 assert.match(ui,/OWNER-EXPRESS NEVER DELETE/);
 assert.match(route,/REVIEW_L5_OWNER_IMMUTABLE/);
 assert.match(route,/REVIEW_SOURCE_TRANSPORT_UNAVAILABLE/);
 assert.match(ui,/INDIVIDUAL OWNER REVIEW UNAVAILABLE/);
 assert.match(ui,/storageReviewTransportPolicy/);
 assert.doesNotMatch(ui,/import \{ INDIVIDUAL_TRANSPORT_ADOPTED \} from "@\\/lib\\/storageVisualPrivate"/);
 assert.equal(readFileSync("lib/storageReviewTransportPolicy.ts","utf8").includes("export const INDIVIDUAL_TRANSPORT_ADOPTED: boolean = false"),true);
 assert.match(ui,/UNKNOWN/);
 assert.match(ui,/INTENT|deletion permit/i);
});

test("native isolated fixture: append-only private review, CAS replay HOLD and revocation",async()=>{
 const root=mkdtempSync(path.join(tmpdir(),"storage-owner-review-"));
 mkdirSync(path.join(root,"state"),{mode:0o700});
 const original=process.env.AOE2WAR_OS_STORE_DIR;
 process.env.AOE2WAR_OS_STORE_DIR=root;
 try{
   assert.deepEqual(await readOwnerReviews(),[]);
   const candidate=verify(payload).planes[0].reviewItems![0];
   const first=await appendOwnerReview({plane:"mac",item:candidate,decision:"PROTECT",previousId:null,now:clock});
   assert.equal(first.effect,"INTENT_ONLY_NO_DELETE");
   assert.equal((await readOwnerReviews()).length,1);
   await assert.rejects(()=>appendOwnerReview({plane:"mac",item:candidate,decision:"REVIEW_LATER",previousId:null,now:clock}),/STALE_EXPECTATION/);
   const second=await appendOwnerReview({plane:"mac",item:candidate,decision:"REVOKE",previousId:first.id,now:clock});
   assert.equal(second.previousId,first.id);
   assert.equal(effectiveOwnerDecision(second,candidate,clock),null);
   const folder=path.join(root,"state","storage-owner-reviews.v1");
   const names=readdirSync(folder);
   assert.equal(names.length,2);
   for(const name of names)assert.equal(statSync(path.join(folder,name)).mode&0o077,0);
 }finally{
   if(original===undefined)delete process.env.AOE2WAR_OS_STORE_DIR;
   else process.env.AOE2WAR_OS_STORE_DIR=original;
   rmSync(root,{recursive:true,force:true});
 }
});


test("signed legacy mixed L4 protected maps to immutable L5 without automatic downgrade",async()=>{
 const old=modified(x=>{
  const item=x.planes[0].review_items[0];
  item.category="CROSSOVER_STEAM_REPLAY";
  item.level=4;
  item.source_status="PROTECTED";
  item.proof_state="INCOMPLETE";
 });
 const inherited=verify(old).planes[0].reviewItems![0];
 assert.equal(inherited.level,5);
 assert.equal(inherited.sourceStatus,"PROTECTED");
 const current=verify(payload).planes[0].reviewItems![0];
 assert.equal(current.level,1);
 const attempted=modified(x=>{
  const item=x.planes[0].review_items[0];
  item.category="CROSSOVER_STEAM_REPLAY";
  item.level=1;
  item.source_status="GUARDED";
 });
 assert.throws(()=>verify(attempted),/VISUAL_REVIEW_LEVEL_DOWNGRADE_HOLD|VISUAL_REVIEW_POLICY_HOLD/);
 const ownerOriginal=modified(x=>{
  const item=x.planes[0].review_items[0];
  item.category="OWNER_CHATGPT_CONVERSATION_ZIP";
  item.source_status="PROTECTED";
  item.proof_state="INCOMPLETE";
 });
 assert.equal(verify(ownerOriginal).planes[0].reviewItems![0].level,5);
 const root=mkdtempSync(path.join(tmpdir(),"storage-l5-permanent-"));
 mkdirSync(path.join(root,"state"),{mode:0o700});
 const previous=process.env.AOE2WAR_OS_STORE_DIR;
 process.env.AOE2WAR_OS_STORE_DIR=root;
 try{
  for(const decision of ["PROTECT","REVOKE","SINGLE_CANDIDATE_APPROVAL","MIGRATION_REVIEW"] as const)
   await assert.rejects(()=>appendOwnerReview({plane:"mac",item:inherited,decision,previousId:null,now:clock}),/REVIEW_L5_OWNER_IMMUTABLE/);
  assert.deepEqual(await readOwnerReviews(),[]);
  assert.equal(effectiveOwnerDecision({...baseEvent,decision:"PROTECT"},inherited,clock),null);
 }finally{
  if(previous===undefined)delete process.env.AOE2WAR_OS_STORE_DIR;else process.env.AOE2WAR_OS_STORE_DIR=previous;
  rmSync(root,{recursive:true,force:true});
 }
});

test("C-v1 unsupported individual/capacity evidence stays inaccessible in private read view, even when manually signed",async()=>{
 assert.equal(INDIVIDUAL_TRANSPORT_ADOPTED,false);
 const root=mkdtempSync(path.join(tmpdir(),"storage-C-v1-fail-closed-"));
 const state=path.join(root,"state");
 mkdirSync(state,{mode:0o700});
 const prevRoot=process.env.AOE2WAR_OS_STORE_DIR,prevKey=process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;
 process.env.AOE2WAR_OS_STORE_DIR=root;
 process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY=key;
 try{
  const envelope={schema:"aoe2war.storage-visual.signed.v1",payload,
   signature_hmac_sha256:signVisualPayloadForTests(payload,key)};
  writeFileSync(path.join(state,"storage-visual.v1.json"),JSON.stringify(envelope)+"\n",{mode:0o600});
  // Offline parser verifies legacy HMAC/L5 migration for forensic compatibility.
  assert.equal(verifyVisualReceipt(envelope,key,clock).planes[0].reviewItems?.length,1);
  // Live read path never promotes the unsupported legacy extras to owner authority.
  const observed=await readPrivateStorageVisual(clock);
  assert.equal(observed.source,"SIGNED_PRIVATE_RECEIPT");
  assert.equal(observed.planes[0].hogs[0].key,"GUARDED_GENERATED");
  assert.equal(observed.planes[0].reviewItems,undefined);
  assert.equal(observed.planes[0].capacitySamples,undefined);
  assert.equal(statSync(path.join(state,"storage-visual.v1.json")).mode&0o077,0);
 }finally{
  if(prevRoot===undefined)delete process.env.AOE2WAR_OS_STORE_DIR;else process.env.AOE2WAR_OS_STORE_DIR=prevRoot;
  if(prevKey===undefined)delete process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY;else process.env.AOE2WAR_STORAGE_VISUAL_HMAC_KEY=prevKey;
  rmSync(root,{recursive:true,force:true});
 }
});
