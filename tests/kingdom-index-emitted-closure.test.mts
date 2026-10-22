import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp,mkdir,writeFile,rm,symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { collectIndexEmittedClosure } from "../scripts/kingdom_index_emitted_closure.mjs";
const SHA="a".repeat(40);
const FILES=[
 ".next/BUILD_ID",".next/server/app/kingdom-index/page.js",
 ".next/server/app/api/kingdom-index/route.js",
 ".next/server/app-paths-manifest.json",".next/build-manifest.json",
 ".next/required-server-files.json",
 ".next/server/app/kingdom-index/page.js.nft.json",
 ".next/server/app/api/kingdom-index/route.js.nft.json",
 "lib/generated/prisma/index.js",
 ".next/static/chunks/kingdom.js"
];
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),"index-emitted-test-"));
  for(const p of FILES){
    const name=join(root,p);await mkdir(dirname(name),{recursive:true});
    await writeFile(name,p.endsWith(".nft.json")?JSON.stringify({version:1,files:[]}):
      p.endsWith("BUILD_ID")?"fixture-build-20261022\n":"fixture: "+p+"\n");
  }
  return root;
}
test("bounded emitted capture hashes exact bytes but NEVER grants certification",async()=>{
  const root=await fixture();
  try{
    const result=await collectIndexEmittedClosure(root,SHA,SHA);
    assert.equal(result.status,"OBSERVED_NOT_CERTIFIED");
    assert.equal(result.certified,false);
    assert.equal(result.publicationAuthorized,false);
    assert.equal(result.buildId,"fixture-build-20261022");
    assert.equal(result.files.length,FILES.length);
    assert.equal(result.missing.length,0);
    assert.match(result.receiptSha256,/^[a-f0-9]{64}$/);
    assert.equal(result.files.some(r=>r.path===".next/static/chunks/kingdom.js"),true);
    assert.equal(result.files.some(r=>r.path==="lib/generated/prisma/index.js"),true);
  }finally{await rm(root,{recursive:true,force:true});}
});
test("altered expected source SHA is refused without reading fake build",async()=>{
  const root=await fixture();
  try{await assert.rejects(collectIndexEmittedClosure(root,SHA,"b".repeat(40)),/SHA mismatch/)}
  finally{await rm(root,{recursive:true,force:true});}
});
test("missing required Prisma output or source trace fails visibly",async()=>{
  const root=await fixture();
  try{
    await rm(join(root,"lib/generated/prisma/index.js"));
    await rm(join(root,".next/server/app/kingdom-index/page.js.nft.json"));
    const result=await collectIndexEmittedClosure(root,SHA,SHA);
    assert.equal(result.status,"INCOMPLETE");
    assert.equal(result.certified,false);
    assert.ok(result.missing.some(s=>s.includes("lib/generated/prisma/index.js")));
    assert.ok(result.missing.some(s=>s.includes("page.js.nft.json")));
  }finally{await rm(root,{recursive:true,force:true});}
});
test("emitted trace that escapes repository stays INCOMPLETE",async()=>{
  const root=await fixture();
  try{
    await writeFile(join(root,".next/server/app/kingdom-index/page.js.nft.json"),
      JSON.stringify({version:1,files:["../../../../../../../../private/sentinel"]}));
    const result=await collectIndexEmittedClosure(root,SHA,SHA);
    assert.equal(result.status,"INCOMPLETE");
    assert.ok(result.invalidTraces.some(x=>x.includes("outside-root")));
    assert.equal(result.certified,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
test("trace-file hash changes when emitted bytes change (no fake parity)",async()=>{
  const root=await fixture();
  try{
    const first=await collectIndexEmittedClosure(root,SHA,SHA);
    await writeFile(join(root,".next/server/app/kingdom-index/page.js"),"changed build contents");
    const second=await collectIndexEmittedClosure(root,SHA,SHA);
    assert.notEqual(first.receiptSha256,second.receiptSha256);
    assert.equal(second.certified,false);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("symlinked/macOS realpath entrypoint executes instead of silently returning zero",async()=>{
  const root=await mkdtemp(join(tmpdir(),"index-entrypoint-alias-"));
  try{
    const source=fileURLToPath(new URL("../scripts/kingdom_index_emitted_closure.mjs",import.meta.url));
    const alias=join(root,"alias-collector.mjs");
    await symlink(source,alias);
    const result=spawnSync(process.execPath,[alias,"--invalid"],{encoding:"utf8",timeout:5000});
    assert.equal(result.status,2,"physical alias must invoke the collector and reject invalid CLI args");
    assert.match(result.stderr,/Require --expected-sha/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test("absent local .next tree reports each required trace once, never fabricates a BUILD_ID",async()=>{
  const root=await mkdtemp(join(tmpdir(),"index-no-local-build-"));
  try{
    const report=await collectIndexEmittedClosure(root,SHA,SHA);
    assert.equal(report.status,"INCOMPLETE");
    assert.equal(report.buildId,null);
    assert.equal(report.files.length,0);
    assert.equal(report.invalidTraces.length,0);
    for(const path of [
      ".next/server/app/kingdom-index/page.js.nft.json",
      ".next/server/app/api/kingdom-index/route.js.nft.json"
    ]){
      assert.equal(report.missing.filter(x=>x.startsWith(path)).length,1,
        "a missing required NFT trace must not be double-counted");
    }
    assert.equal(report.certified,false);
  }finally{await rm(root,{recursive:true,force:true});}
});
test("malformed existing NFT trace is independently classified as invalid",async()=>{
  const root=await fixture();
  try{
    await writeFile(join(root,".next/server/app/kingdom-index/page.js.nft.json"),"{not-json");
    const report=await collectIndexEmittedClosure(root,SHA,SHA);
    assert.equal(report.status,"INCOMPLETE");
    assert.ok(report.invalidTraces.some(x=>x.includes("page.js.nft.json:invalid-or-unreadable")));
  }finally{await rm(root,{recursive:true,force:true});}
});
