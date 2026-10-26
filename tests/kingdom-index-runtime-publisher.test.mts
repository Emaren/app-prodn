import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir,lstat,symlink} from "node:fs/promises";
import {join,resolve} from "node:path";
import {tmpdir} from "node:os";
import {fileURLToPath} from "node:url";
import {RUNTIME_SCHEMA} from "../lib/kingdomIndexRuntimeTelemetry.mjs";

const ROOT=resolve(fileURLToPath(new URL("..",import.meta.url)));
const PUBLISH=join(ROOT,"scripts/kingdom_index_publish_runtime.mjs");
const SHA="a".repeat(40);
const BUILD="test-Next-build-publisher-stage-v4";
const hash=value=>createHash("sha256").update(value).digest("hex");
const now=()=>Date.now();
const stamp=ms=>new Date(ms).toISOString();

function originalReceipt({expired=false,corrupt=false}={}){
 const t=now();
 const source={gitSha:SHA,buildId:BUILD};
 const readings=[{
  id:"navigation",producer:"chromium-collector",numerator:88,denominator:88,
  observedAt:stamp(t-30_000),expiresAt:stamp(expired?t-5_000:t+120_000),
  receiptSha256:hash("separate-original-collector-fixture"),
 }];
 const base={schema:RUNTIME_SCHEMA,source,capturedAt:stamp(t),readings};
 return JSON.stringify({...base,revisionSha256:corrupt?"0".repeat(64):hash(JSON.stringify(base))});
}
async function sandbox(){
 const root=await mkdtemp(join(tmpdir(),"kingdom-publisher-stage-"));
 const work=join(root,"app"),sourceDir=join(root,"producer"),destDir=join(root,"private-web");
 await Promise.all([mkdir(work,{mode:0o700}),mkdir(sourceDir,{mode:0o700}),mkdir(destDir,{mode:0o700})]);
 await mkdir(join(work,".next"),{mode:0o700});
 await writeFile(join(work,".next/BUILD_ID"),BUILD+"\n");
 return {root,work,input:join(sourceDir,"original.json"),output:join(destDir,"latest.json")};
}
function publish({work,input,output}){
 return spawnSync(process.execPath,[PUBLISH,input,output],{
  cwd:work,encoding:"utf8",timeout:15_000,
  env:{...process.env,KINGDOM_INDEX_DEPLOYED_GIT_SHA:SHA,
   KINGDOM_INDEX_DEPLOYED_BUILD_ID:BUILD},
 });
}
test("published runtime telemetry is exactly source-bound, 0600 and still uncertified",async()=>{
 const s=await sandbox();
 try{
  const original=originalReceipt();
  await writeFile(s.input,original,{mode:0o600});
  const p=publish(s);
  assert.equal(p.status,0,p.stderr||p.stdout);
  const result=JSON.parse(p.stdout);
  assert.equal(result.status,"OPERATOR_REPORTED_UNCERTIFIED");
  assert.equal(result.sourceSha,SHA);
  assert.equal(result.buildId,BUILD);
  assert.equal(result.readings,1);
  assert.equal(await readFile(s.output,"utf8"),original);
  assert.equal((await lstat(s.output)).mode&0o077,0);
  assert.deepEqual(await readdir(resolve(s.output,"..")),["latest.json"]);
 }finally{await rm(s.root,{recursive:true,force:true});}
});
test("bad revision or stale report never replaces a previous valid publication",async()=>{
 const s=await sandbox();
 try{
  const original=originalReceipt();
  await writeFile(s.input,original,{mode:0o600});
  assert.equal(publish(s).status,0);
  for(const bad of [originalReceipt({expired:true}),originalReceipt({corrupt:true})]){
   await writeFile(s.input,bad,{mode:0o600});
   const p=publish(s);
   assert.notEqual(p.status,0,"malformed or expired telemetry must not publish");
   assert.equal(await readFile(s.output,"utf8"),original,"old snapshot must survive");
  }
  assert.deepEqual(await readdir(resolve(s.output,"..")),["latest.json"]);
 }finally{await rm(s.root,{recursive:true,force:true});}
});
test("output symlink and unreadable source fail before modifying output",async()=>{
 const s=await sandbox();
 try{
  await writeFile(s.input,originalReceipt(),{mode:0o600});
  await symlink(s.input,s.output);
  const p=publish(s);
  assert.notEqual(p.status,0);
  assert.equal((await lstat(s.output)).isSymbolicLink(),true);
  assert.equal(await readFile(s.input,"utf8"),await readFile(s.output,"utf8"));
 }finally{await rm(s.root,{recursive:true,force:true});}
});
test("the staged verification read must override input in the options spread",async()=>{
 const script=await readFile(PUBLISH,"utf8");
 assert.match(script,/readKingdomRuntimeTelemetry\(\{\.\.\.options,file:tmp\}\)/);
 assert.doesNotMatch(script,/readKingdomRuntimeTelemetry\(\{file:tmp,\.\.\.options\}\)/);
});
