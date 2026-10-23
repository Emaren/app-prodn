import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp,mkdir,writeFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname,join } from "node:path";
import { execFileSync } from "node:child_process";
import {captureTrackedProvenance,classifyTrackedChanges} from "../scripts/kingdom_index_tracked_provenance.mjs";
const git=(root,...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
async function repoFixture(){
 const root=await mkdtemp(join(tmpdir(),"kingdom-provenance-"));
 git(root,"init","-q");git(root,"config","user.email","ci@example.invalid");
 git(root,"config","user.name","ci test");
 const files=[
  "lib/pageChangeManifest.generated.ts",
  "next-env.d.ts",
  "app/kingdom-index/page.tsx"
 ];
 for(const name of files){await mkdir(dirname(join(root,name)),{recursive:true});
  await writeFile(join(root,name),"initial:"+name+"\n");}
 git(root,"add",".");git(root,"commit","-qm","immutable base");
 return {root,sha:git(root,"rev-parse","HEAD")};
}
test("clean exact HEAD and full tracked content are distinct from arbitrary identical branch label",async()=>{
 const {root,sha}=await repoFixture();
 try{
  const r=captureTrackedProvenance({cwd:root,expectedSha:sha,phase:"checkout"});
  assert.equal(r.trackedClean,true);assert.equal(r.sourceIdentity,"HEAD_AND_TRACKED_CONTENT_AGREE");
  assert.deepEqual(r.trackedChangedFiles,[]);
  assert.match(r.sha256,/^[a-f0-9]{64}$/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("tracked generated compile input is observed but NEVER authorized silently",async()=>{
 const {root,sha}=await repoFixture();
 try{
  await writeFile(join(root,"lib/pageChangeManifest.generated.ts"),"recomputed page hashes\n");
  const r=captureTrackedProvenance({cwd:root,expectedSha:sha,phase:"built"});
  assert.equal(r.trackedClean,false);assert.equal(r.trackedChangedFiles.length,1);
  assert.equal(r.trackedChangedFiles[0].classification,"TRACKED_GENERATED_COMPILE_INPUT_REQUIRES_RESEAL");
  assert.equal(r.trackedChangedFiles[0].authorized,false);
  assert.match(r.trackedChangedFiles[0].beforeBlob,/^[0-9a-f]{40}$/);
  assert.match(r.trackedChangedFiles[0].afterBlob,/^[0-9a-f]{40}$/);
  assert.notEqual(r.trackedChangedFiles[0].beforeBlob,r.trackedChangedFiles[0].afterBlob);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("Next-generated tracked declaration requires reseal, unexpected route modification remains UNKNOWN",async()=>{
 const {root,sha}=await repoFixture();
 try{
  await writeFile(join(root,"next-env.d.ts"),"rewritten by Next\n");
  await writeFile(join(root,"app/kingdom-index/page.tsx"),"a malicious or accidental source change\n");
  const r=captureTrackedProvenance({cwd:root,expectedSha:sha,phase:"built"});
  assert.equal(r.trackedClean,false);
  assert.equal(r.trackedChangedFiles.length,2);
  assert.ok(r.trackedChangedFiles.some(x=>x.classification==="NEXT_GENERATED_TRACKED_DECLARATION_REQUIRES_RESEAL"));
  assert.ok(r.trackedChangedFiles.some(x=>x.classification==="UNCLASSIFIED_TRACKED_SOURCE_MUTATION"));
  assert.ok(r.trackedChangedFiles.every(x=>x.authorized===false));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("wrong immutable source commit refused before inspection",async()=>{
 const {root,sha}=await repoFixture();
 try{assert.throws(()=>captureTrackedProvenance({cwd:root,expectedSha:"f".repeat(40),phase:"built"}),/Source HEAD drift/)}
 finally{await rm(root,{recursive:true,force:true});}
});
test("staged and deleted tracked files cannot pass pre-build identity fence",async()=>{
 const {root,sha}=await repoFixture();
 try{
  await rm(join(root,"app/kingdom-index/page.tsx"));
  await writeFile(join(root,"next-env.d.ts"),"staged mutation\n");
  git(root,"add","next-env.d.ts");
  const r=captureTrackedProvenance({cwd:root,expectedSha:sha,phase:"dependencies"});
  assert.equal(r.trackedClean,false);
  assert.ok(r.trackedChangedFiles.some(x=>x.status==="D"&&x.afterBlob===null));
  assert.ok(r.trackedChangedFiles.some(x=>x.status==="M"&&x.afterBlob!==null));
 }finally{await rm(root,{recursive:true,force:true});}
});
test("fixed classifier rejects unsafe paths and unexpected status markers",()=>{
 assert.throws(()=>classifyTrackedChanges([{path:"../secret",status:"M"}]),/Unsafe git status/);
 assert.throws(()=>classifyTrackedChanges([{path:"ok",status:"R",beforeBlob:null,afterBlob:null}]),/Unsafe git status/);
});
