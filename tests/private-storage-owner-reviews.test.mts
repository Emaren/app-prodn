import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOG_CATALOG, signVisualPayloadForTests, verifyVisualReceipt } from "../lib/storageVisualPrivate.ts";
import { effectiveOwnerDecision, latestEvent, type OwnerReviewEvent } from "../lib/storageOwnerReviews.ts";

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

test("four source-controlled levels include guarded but immutable protected assets",()=>{
 assert.equal(HOG_CATALOG.GUARDED_GENERATED.level,1);
 assert.equal(HOG_CATALOG.CROSSOVER_STEAM_REPLAY.level,4);
 assert.equal(HOG_CATALOG.HEL1_ACTIVE_SWAP.level,4);
 assert.equal(HOG_CATALOG.WATCHER_SIGNED_DIST.level,4);
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
 assert.match(ledger,/O_NOFOLLOW/);
 assert.match(ledger,/O_EXCL/);
 assert.match(ledger,/handle\.sync\(\)/);
 assert.doesNotMatch(route+ledger+ui,/rmSync|unlinkSync|execFile|spawn\(|--apply|killall Finder/);
 assert.match(ui,/FOUR|Four levels/);
 assert.match(ui,/UNKNOWN/);
 assert.match(ui,/INTENT|deletion permit/i);
});
