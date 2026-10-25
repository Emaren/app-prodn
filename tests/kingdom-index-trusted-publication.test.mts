import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import rubric from "../config/kingdom-index-quality-rubric.json" with {type:"json"};
import profiles from "../config/kingdom-index-assurance-profiles.json" with {type:"json"};
import { requiredProofKindsForCriterion } from "../lib/kingdomIndexCriterionProofPolicy.mjs";
import { PUBLICATION_SCHEMA, verifyKingdomIndexPublication } from "../lib/kingdomIndexTrustedPublication.mjs";
import { loadCurrentKingdomIndexTrustedPublication } from "../lib/kingdomIndexTrustedPublicationRead.mjs";

const SHA=(value:string)=>createHash("sha256").update(value).digest("hex");
const NOW=Date.parse("2026-10-22T19:00:00.000Z");
const source={
  route:"/kingdom-index",template:"app/kingdom-index/page.tsx",
  gitSha:"1".repeat(40),closureSha256:"2".repeat(64),
  buildId:"exact-next-build-123",releaseSha256:"3".repeat(64),
  assetsSha256:"4".repeat(64),
};
const keys=[generateKeyPairSync("ed25519"),generateKeyPairSync("ed25519")];
const trust=new Map([
  ["release",{pem:keys[0].publicKey.export({type:"spki",format:"pem"}),role:"release",
    route:"/kingdom-index",notBefore:new Date(NOW-86400000).toISOString(),notAfter:new Date(NOW+86400000).toISOString()}],
  ["reviewer",{pem:keys[1].publicKey.export({type:"spki",format:"pem"}),role:"reviewer",
    route:"/kingdom-index",notBefore:new Date(NOW-86400000).toISOString(),notAfter:new Date(NOW+86400000).toISOString()}],
]);
function proof(name:string,kind:string){
  return {url:"https://github.com/Emaren/app-prodn/issues/776",sha256:SHA(name),
    kind,measuredAt:new Date(NOW-60000).toISOString(),conditions:"Independently inspected test receipt"};
}
function payload(points=100){
  const criteria=Object.entries(rubric.dimensions).flatMap(([dimension,d])=>
    d.criteria.map((row)=>({id:row.id,dimension,
      earned:row.max-(points===99&&row.id==="authoritative_data"?1:0),
      evidence:[proof("criterion:"+row.id,requiredProofKindsForCriterion(row.id)[0])]})));
  const gates=profiles.profiles.index.gates.map(g=>({
    id:g.id,result:"pass",evidence:[proof("gate:"+g.id,"source")],
  }));
  return {schema:PUBLICATION_SCHEMA,source:{...source},
    nonce:"unique-first-publication-nonce-1",
    // Synthetic proofs were measured at NOW-60s. Sign only afterwards.
    issuedAt:new Date(NOW-30000).toISOString(),
    expiresAt:new Date(NOW+3600000).toISOString(),
    criteria,gates};
}
function seal(data:ReturnType<typeof payload>){
  const bytes=Buffer.from(JSON.stringify(data));
  return {schema:PUBLICATION_SCHEMA,payloadBase64:bytes.toString("base64"),
    signatures:keys.map((key,i)=>({
      keyId:i===0?"release":"reviewer",
      signatureBase64:sign(null,bytes,key.privateKey).toString("base64"),
    }))};
}
function ctx(overrides:Record<string,unknown>={}){
  return {trustedKeys:trust,expected:source,rubric,profile:profiles.profiles.index,
    nowMs:NOW,verifyArtifact:async()=>true,isCommitted:async()=>true,...overrides};
}
test("independent release + reviewer approval and inspected 20/20 + 3/3 may publish exact-build 100",async()=>{
  const v=await verifyKingdomIndexPublication(seal(payload()),ctx());
  assert.equal(v.score,100);assert.equal(v.certified,true);
  assert.equal(v.status,"current");assert.equal(v.criteriaVerified,20);
  assert.equal(v.artifactsVerified,23);assert.equal(v.gates.length,3);
  assert.equal(v.source.buildId,source.buildId);
  // Only the fully verified detached endorsements + raw artifact bytes + nonce
  // authorize individual earned points. Synthetic fixtures grant NO real points.
  assert.equal(v.criteria.length,20);
  assert.equal(v.criteria.reduce((sum,c)=>sum+c.earned,0),100);
  assert.ok(Object.isFrozen(v.criteria));
  assert.ok(v.criteria.every(c=>c.proofDigests.length===1&&c.proofKinds.length===1));
  assert.equal(v.criteria.find(c=>c.id==="authoritative_data")?.earned,10);
});
test("verified 99 is a measured but noncertified provisional score",async()=>{
  const v=await verifyKingdomIndexPublication(seal(payload(99)),ctx());
  assert.equal(v.score,99);assert.equal(v.certified,false);
  assert.equal(v.status,"provisional");
  assert.equal(v.criteria.find(c=>c.id==="authoritative_data")?.earned,9);
  assert.equal(v.criteria.reduce((sum,c)=>sum+c.earned,0),99);
});
test("missing one mandatory gate refuses the entire projection",async()=>{
  const p=payload();p.gates.pop();
  await assert.rejects(verifyKingdomIndexPublication(seal(p),ctx()),/Incomplete canonical evidence/);
});
test("signed all-points but failing specialized gate never certifies",async()=>{
  const p=payload();p.gates[0].result="fail";
  const v=await verifyKingdomIndexPublication(seal(p),ctx());
  assert.equal(v.score,100);assert.equal(v.certified,false);
});
test("missing reviewer, same physical key under two roles and invalid signature refuse",async()=>{
  const good=seal(payload());
  await assert.rejects(verifyKingdomIndexPublication({...good,signatures:good.signatures.slice(0,1)},ctx()),/dual attestation/);
  const duplicateTrust=new Map(trust);
  duplicateTrust.set("reviewer",{...trust.get("reviewer")!,pem:trust.get("release")!.pem});
  const bad=seal(payload());
  bad.signatures[1].signatureBase64=bad.signatures[0].signatureBase64;
  await assert.rejects(verifyKingdomIndexPublication(bad,ctx({trustedKeys:duplicateTrust})),/Shared signer key/);
  good.signatures[1].signatureBase64=good.signatures[0].signatureBase64;
  await assert.rejects(verifyKingdomIndexPublication(good,ctx()),/Invalid detached endorsement signature/);
});
test("changed candidate or asset identity, stale publication and future proof refuse",async()=>{
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({expected:{...source,gitSha:"f".repeat(40)}})),/deployed source/i);
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({expected:{...source,assetsSha256:"0".repeat(64)}})),/asset mismatch/i);
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({nowMs:NOW+86400000})),/freshness window/);
  const p=payload();p.criteria[0].evidence[0].measuredAt=new Date(NOW+86400000).toISOString();
  await assert.rejects(verifyKingdomIndexPublication(seal(p),ctx()),/future raw measurement/);
});
test("no independent artifact bytes or committed ingest receipt means no public score",async()=>{
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({verifyArtifact:async()=>false})),/Unverified raw artifact/);
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({isCommitted:async()=>false})),/durable ingestion receipt/);
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({isCommitted:undefined})),/External read-only authorities/);
});
test("duplicated proof, unapproved category, partial criterion and altered signed bytes refuse",async()=>{
  const a=payload();a.criteria[1].evidence[0].sha256=a.criteria[0].evidence[0].sha256;
  await assert.rejects(verifyKingdomIndexPublication(seal(a),ctx()),/double credit/);
  const b=payload();b.criteria[0].evidence[0].kind="source";
  await assert.rejects(verifyKingdomIndexPublication(seal(b),ctx()),/Insufficient criterion proof kind/);
  const c=payload();c.criteria.pop();
  await assert.rejects(verifyKingdomIndexPublication(seal(c),ctx()),/Incomplete canonical evidence/);
  const d=seal(payload());d.payloadBase64=Buffer.from(d.payloadBase64,"base64").toString("base64").replace(/.$/,"A");
  await assert.rejects(verifyKingdomIndexPublication(d,ctx()));
});

