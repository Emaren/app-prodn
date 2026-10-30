import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ownerL2CategoryPreviews, ownerL2ReviewBasket } from "../lib/storageL2OwnerPreview.ts";
import type { StorageVisualView } from "../lib/storageVisualPrivate.ts";

const visual: StorageVisualView = {
  authority: "PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",
  source: "SIGNED_PRIVATE_RECEIPT",
  planes: [{
    id: "mac", observedAt: "2026-10-29T23:00:00Z", coverage: "PARTIAL",
    status: "RECEIPT", events: [],
    hogs: [
      {key:"DOWNLOADS", label:"Downloads · owner review", level:2, grossBytes:1234567, overlaps:false},
      {key:"BROWSER_CACHES", label:"Browser caches", level:2, grossBytes:9000, overlaps:true},
      {key:"CODEX_WORKTREES", label:"Codex worktrees", level:5, grossBytes:999999999, overlaps:false},
      {key:"GUARDED_GENERATED", label:"Guarded generated", level:1, grossBytes:123, overlaps:false},
      {key:"OTHER_MEASURED", label:"Other measured", level:3, grossBytes:456, overlaps:false},
    ],
  }],
};

test("L2 preview reads only authenticated current aggregate source, never paths or unique APFS gains",()=>{
  const rows=ownerL2CategoryPreviews(visual,"mac");
  assert.deepEqual(rows.map(x=>x.key),["DOWNLOADS","BROWSER_CACHES"]);
  assert.equal(rows[0].grossBytes,1234567);
  assert.equal(rows[0].provenance,"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY");
  assert.equal(rows[0].coverage,"PARTIAL");
  assert.equal(rows[0].individualSource,"NOT_ATTESTED");
  assert.equal(rows[0].deletionEligible,false);
  assert.equal(rows[0].uniqueRecoverableBytes,null);
  assert.equal(rows[0].ownerAction,"LOCAL_PREVIEW_ONLY");
  assert.equal(rows[0].confidence,"SIGNED_GROSS_NOT_UNIQUE");
  assert.equal(rows[1].confidence,"SIGNED_GROSS_OVERLAP");
  assert.equal(rows.some(x=>x.key==="CODEX_WORKTREES"),false);
});
test("stale, absent, wrong plane, and unsigned sources fail closed",()=>{
  assert.deepEqual(ownerL2CategoryPreviews(undefined,"mac"),[]);
  assert.deepEqual(ownerL2CategoryPreviews({...visual,source:"NONE"},"mac"),[]);
  assert.deepEqual(ownerL2CategoryPreviews({...visual,planes:[{...visual.planes[0],status:"STALE"}]},"mac"),[]);
  assert.deepEqual(ownerL2CategoryPreviews(visual,"hel1-root"),[]);
});
test("owner basket rejects protected, absent, duplicate, or wrong-plane IDs",()=>{
  const rows=ownerL2CategoryPreviews(visual,"mac");
  assert.deepEqual(ownerL2ReviewBasket(rows,["DOWNLOADS"]).map(x=>x.key),["DOWNLOADS"]);
  assert.deepEqual(ownerL2ReviewBasket(rows,["CODEX_WORKTREES"]),[]);
  assert.deepEqual(ownerL2ReviewBasket(rows,["DOWNLOADS","CODEX_WORKTREES"]),[]);
  assert.deepEqual(ownerL2ReviewBasket(rows,["DOWNLOADS","DOWNLOADS"]),[]);
  assert.deepEqual(ownerL2ReviewBasket(rows,["GUARDED_GENERATED"]),[]);
  assert.deepEqual(ownerL2ReviewBasket(rows,["UNKNOWN"]),[]);
  assert.deepEqual(ownerL2ReviewBasket([],["DOWNLOADS"]),[]);
});
test("existing private UI owns only local selection, shows provenance/UNKNOWN, and never gains deletion actions",()=>{
  const ui=readFileSync("components/storage-os/StorageLevelPanels.tsx","utf8");
  assert.match(ui,/ownerL2CategoryPreviews/);
  assert.match(ui,/ownerL2ReviewBasket/);
  assert.match(ui,/L2 OWNER PREVIEW/);
  assert.match(ui,/LOCAL SESSION ONLY/);
  assert.match(ui,/NO INDIVIDUAL FILE IDENTITIES/);
  assert.match(ui,/UNIQUE APFS RECOVERY: UNKNOWN/);
  assert.match(ui,/L5 NEVER DELETE/);
  assert.doesNotMatch(ui,/fetch\([^\n]*delete/i);
});
