import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {Script} from "node:vm";
const require=createRequire(import.meta.url);
const ts=require("typescript");
const source=readFileSync("lib/storageM1PlacementDated.ts","utf8");
const page=readFileSync("app/admin/storage-os/atlas/m1/placement/page.tsx","utf8");
const parent=readFileSync("app/admin/storage-os/atlas/m1/page.tsx","utf8");
const code=ts.transpileModule(source,{
 fileName:"storageM1PlacementDated.ts",
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,
  esModuleInterop:true}
}).outputText;
const module={exports:{} as Record<string,unknown>};
new Script("(function(require,module,exports){"+code+"\n})",{
 filename:"storage-m1-placement-source.mjs"
}).runInThisContext()((id:string)=>{
 if(id==="server-only")return {};
 throw Error("UNEXPECTED_MODULE:"+id);
},module,module.exports);
const view=(module.exports.getDatedM1Placement as ()=>Record<string,unknown>)();
const rows=view.rows as Array<Record<string,unknown>>;

test("M1 placement is a strictly partial, dated, never-authoritative source",()=>{
 assert.equal(view.schema,"aoe2war.storage.m1-dated-placement.v1");
 assert.equal(view.authority,"ADMIN_READ_ONLY_DATED_UNCERTIFIED_NO_OPERATION");
 assert.equal(view.coverage,"PARTIAL_SCOPED_OWNER_READ_ONLY");
 assert.equal(view.wholeFilesystemCertified,false);
 assert.equal(view.ownerPrivatePathsExposed,false);
 assert.equal(view.uniqueReclaimBytes,null);
 assert.equal(view.unattributedBytes,null);
 assert.equal(view.currentOwnerPermitIssued,false);
 assert.equal(view.transfersAuthorized,false);
 assert.equal(view.newPhysicalReclaimBytes,0);
 assert.equal(view.apfsContainerTotalBytes,494384795648);
 assert.equal(view.apfsContainerAvailableBytes,5964894208);
 assert.equal(view.filesEnumeratedAndMatched,16);
 assert.equal(view.originalFactoryZipManifestUsed,true);
 assert.equal(view.originalFactoryZipGrossBytes,9868439552);
});

test("Every M1 row remains explicitly owner-held; no unique APFS reclaim is fabricated",()=>{
 assert.equal(rows.length,11);
 assert.equal(new Set(rows.map(x=>x.opaqueId)).size,rows.length);
 assert.deepEqual(new Set(rows.map(x=>x.disposition)),
  new Set(["KEEP_HOT","KEEP_WARM","INTEL_COLD","SAFE_TO_RECREATE","UNKNOWN"]));
 for(const r of rows){
  assert.equal(r.apfsExclusiveReclaimBytes,null);
  assert.equal(r.expectedReclaimBytes,null);
  assert.equal(r.actualReclaimedBytes,0);
  assert.equal(r.actionAuthorized,false);
  assert.equal(r.scanCoverage,"BOUNDED_PARTIAL");
  assert.match(String(r.lastVerifiedAt),/^2026-11-22T/);
  assert.ok(Number.isSafeInteger(r.allocatedGrossBytes));
  assert.ok((r.allocatedGrossBytes as number)>0);
  assert.doesNotMatch(String(r.label)+String(r.dependencies)+String(r.proposedDestination),
   /\/Users\/|\.ssh\/|PRIVATE_KEY|HMAC_KEY|BEGIN (?:RSA|OPENSSH) PRIVATE KEY/);
 }
});

test("16 original Factory ZIPs are disjoint cohort totals, not a second free-space source",()=>{
 const byId=Object.fromEntries(rows.map(x=>[x.opaqueId,x]));
 const keep=byId["m1-factory-hot-five"];
 const restored=byId["m1-factory-restored-five"];
 const copy=byId["m1-factory-intel-six"];
 assert.equal(keep.allocatedGrossBytes,3086176256);
 assert.equal(restored.allocatedGrossBytes,3080011776);
 assert.equal(copy.allocatedGrossBytes,3702251520);
 assert.equal((keep.allocatedGrossBytes as number)+(restored.allocatedGrossBytes as number)+
  (copy.allocatedGrossBytes as number),view.originalFactoryZipGrossBytes);
 assert.equal(keep.disposition,"KEEP_HOT");
 assert.equal(restored.recovery,"FIVE_PRIOR_INTEL_RESTORES");
 assert.equal(restored.actionAuthorized,false);
 assert.equal(copy.disposition,"INTEL_COLD");
 assert.equal(copy.recovery,"NOT_PROVEN");
 assert.equal(copy.actionAuthorized,false);
 assert.equal(byId["m1-chrome-cache"].approvalLevel,"L1_CONDITIONAL");
 assert.equal(byId["m1-chrome-cache"].actionAuthorized,false);
 assert.equal(byId["m1-financial-cache"].approvalLevel,"L5_PROTECTED");
});

test("Private page gates owner UI server-side and links from existing M1 Atlas",()=>{
 assert.match(page,/await requireServerAdmin\(\)/);
 assert.ok(page.indexOf("await requireServerAdmin()")<page.indexOf("getDatedM1Placement()"));
 assert.match(page,/dynamic="force-dynamic"/);
 assert.match(page,/NOT SIGNED|NOT A DELETION PERMIT/);
 assert.match(page,/EXPECTED UNIQUE|Expected unique reclaim/i);
 assert.match(page,/overflow-x-auto/);
 assert.match(parent,/await requireServerAdmin\(\)/);
 assert.match(parent,/\/admin\/storage-os\/atlas\/m1\/placement/);
 for(const text of [page,parent,source]){
  assert.doesNotMatch(text,/export async function (?:POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(text,/execSync\(|spawn\(|ssh |rm -rf|unlink\(/);
 }
});
