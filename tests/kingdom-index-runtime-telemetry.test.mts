import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,writeFile,symlink,rm,chmod} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {parseKingdomRuntimeTelemetry,readKingdomRuntimeTelemetry,RUNTIME_SCHEMA} from "../lib/kingdomIndexRuntimeTelemetry.mjs";
const NOW=Date.parse("2026-10-25T20:40:00.000Z");
const source={gitSha:"a".repeat(40),buildId:"exact-next-build-runtime-123"};
const identity={expectedGitSha:source.gitSha,expectedBuildId:source.buildId,nowMs:NOW};
const hash=s=>createHash("sha256").update(s).digest("hex");
const time=(min=0)=>new Date(NOW+min*60000).toISOString();
function snapshot(readings=[{
 id:"navigation",producer:"chromium-collector",numerator:88,denominator:88,
 observedAt:time(-2),expiresAt:time(10),receiptSha256:hash("raw-actual-producer-proof-bytes")
}]){
 const data={schema:RUNTIME_SCHEMA,source,capturedAt:time(-1),readings};
 return JSON.stringify({...data,revisionSha256:hash(JSON.stringify(data))});
}
test("operational runtime feed is exact-source and carries no quality approval, signer, or score",()=>{
 const result=parseKingdomRuntimeTelemetry(snapshot(),identity);
 assert.equal(result.readings.length,1);
 assert.equal(result.readings[0].status,"REPORTED_UNVERIFIED");
 assert.equal(result.readings[0].numerator,88);
 assert.equal(result.authority,"OPERATOR_REPORTED_UNCERTIFIED");
 assert.equal(result.sourceSha,source.gitSha);
 assert.equal(result.buildId,source.buildId);
 assert.equal(Object.hasOwn(result,"score"),false);
 assert.equal(Object.hasOwn(result,"certified"),false);
 assert.equal(Object.hasOwn(result.readings[0],"approved"),false);
 assert.ok(Object.isFrozen(result.readings[0]));
});
test("expired original observation remains visibly STALE, not current and not zero",()=>{
 const row=JSON.parse(snapshot()).readings[0];
 row.expiresAt=time(-1);
 const j=parseKingdomRuntimeTelemetry(snapshot([row]),identity);
 assert.equal(j.readings[0].status,"STALE");
 assert.equal(j.readings[0].numerator,88);
});
test("wrong source/build, corrupted revision, repeated IDs, forged identity or new schema fail closed",()=>{
 const doc=JSON.parse(snapshot());
 for(const modify of [
  d=>{d.source.gitSha="b".repeat(40)},
  d=>{d.source.buildId="other-build"},
  d=>{d.schema="attack"},
  d=>{d.readings[0].producer="kingdom-doctor"},
  d=>{d.readings[0].numerator=100},
  d=>{d.readings.push({...d.readings[0]})},
  d=>{d.readings[0].score=100},
  d=>{d.readings[0].certified=true},
  d=>{d.capturedAt=time(60)},
  d=>{d.readings[0].observedAt=time(20)},
  d=>{d.readings[0].expiresAt=time(2000)},
  d=>{d.revisionSha256="0".repeat(64)}
 ]){
  const item=structuredClone(doc);modify(item);
  assert.throws(()=>parseKingdomRuntimeTelemetry(JSON.stringify(item),identity),/KINGDOM RUNTIME STOP/);
 }
 assert.throws(()=>parseKingdomRuntimeTelemetry("x".repeat(48001),identity),/Oversized/);
 assert.throws(()=>parseKingdomRuntimeTelemetry("{}",identity),/Invalid/);
});
test("each field has fixed producer, denominator and range, no live quality grade field",()=>{
 const rows=[
  {id:"navigation",producer:"chromium-collector",denominator:88,numerator:87},
  {id:"accessibility",producer:"axe-observer",denominator:88,numerator:3},
  {id:"doctor",producer:"kingdom-doctor",denominator:100,numerator:59},
  {id:"inspections",producer:"general-inspections",denominator:100,numerator:69},
  {id:"releaseParity",producer:"website-release-observer",denominator:1,numerator:0},
 ].map(x=>({...x,observedAt:time(-2),expiresAt:time(10),receiptSha256:hash(x.id)}));
 const r=parseKingdomRuntimeTelemetry(snapshot(rows),identity);
 assert.equal(r.readings.length,5);
 assert.ok(r.readings.every(x=>x.status==="REPORTED_UNVERIFIED"));
 assert.throws(()=>parseKingdomRuntimeTelemetry(snapshot([...rows,{...rows[0],id:"fake"}]),identity),/Source\/schema/);
});
test("private 0700/0600 owned snapshot reads, symlink, permissive directory and untrusted source refuse",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"kingdom-index-runtime-"));
 const file=join(dir,"latest.json"),link=join(dir,"redirect.json");
 try{
  await writeFile(file,snapshot(),{mode:0o600});
  const yes=await readKingdomRuntimeTelemetry({file,...identity});
  assert.equal(yes?.readings[0]?.numerator,88);
  await symlink(file,link);
  assert.equal(await readKingdomRuntimeTelemetry({file:link,...identity}),null);
  assert.equal(await readKingdomRuntimeTelemetry({file,...identity,expectedGitSha:"b".repeat(40)}),null);
  await chmod(dir,0o755);
  assert.equal(await readKingdomRuntimeTelemetry({file,...identity}),null);
  await chmod(dir,0o700);
  await writeFile(file,JSON.stringify({broken:true}),{mode:0o600});
  assert.equal(await readKingdomRuntimeTelemetry({file,...identity}),null);
 }finally{await rm(dir,{recursive:true,force:true})}
});