test("public read without independently configured deploy trust returns UNKNOWN, never self-mints",async()=>{
  const result=await loadCurrentKingdomIndexTrustedPublication({
    rubric,profile:profiles.profiles.index,nowMs:NOW,
  });
  assert.equal(result,null);
});

test("altered canonical weights, point ceilings and mandatory gates cannot certify",async()=>{
  const wrong=structuredClone(rubric);
  wrong.dimensions.correctness.criteria[0].max=9;
  wrong.dimensions.correctness.criteria[1].max=9;
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({rubric:wrong})),/Unknown or altered criterion weight/);
  const missing=structuredClone(profiles.profiles.index);
  missing.gates.pop();
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({profile:missing})),/Canonical rubric or three Index assurance gates drifted/);
  const swapped=structuredClone(profiles.profiles.index);
  swapped.gates[0].id="invented-perfect-score";
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({profile:swapped})),/Canonical rubric or three Index assurance gates drifted/);
});

test("issuer authorization interval, exact route and conflicting enrollment refuse",async()=>{
  const exp=new Map(trust);
  exp.set("reviewer",{...trust.get("reviewer")!,notAfter:new Date(NOW-1000).toISOString()});
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({trustedKeys:exp})),/Issuer authority expired/);
  const early=new Map(trust);
  early.set("release",{...trust.get("release")!,notBefore:new Date(NOW+60000).toISOString()});
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({trustedKeys:early})),/Issuer authority expired/);
  const wrong=new Map(trust);
  wrong.set("reviewer",{...trust.get("reviewer")!,route:"/kingdom-tests"});
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({trustedKeys:wrong})),/not enrolled for this exact route/);
  const long=new Map(trust);
  long.set("release",{...trust.get("release")!,notBefore:new Date(NOW-400*86400000).toISOString()});
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({trustedKeys:long})),/Issuer authority expired/);
});
test("publication expires beyond independent reviewer enrollment even if signature valid",async()=>{
  const almostExpired=new Map(trust);
  almostExpired.set("reviewer",{...trust.get("reviewer")!,notAfter:new Date(NOW+10000).toISOString()});
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({trustedKeys:almostExpired})),/Issuer authority expired/);
});
test("signed claim and proof assignment are immutable across asynchronous artifact inspection",async()=>{
  let calls=0;
  const approved=await verifyKingdomIndexPublication(seal(payload()),ctx({
    verifyArtifact:async(proof:{kind:string;sha256:string},info:{source:object},assignment:{earned?:number})=>{
      calls++;
      assert.ok(Object.isFrozen(proof));
      assert.ok(Object.isFrozen(info.source));
      assert.ok(Object.isFrozen(assignment));
      assert.throws(()=>{proof.kind="production";},TypeError);
      assert.throws(()=>{proof.sha256="0".repeat(64);},TypeError);
      assert.throws(()=>{assignment.earned=100;},TypeError);
      return true;
    }
  }));
  assert.equal(calls,23);
  assert.equal(approved.certified,true);
});
test("unexpected enrollment fields cannot silently become issuer authority",async()=>{
  const changed=new Map(trust);
  changed.set("release",{...trust.get("release")!,revokedAt:null});
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({trustedKeys:changed})),/Invalid trust enrollment fields/);
});
test("wrong route or BUILD_ID in independently asserted source refuses grade",async()=>{
  const badRoute={...source,route:"/kingdom-tests"};
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({expected:badRoute})),/Deployed source or asset mismatch/);
  const badBuild={...source,buildId:"another-build"};
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({expected:badBuild})),/Deployed source or asset mismatch/);
});
test("duplicate gate and replay refusal are independent of valid signatures",async()=>{
  const duplicate=payload();
  duplicate.gates[1].id=duplicate.gates[0].id;
  await assert.rejects(verifyKingdomIndexPublication(seal(duplicate),ctx()),/Missing or repeated gate/);
  await assert.rejects(verifyKingdomIndexPublication(seal(payload()),ctx({isCommitted:async()=>false})),/Missing independent durable ingestion receipt/);
});

test("a duly signed publication cannot pre-approve proof collected after its issuance",async()=>{
 const p=payload();
 // Signed publication issued at NOW-120s, but claimed browser evidence appears
 // NOW-1s: already observed at verification time, not available when signed.
 p.criteria.find(c=>c.id==="critical_journeys")!.evidence[0].measuredAt=
   new Date(NOW-1000).toISOString();
 await assert.rejects(
   verifyKingdomIndexPublication(seal(p),ctx()),
   /Measurement postdates signed publication issuance/,
 );
 const gate=payload();
 gate.gates.find(g=>g.id==="source-closure")!.evidence[0].measuredAt=
   new Date(NOW-1000).toISOString();
 await assert.rejects(
   verifyKingdomIndexPublication(seal(gate),ctx()),
   /Measurement postdates signed publication issuance/,
 );
});
