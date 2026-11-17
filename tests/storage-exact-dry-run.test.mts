import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";
import {buildManifestDraft,StorageManifestHold} from "../lib/storageExactDryRun.ts";
import type {StorageVisualView} from "../lib/storageVisualPrivate.ts";

const observed="2026-11-17T12:00:00.000Z";
const fresh=new Date("2026-11-17T12:04:00.000Z");
const item={
  alias:"APP_GENERATED_REVIEW_01",category:"GUARDED_GENERATED" as const,
  level:1 as const,grossBytes:1048576,overlaps:false,
  fingerprint:"f".repeat(64),sourceDigest:"a".repeat(64),
  sourceRevision:"b".repeat(40),
  sourceStatus:"GUARDED" as const,proofState:"COMPLETE" as const,
};
const receipt:StorageVisualView={
  authority:"PRIVATE_SIGNED_GROSS_ALLOCATION_ONLY",
  source:"SIGNED_PRIVATE_RECEIPT",
  planes:[{id:"mac",observedAt:observed,coverage:"PARTIAL",hogs:[],
    events:[],status:"RECEIPT",reviewItems:[item]}],
};
const req={plane:"mac" as const,alias:item.alias,observedAt:observed,sourceDigest:item.sourceDigest};
test("strict v1 transport stays CLOSED, not an environment toggle",()=>{
  const source=readFileSync(path.join(process.cwd(),"lib/storageReviewTransportPolicy.ts"),"utf8");
  assert.match(source,/INDIVIDUAL_TRANSPORT_ADOPTED:\s*boolean\s*=\s*false/);
  assert.throws(()=>buildManifestDraft(receipt,req,false,fresh),
    (e:unknown)=>e instanceof StorageManifestHold&&e.reason==="INDIVIDUAL_TRANSPORT_NOT_ADMITTED");
});
test("a provisional manifest is reproducibly source-bound, and every destructive gate HOLD",()=>{
  const a=buildManifestDraft(receipt,req,true,fresh),b=buildManifestDraft(receipt,req,true,fresh);
  assert.deepEqual(a,b);
  assert.equal(a.authority,"NO_DELETE");
  assert.equal(a.status,"HOLD_NATIVE_IDENTITY_AND_RECOVERY");
  assert.equal(a.gates.length,11);
  assert.equal(a.gates.filter(g=>g.verdict==="HOLD").length,10);
  assert.equal(a.gates.find(g=>g.name==="EXECUTE")?.verdict,"HOLD");
  assert.match(a.manifestDigest,/^[0-9a-f]{64}$/);
});
test("stale, wrong digest, wrong scope, protected, overlapping and incomplete sources fail closed",()=>{
  const wrongs=[
    [receipt,{...req,sourceDigest:"1".repeat(64)},fresh],
    [receipt,{...req,plane:"hel1-root" as const},fresh],
    [receipt,req,new Date("2026-11-17T14:00:00.000Z")],
    [{...receipt,planes:receipt.planes.map(p=>({...p,reviewItems:[{...item,level:5 as const}]}))},req,fresh],
    [{...receipt,planes:receipt.planes.map(p=>({...p,reviewItems:[{...item,overlaps:true}]}))},req,fresh],
    [{...receipt,planes:receipt.planes.map(p=>({...p,reviewItems:[{...item,proofState:"INCOMPLETE" as const}]}))},req,fresh],
  ] as const;
  for(const [source,input,clock] of wrongs)assert.throws(
    ()=>buildManifestDraft(source as StorageVisualView,input,true,clock),StorageManifestHold);
  assert.notEqual(buildManifestDraft(receipt,req,true,fresh).manifestDigest,
    buildManifestDraft({...receipt,planes:receipt.planes.map(p=>({
      ...p,reviewItems:[{...item,grossBytes:item.grossBytes+1}]
    }))},req,true,fresh).manifestDigest);
});
test("new route is owner-only, same-origin, size-limited and nonexecuting",()=>{
  const route=readFileSync(path.join(process.cwd(),"app/api/admin/storage-os/dry-run/route.ts"),"utf8");
  const page=readFileSync(path.join(process.cwd(),"components/storage-os/StoragePremiumInspector.tsx"),"utf8");
  const hostPolicy=readFileSync(path.join(process.cwd(),"lib/storageExactDryRun.ts"),"utf8");
  assert.match(route,/requireAdmin\(request\)/);
  assert.match(route,/CROSS_ORIGIN_HOLD/);
  assert.match(route,/INDIVIDUAL_TRANSPORT_ADOPTED/);
  assert.match(page,/ZERO CERTIFIED ITEMS/);
  assert.match(page,/repeating-linear-gradient/);
  assert.match(page,/Sortable individual-file inventory/);
  assert.match(page,/Sort exact-file inventory/);
  assert.doesNotMatch(route+hostPolicy,/\b(?:unlink|rmdir|rmSync|execSync|spawn|chmod|chown)\s*\(/);
  assert.doesNotMatch(route,/export\s+(?:async\s+)?function\s+(?:DELETE|PUT|PATCH)\b/);
});

test("premium tiny step numerals maintain WCAG AA contrast at 375px",()=>{
  const page=readFileSync(path.join(process.cwd(),"components/storage-os/StoragePremiumInspector.tsx"),"utf8");
  const step=/\<div className="text-\[10px\] text-slate-(\d+)">\{String\(i\+1\)/.exec(page);
  assert.equal(step?.[1],"400","step labels require text-slate-400 or stronger");
  // The previous slate-500 foreground (#64748b) over the rendered dark
  // panel (#0a111d) was 3.97:1; the corrected slate-400 is comfortably AA.
  const linear=(x:number)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
  const luma=(hex:string)=>{const cs=[1,3,5].map(n=>linear(parseInt(hex.slice(n,n+2),16)/255));return cs[0]*.2126+cs[1]*.7152+cs[2]*.0722;};
  const a=luma("#94a3b8"),b=luma("#0a111d");
  const contrast=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  assert.ok(contrast>=4.5, "small labels must achieve WCAG AA 4.5:1, got "+contrast.toFixed(2));
});
