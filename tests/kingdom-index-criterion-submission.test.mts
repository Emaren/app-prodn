import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import rubric from "../config/kingdom-index-quality-rubric.json" with { type:"json" };
import assurances from "../config/kingdom-index-assurance-profiles.json" with { type:"json" };
import { SCHEMA, inspectSignedCriterionSubmission } from "../lib/kingdomIndexCriterionSubmission.mjs";

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
 info.criteria.map(c=>({id:c.id,dimension,earned:c.max===1?0:Math.min(1,c.max),evidence:[proof(++counter)]})));
 return {schema:SCHEMA,actor:"fixture-reviewer-NOT-PRODUCTION",
  nonce:"fixture-unique-nonce",issuedAt,expiresAt,source:{...source},
  criteria,gates:gateProfile.gates.map(g=>({id:g.id,result:"fail",evidence:[proof(++counter)]}))};
}
function setup(){
 const keys=generateKeyPairSync("ed25519");
 const publicPem=keys.publicKey.export({format:"pem",type:"spki"}).toString();
 const used=new Set();
 const ctx={
  trustedKeys:new Map([["fixture-key",publicPem]]),expected:source,
  rubric,profile:gateProfile,nowMs:now,
  // For tests only: no external I/O. Real production integration must inspect
  // external artifact bytes, verify digests and independently authenticated provenance.
  verifyArtifact:async()=>true,
  consumeNonce:async(ns,nonce,digest)=>{
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
 const alt={...ctx,trustedKeys:new Map([["alternative",keys.publicKey.export({format:"pem",type:"spki"}).toString()]])};
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
 let {ctx,envelope}=setup();let p=payload();
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
