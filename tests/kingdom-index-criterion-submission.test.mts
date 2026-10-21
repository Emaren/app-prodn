import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDurableCriterionNonceConsumer } from "../lib/kingdomIndexCriterionNonceStore.mjs";
import { ARTIFACT_MANIFEST_SCHEMA, createApprovedCriterionArtifactVerifier } from "../lib/kingdomIndexCriterionArtifactVerifier.mjs";
import { PERFORMANCE_SCHEMA,summarizePerformanceSamples } from "../lib/kingdomIndexPerformanceReceipt.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import rubric from "../config/kingdom-index-quality-rubric.json" with { type:"json" };
import assurances from "../config/kingdom-index-assurance-profiles.json" with { type:"json" };
import { SCHEMA, inspectSignedCriterionSubmission } from "../lib/kingdomIndexCriterionSubmission.mjs";
import { CRITERION_PROOF_KINDS, requiredProofKindsForCriterion, verifyCriterionProofPolicy } from "../lib/kingdomIndexCriterionProofPolicy.mjs";

const now=Date.parse("2026-10-21T20:00:00.000Z");
const issuedAt="2026-10-21T19:59:00.000Z";
const expiresAt="2026-10-21T20:09:00.000Z";
const source={
 route:"/kingdom-index",template:"app/kingdom-index/page.tsx",
 gitSha:"14a3fcb372c2e0623848c792d271ff5e5b432ed6",
 closureSha256:"a".repeat(64),buildId:"a-build-fixture-not-a-live-deployment",
 releaseSha256:"b".repeat(64),
};
const gateProfile=assurances.profiles.index;
const proof=(i,kind="source")=>({
 url:"https://github.com/Emaren/app-prodn/actions/runs/123456/artifacts/"+i,
 sha256:createHash("sha256").update("untrusted-fixture-proof-"+i).digest("hex"),
 kind,measuredAt:issuedAt,conditions:"Synthetic negative/positive contract fixture only; no actual production metric"
});
function payload(){
 let counter=0;
 const criteria=Object.entries(rubric.dimensions).flatMap(([dimension,info])=>
 info.criteria.map(c=>({id:c.id,dimension,earned:c.max===1?0:Math.min(1,c.max),evidence:[proof(++counter,requiredProofKindsForCriterion(c.id)[0])]})));
 return {schema:SCHEMA,actor:"fixture-reviewer-NOT-PRODUCTION",
  nonce:"fixture-unique-nonce",issuedAt,expiresAt,source:{...source},
  criteria,gates:gateProfile.gates.map(g=>({id:g.id,result:"fail",evidence:[proof(++counter)]}))};
}
function setup(){
 const keys=generateKeyPairSync("ed25519");
 const publicPem=keys.publicKey.export({format:"pem",type:"spki"}).toString();
 const used=new Set();
 const ctx={
  trustedKeys:new Map([["fixture-key",{pem:publicPem,actor:"fixture-reviewer-NOT-PRODUCTION",routes:["/kingdom-index"]}]]),expected:{...source},
  rubric,profile:gateProfile,nowMs:now,
  // For tests only: no external I/O. Real production integration must inspect
  // external artifact bytes, verify digests and independently authenticated provenance.
  verifyArtifact:async()=>true,
  consumeNonce:async(ns,nonce)=>{
   // Replay namespace + nonce cannot be reused with a different payload digest.
   const key=ns+"|"+nonce;
   if(used.has(key))return false;used.add(key);return true;
  }
 };
 const envelope=p=>{
  const bytes=Buffer.from(JSON.stringify(p),"utf8");
  return {schema:SCHEMA,keyId:"fixture-key",payloadBase64:bytes.toString("base64"),
    signatureBase64:sign(null,bytes,keys.privateKey).toString("base64")};
 };
 return {ctx,envelope};
}
test("canonical proof kinds cover all twenty rubric criteria and pin high-risk domains",()=>{
 assert.equal(verifyCriterionProofPolicy(rubric),true);
 assert.equal(Object.keys(CRITERION_PROOF_KINDS).length,20);
 for(const id of ["accessibility","responsive","critical_journeys","state_consistency","browser"])
  assert.deepEqual(requiredProofKindsForCriterion(id),["browser"]);
 for(const id of ["measured_latency","render_efficiency","sustained_load"])
  assert.deepEqual(requiredProofKindsForCriterion(id),["performance"]);
 assert.deepEqual(requiredProofKindsForCriterion("integration"),["database"]);
 assert.deepEqual(requiredProofKindsForCriterion("release_certification"),["production"]);
 const drift=structuredClone(rubric);
 drift.dimensions.tests.criteria[0].id="unrecognized-criterion";
 assert.throws(()=>verifyCriterionProofPolicy(drift),/Proof policy\/rubric drift/);
});
test("source-only receipts cannot earn browser, latency, DB or security points",async()=>{
 const {ctx,envelope}=setup();
 for(const id of ["accessibility","responsive","critical_journeys","browser",
                  "measured_latency","render_efficiency","sustained_load",
                  "integration","security_boundaries","release_certification","authoritative_data"]){
  const p=payload(),row=p.criteria.find(x=>x.id===id);
  // release_certification normally earns zero; make it a credit attempt.
  row.earned=1;
  row.evidence[0].kind="source";
  await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),
   new RegExp("Criterion proof kind insufficient: "+id));
 }
});
test("a zero-point measurement still needs domain evidence; unknown is not a fake measured zero",async()=>{
 const {ctx,envelope}=setup(),p=payload();
 const latency=p.criteria.find(x=>x.id==="measured_latency");
 latency.earned=0;latency.evidence[0].kind="source";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),
  /Criterion proof kind insufficient: measured_latency/);
 latency.evidence[0].kind="performance";
 const out=await inspectSignedCriterionSubmission(envelope(p),ctx);
 assert.equal(out.certified,false);assert.equal(out.current,false);
 assert.equal(out.dimensions.performance,
  p.criteria.filter(row=>row.dimension==="performance").reduce((s,row)=>s+row.earned,0));
});
test("fixture-signed, 20-criterion bundle validates as provisional ONLY",async()=>{
 const {ctx,envelope}=setup(),p=payload();
 const result=await inspectSignedCriterionSubmission(envelope(p),ctx);
 assert.equal(result.status,"VALIDATED_PROVISIONAL_SUBMISSION");
 assert.equal(result.certified,false);assert.equal(result.current,false);
 assert.equal(result.specializedGatesPassed,false);
 assert.equal(result.score,Object.values(result.dimensions).reduce((a,b)=>a+b,0));
 assert.ok(result.score>0&&result.score<100);
 assert.equal(result.gateResults.length,3);
});
test("tamper, forged key, noncanonical signed JSON and schema substitution refuse",async()=>{
 const {ctx,envelope}=setup(),original=envelope(payload());
 await assert.rejects(inspectSignedCriterionSubmission({...original,signatureBase64:Buffer.alloc(64).toString("base64")},ctx),/Signature authentication/);
 await assert.rejects(inspectSignedCriterionSubmission({...original,keyId:"attacker"},ctx),/Untrusted key/);
 const p=payload();p.schema="attacker";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Invalid signed metadata/);
 const text=Buffer.from(original.payloadBase64,"base64").toString("utf8").replace('"nonce":"fixture-unique-nonce"','"nonce":"fixture-unique-nonce","nonce":"evil"');
 const keys=generateKeyPairSync("ed25519");
 const bad={...original,payloadBase64:Buffer.from(text).toString("base64"),
  signatureBase64:sign(null,Buffer.from(text),keys.privateKey).toString("base64"),keyId:"alternative"};
 const alt={...ctx,trustedKeys:new Map([["alternative",{pem:keys.publicKey.export({format:"pem",type:"spki"}).toString(),actor:"fixture-reviewer-NOT-PRODUCTION",routes:["/kingdom-index"]}]])};
 await assert.rejects(inspectSignedCriterionSubmission(bad,alt),/Ambiguous signed JSON/);
});
test("candidate SHA/build substitution and untrusted proof source refuse",async()=>{
 const {ctx,envelope}=setup();
 let p=payload();p.source.gitSha="f".repeat(40);
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/binding|mismatch/);
 p=payload();p.source.buildId="forged-build";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/mismatch/);
 p=payload();p.criteria[0].evidence[0].url="https://attacker.example/evidence";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Invalid proof provenance/);
});
test("unmeasured, overcredited, duplicated, and proof-reusing criteria refuse",async()=>{
 const {ctx,envelope}=setup();let p=payload();p.criteria.pop();
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Every criterion/);
 p=payload();p.criteria[0].earned=99;
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Invalid, missing or duplicate/);
 p=payload();p.criteria[1].id=p.criteria[0].id;
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Invalid, missing or duplicate/);
 p=payload();p.criteria[1].evidence=p.criteria[0].evidence;
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Same proof/);
 p=payload();p.criteria[1].evidence[0].sha256=p.criteria[0].evidence[0].sha256;
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Same proof bytes/);
});
test("specialized gate denial and missing authority refuse; failed gates never certify",async()=>{
 let {ctx,envelope}=setup();const p=payload();
 p.gates.pop();
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Incomplete route-specific gates/);
 ({ctx,envelope}=setup());
 const result=await inspectSignedCriterionSubmission(envelope(payload()),ctx);
 assert.equal(result.certified,false);assert.equal(result.specializedGatesPassed,false);
 ({ctx,envelope}=setup());
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),{...ctx,verifyArtifact:undefined}),/Independent authorities absent/);
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),{...ctx,consumeNonce:undefined}),/Independent authorities absent/);
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),{...ctx,verifyArtifact:async()=>false}),/External evidence/);
});
test("future, expired, key substitution, replayed receipt and nonce store outage refuse",async()=>{
 let {ctx,envelope}=setup();let p=payload();p.expiresAt="2026-10-21T19:59:30.000Z";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Expired\/future/);
 p=payload();p.issuedAt="2026-10-21T20:10:00.000Z";p.expiresAt="2026-10-21T20:20:00.000Z";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/Expired\/future/);
 ({ctx,envelope}=setup());
 const same=envelope(payload());
 await inspectSignedCriterionSubmission(same,ctx);
 await assert.rejects(inspectSignedCriterionSubmission(same,ctx),/Repeated or non-durable/);
 const altered=payload();altered.criteria[0].earned=0;
 await assert.rejects(inspectSignedCriterionSubmission(envelope(altered),ctx),/Repeated or non-durable/);
 ({ctx,envelope}=setup());
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),{...ctx,consumeNonce:async()=>{throw Error("outage")}}),/Repeated or non-durable/);
});

