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
  ["release",{pem:keys[0].publicKey.export({type:"spki",format:"pem"}),role:"release"}],
  ["reviewer",{pem:keys[1].publicKey.export({type:"spki",format:"pem"}),role:"reviewer"}],
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
    issuedAt:new Date(NOW-120000).toISOString(),
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
});
test("verified 99 is a measured but noncertified provisional score",async()=>{
  const v=await verifyKingdomIndexPublication(seal(payload(99)),ctx());
  assert.equal(v.score,99);assert.equal(v.certified,false);
  assert.equal(v.status,"provisional");
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
  duplicateTrust.set("reviewer",{pem:trust.get("release")!.pem,role:"reviewer"});
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
