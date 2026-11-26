import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import {buildStorageReviewQueue} from "../lib/storageLevel2ReviewQueue.ts";
import type {VisualHog} from "../lib/storageVisualPrivate.ts";
const NOW=Date.parse("2026-11-20T22:30:00Z");
const HOGL2:VisualHog={key:"DOWNLOADS",label:"Downloads · owner review",level:2,
  grossBytes:1024**3,overlaps:true};
const HOGL5:VisualHog={key:"FINANCIAL_ORIGINALS",label:"Financial originals",level:5,
  grossBytes:1024**3,overlaps:false};
const original={
  plane:"mac" as const,observedAt:"2026-11-20T22:29:00Z",
  hogs:[HOGL2,HOGL5],events:[],ownerBinding:"a".repeat(64),signedCurrent:true,now:NOW,
};
test("owner recommendation queue refuses unsigned, unenrolled and missing evidence",()=>{
  assert.equal(buildStorageReviewQueue({...original,signedCurrent:false}).admitted,false);
  assert.equal(buildStorageReviewQueue({...original,ownerBinding:null}).items.length,0);
  assert.equal(buildStorageReviewQueue({...original,observedAt:null}).admitted,false);
});
test("L2 requires real distinct signed owner examples and keeps physical gain unknown",()=>{
  const queue=buildStorageReviewQueue(original);
  assert.equal(queue.admitted,true);
  const found=queue.items.find(x=>x.hog.key==="DOWNLOADS")!;
  assert.equal(found.suggestion.finding,"NEEDS_EXAMPLES");
  assert.equal(found.suggestion.confidence,"NONE");
  assert.equal(found.suggestion.deletionAuthorized,false);
  assert.equal(found.suggestion.uniqueReclaimableBytes,null);
  assert.match(found.suggestion.exceptions.join(" "),/Individual-file identity/);
});
test("stronger L5 stays protected even when signed source is current",()=>{
  const q=buildStorageReviewQueue(original);
  const l5=q.items.find(x=>x.hog.key==="FINANCIAL_ORIGINALS")!;
  assert.equal(l5.suggestion.finding,"PROTECTED");
  assert.equal(l5.suggestion.deletionAuthorized,false);
});
test("Intel fourth plane rejects old v1 without purpose-specific admission",()=>{
  const root=process.cwd();
  const api=readFileSync(path.join(root,"app/api/admin/storage-os/intel/route.ts"),"utf8");
  const ui=readFileSync(path.join(root,"components/storage-os/IntelColdStoragePanel.tsx"),"utf8");
  assert.match(api,/INTEL_STATUS_CONTRACT_ADMITTED/);
  assert.match(api,/INTEL_SOURCE_CONTRACT_NOT_INDEPENDENTLY_ADMITTED/);
  assert.match(api,/requireAdmin\(request\)/);
  assert.match(ui,/per-file identities/i);
  assert.match(ui,/UNKNOWN/);
  assert.doesNotMatch(ui,/onDelete=|unlink\(|rmSync\(|executeCleanup\(/);
});
