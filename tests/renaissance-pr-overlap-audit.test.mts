import test from "node:test";
import assert from "node:assert/strict";
import { auditOpenPulls, formatAudit } from "../scripts/renaissance_pr_overlap_audit.mjs";

const sha="a".repeat(40),other="b".repeat(40),last="c".repeat(40);
const mk=(number,paths,hash=sha)=>({
 number,title:"Renaissance PR #"+number,headRefOid:hash,
 changedFiles:paths.length,files:paths.map(path=>({path}))
});
const fixture=[
 mk(805,["app/kingdom-intelligence/liveRecoveryPolicy.ts","tests/recovery.test.mts"]),
 mk(808,["app/kingdom-brain/KingdomBrainClient.tsx"],other),
 mk(809,["docs/document-registry.json","scripts/renaissance_page_worker.mjs"],last)
];
test("unique page-local PRs have no exact file overlap; never claim approval",()=>{
 const r=auditOpenPulls({pulls:fixture,targetNumber:805,source:"fixture"});
 assert.equal(r.result,"NO_EXACT_OVERLAP_OBSERVED");
 assert.deepEqual(r.exactOverlaps,[]);
 assert.equal(r.mergeApproved,false);assert.equal(r.writeLease,false);assert.equal(r.releaseAuthorized,false);
 assert.match(formatAudit(r),/not approval/);
});
test("stacked documentation writes and source conflict display exact owners",()=>{
 const list=[...fixture,mk(812,["docs/document-registry.json","scripts/renaissance_page_worker.mjs"],other)];
 const r=auditOpenPulls({pulls:list,targetNumber:809});
 assert.equal(r.result,"EXACT_OVERLAP");
 assert.deepEqual(r.exactOverlaps,[{pr:812,headSha:other,files:["docs/document-registry.json","scripts/renaissance_page_worker.mjs"]}]);
 assert.deepEqual(r.centrallyGovernedFiles,["docs/document-registry.json"]);
 assert.match(formatAudit(r),/OVERLAP #812/);
});
test("no false-clear when census or file pagination is incomplete",()=>{
 assert.throws(()=>auditOpenPulls({pulls:[],targetNumber:805}),/nonempty/);
 assert.throws(()=>auditOpenPulls({pulls:fixture,targetNumber:999}),/target PR absent/);
 assert.throws(()=>auditOpenPulls({pulls:fixture,targetNumber:805,maxResults:3}),/reached its limit/);
 assert.throws(()=>auditOpenPulls({pulls:[mk(805,["x"]),mk(805,["y"])],targetNumber:805}),/duplicate/);
 const bad={...mk(805,["a","b"]),files:[{path:"a"}]};
 assert.throws(()=>auditOpenPulls({pulls:[bad],targetNumber:805}),/incomplete/);
});
test("malformed PR metadata and hostile paths refuse to claim clearance",()=>{
 for(const path of ["../secret","/etc/shadow","foo/../bar","foo\\bar","foo/\nbar","foo//bar"]){
  assert.throws(()=>auditOpenPulls({pulls:[mk(805,[path])],targetNumber:805}),/unsafe file path/,path);
 }
 assert.throws(()=>auditOpenPulls({pulls:[mk(805,["a"],"main")],targetNumber:805}),/exact head commit/);
 assert.throws(()=>auditOpenPulls({pulls:[{...mk(805,["a"]),changedFiles:10}],targetNumber:805}),/incomplete/);
 assert.throws(()=>auditOpenPulls({pulls:[{...mk(805,["a"]),title:null}],targetNumber:805}),/title or exact head/);
});