test("enrolled actor identity cannot be self-declared by a valid signature",async()=>{
 const {ctx,envelope}=setup();
 const forged=payload();forged.actor="impersonated-independent-reviewer";
 await assert.rejects(inspectSignedCriterionSubmission(envelope(forged),ctx),/Signed actor does not match enrolled signer/);
});
test("a signer can attest only to independently assigned exact routes",async()=>{
 const {ctx,envelope}=setup();
 ctx.trustedKeys.set("fixture-key",{...ctx.trustedKeys.get("fixture-key"),routes:["/leaderboard"]});
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),ctx),/Signer not authorized for this route/);
 ctx.trustedKeys.set("fixture-key",{...ctx.trustedKeys.get("fixture-key"),routes:["/kingdom-index","/kingdom-index"]});
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),ctx),/Invalid trusted signer enrollment/);
});
test("two key IDs for the same enrolled public key cannot replay the same nonce",async()=>{
 const {ctx,envelope}=setup();
 ctx.trustedKeys.set("aliased-enrollment",ctx.trustedKeys.get("fixture-key"));
 const signed=envelope(payload());
 await inspectSignedCriterionSubmission(signed,ctx);
 await assert.rejects(
  inspectSignedCriterionSubmission({...signed,keyId:"aliased-enrollment"},ctx),
  /Repeated or non-durable nonce/
 );
});
test("validated score and source snapshots are deeply immutable at their exposed boundary",async()=>{
 const {ctx,envelope}=setup();
 const output=await inspectSignedCriterionSubmission(envelope(payload()),ctx);
 assert.ok(Object.isFrozen(output));
 assert.ok(Object.isFrozen(output.source));
 assert.ok(Object.isFrozen(output.dimensions));
 assert.ok(Object.isFrozen(output.gateResults));
 assert.ok(output.gateResults.every(Object.isFrozen));
 const originalRoute=output.source.route;
 ctx.expected.route="/tampered-after-verification";
 assert.equal(output.source.route,originalRoute);
});
test("real persistent nonce store integrates with signed verification; proof rejection does not consume",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"aoe2war-criterion-integrated-"));
 const store=join(directory,"ledger");
 try {
  await mkdir(store,{mode:0o700});
  const {ctx,envelope}=setup();
  ctx.consumeNonce=createDurableCriterionNonceConsumer(store);
  const signed=envelope(payload());
  await assert.rejects(inspectSignedCriterionSubmission(signed,{...ctx,verifyArtifact:async()=>false}),/External evidence/);
  assert.deepEqual(await readdir(store),[]);
  const first=await inspectSignedCriterionSubmission(signed,ctx);
  assert.equal(first.certified,false);
  assert.ok(first.score>0&&first.score<100);
  const freshCallback=createDurableCriterionNonceConsumer(store);
  await assert.rejects(inspectSignedCriterionSubmission(signed,{...ctx,consumeNonce:freshCallback}),/Repeated or non-durable nonce/);
  const changed=payload();changed.criteria[0].earned=0;
  await assert.rejects(inspectSignedCriterionSubmission(envelope(changed),{...ctx,consumeNonce:freshCallback}),/Repeated or non-durable nonce/);
  assert.equal((await readdir(store)).length,1);
 } finally {await rm(directory,{recursive:true,force:true});}
});
test("async evidence observer cannot rewrite authenticated reviewer or pinned build source",async()=>{
 const {ctx,envelope}=setup();
 const signed=envelope(payload()),actor=ctx.trustedKeys.get("fixture-key").actor;
 const expectedRoute=ctx.expected.route;
 ctx.verifyArtifact=async()=>{
  // Deliberate late mutation of two externally supplied trusted objects.
  ctx.expected.route="/forged-route-after-check";
  ctx.trustedKeys.get("fixture-key").actor="forged-actor-after-check";
  return true;
 };
 const result=await inspectSignedCriterionSubmission(signed,ctx);
 assert.equal(result.source.route,expectedRoute);
 assert.equal(result.actor,actor);
 assert.ok(Object.isFrozen(result.source));
 assert.equal(result.certified,false);
});
function performanceFixture(id){
 const samples=Array.from({length:20},(_,i)=>
  id==="measured_latency"?{coldMs:120+i*10,warmMs:70+i*5}
  :id==="bounded_data"?{queryMs:15+i,rowsScanned:120+i,responseBytes:500+i}
  :id==="render_efficiency"?{rerenders:i,heapBytes:20000+i*100,jsBytes:2500+i*10}
  :id==="sustained_load"?{requestCount:10,errorCount:i===19?1:0,latencyMs:40+i,cpuPct:25+i}
  :(()=>{throw Error("Unknown fixture performance criterion: "+id);})()
 );
 return Buffer.from(JSON.stringify({
  schema:PERFORMANCE_SCHEMA,source:{...source},criterionId:id,measuredAt:issuedAt,
  environment:{device:"synthetic",network:"synthetic",region:"synthetic",runId:"fixture-only",concurrency:id==="sustained_load"?4:1},
  samples,summary:summarizePerformanceSamples(id,samples)
 }));
}
test("signed criteria integrate with separately approved on-disk proof bytes, without any public score",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"aoe2war-proof-signed-integration-"));
 const root=join(dir,"approved-artifacts");
 try {
  await mkdir(root,{mode:0o700});
  const {ctx,envelope}=setup(),p=payload();
  const assignment=[...p.criteria.map(row=>({proof:row.evidence[0],criterionId:row.id})),
    ...p.gates.map(row=>({proof:row.evidence[0],gateId:row.id}))];
  for(const [i,{proof:ref,criterionId}] of assignment.entries()){
   const bytes=ref.kind==="performance"?performanceFixture(criterionId):
    Buffer.from("untrusted-fixture-proof-"+(i+1));
   ref.sha256=createHash("sha256").update(bytes).digest("hex");
   await writeFile(join(root,ref.sha256+".proof"),bytes,{mode:0o600});
  }
  const refs=assignment.map(row=>row.proof);
  const approvalKey=generateKeyPairSync("ed25519");
  const manifest={schema:ARTIFACT_MANIFEST_SCHEMA,issuedAt,expiresAt,source:{...source},proofs:refs};
  const body=Buffer.from(JSON.stringify(manifest));
  const signedManifest={schema:ARTIFACT_MANIFEST_SCHEMA,manifestBase64:body.toString("base64"),
   signatureBase64:sign(null,body,approvalKey.privateKey).toString("base64")};
  ctx.verifyArtifact=createApprovedCriterionArtifactVerifier({
   root,operatorPublicKeyPem:approvalKey.publicKey.export({format:"pem",type:"spki"}).toString(),
   envelope:signedManifest,nowMs:now,
  });
  const valid=await inspectSignedCriterionSubmission(envelope(p),ctx);
  assert.equal(valid.certified,false);
  assert.equal(valid.current,false);
  assert.equal(valid.status,"VALIDATED_PROVISIONAL_SUBMISSION");
  // Authentic signature + valid index do NOT permit a tampered proof body.
  await writeFile(join(root,refs[0].sha256+".proof"),"tampered",{mode:0o600});
  const tampered=payload();tampered.nonce="new-nonce-different-from-valid";
  await assert.rejects(inspectSignedCriterionSubmission(envelope(tampered),ctx),/External evidence bytes/);
 } finally {await rm(dir,{force:true,recursive:true});}
});
test("signed payload stays deeply immutable and nonce authority cannot be swapped during awaited proof validation",async()=>{
 const {ctx,envelope}=setup();
 const signed=envelope(payload());
 let examined=0;
 // Independently enrolled nonce storage is broken/unavailable.
 ctx.consumeNonce=async()=>false;
 ctx.verifyArtifact=async(_proof,signedPayload,assignment)=>{
  examined++;
  assert.ok(Object.isFrozen(signedPayload));
  assert.ok(Object.isFrozen(signedPayload.criteria));
  assert.ok(Object.isFrozen(signedPayload.criteria[0]));
  assert.ok(Object.isFrozen(signedPayload.criteria[0].evidence));
  assert.ok(Object.isFrozen(signedPayload.criteria[0].evidence[0]));
  assert.ok(Object.isFrozen(assignment));
  assert.throws(()=>{signedPayload.criteria[0].earned=100;},TypeError);
  assert.throws(()=>{signedPayload.criteria[0].evidence[0].kind="source";},TypeError);
  ctx.consumeNonce=async()=>true; // malicious replacement must not be used
  ctx.nowMs=0; // temporal authority is also fixed at entry
  return true;
 };
 await assert.rejects(inspectSignedCriterionSubmission(signed,ctx),/Repeated or non-durable nonce/);
 assert.ok(examined>1);
});
test("provisional receipt refuses a claimed 100 even when fixture proofs all return true",async()=>{
 const {ctx,envelope}=setup();const p=payload();
 for(const row of p.criteria){
  row.earned=rubric.dimensions[row.dimension].criteria.find(c=>c.id===row.id).max;
 }
 await assert.rejects(inspectSignedCriterionSubmission(envelope(p),ctx),/100 requires independent production\/browser certification/);
});
test("rubric mutation cannot silently change denominator",async()=>{
 const {ctx,envelope}=setup();const changed=JSON.parse(JSON.stringify(rubric));changed.dimensions.correctness.criteria[0].max=100;
 await assert.rejects(inspectSignedCriterionSubmission(envelope(payload()),{...ctx,rubric:changed}),/Dimension weight mismatch/);
});
test("authenticated-claim utility is not an Index score authority",()=>{
 const source=requireSource("../lib/kingdomIndex.ts"),status=requireSource("../lib/kingdomIndexAuditStatus.ts");
 assert.doesNotMatch(source,/kingdomIndexCriterionSubmission/);
 assert.match(status,/return null;/);
});
function requireSource(file){return (awaitReadFile(file));}
function awaitReadFile(file){
 // Explicit source-only static check; do not import Next.js server modules.
 return readFileSync(new URL(file,import.meta.url),"utf8");
}
