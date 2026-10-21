import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, writeFile, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ARTIFACT_MANIFEST_SCHEMA, createApprovedCriterionArtifactVerifier } from "../lib/kingdomIndexCriterionArtifactVerifier.mjs";
const sha=x=>createHash("sha256").update(x).digest("hex");
const issuedAt="2026-10-21T20:00:00.000Z";
const expiresAt="2026-10-21T21:00:00.000Z";
const nowMs=Date.parse("2026-10-21T20:30:00.000Z");
const source={route:"/kingdom-index",template:"app/kingdom-index/page.tsx",
 gitSha:"a".repeat(40),closureSha256:"b".repeat(64),buildId:"fixture-build",
 releaseSha256:"c".repeat(64)};
const proof=bytes=>({url:"https://github.com/Emaren/app-prodn/actions/runs/123",
 sha256:sha(bytes),kind:"ci",measuredAt:issuedAt,
 conditions:"synthetic fixture, NOT independently observed runtime"});
const setup=()=>{
 const keys=generateKeyPairSync("ed25519");
 const pem=keys.publicKey.export({format:"pem",type:"spki"}).toString();
 const target={criterionId:"safe_extension",earned:1};
 const manifest=p=>({schema:ARTIFACT_MANIFEST_SCHEMA,issuedAt,expiresAt,source:{...source},
  proofs:[{proof:p,target:{criterionId:"safe_extension",earned:1}}]});
 const signManifest=obj=>{
  const body=Buffer.from(JSON.stringify(obj));
  return {schema:ARTIFACT_MANIFEST_SCHEMA,manifestBase64:body.toString("base64"),
   signatureBase64:sign(null,body,keys.privateKey).toString("base64")};
 };
 return {keys,pem,manifest,signManifest};
};
async function withArchive(fn){
 const temp=await mkdtemp(join(tmpdir(),"aoe2war-approved-proof-fixture-"));
 const root=join(temp,"private-proofs");
 await mkdir(root,{mode:0o700});
 try{await fn({temp,root});}finally{await rm(temp,{force:true,recursive:true});}
}

test("separately signed operator manifest plus byte-for-byte private artifact can verify",async()=>{
 await withArchive(async({root})=>{
  const b=Buffer.from("synthetic browser result and source SHA, no genuine metrics");
  const p=proof(b),f=join(root,p.sha256+".proof");
  await writeFile(f,b,{mode:0o600});
  const {pem,manifest,signManifest}=setup();
  const verifier=createApprovedCriterionArtifactVerifier({root,operatorPublicKeyPem:pem,
   envelope:signManifest(manifest(p)),nowMs});
  assert.equal(await verifier(p,{source:{...source}},{criterionId:"safe_extension",earned:1}),true);
  assert.equal(await verifier({...p,kind:"production"},{source},{criterionId:"safe_extension",earned:1}),false);
  assert.equal(await verifier(p,{source:{...source,gitSha:"d".repeat(40)}},{criterionId:"safe_extension",earned:1}),false);
  assert.equal(await verifier({...p,url:"https://github.com/Emaren/app-prodn/issues/1"},{source},{criterionId:"safe_extension",earned:1}),false);
  assert.equal(await verifier(p,{source},{criterionId:"safe_extension",earned:2}),false);
  assert.equal(await verifier(p,{source},{criterionId:"business_invariants",earned:1}),false);
  assert.equal(await verifier(p,{source},{gateId:"safe_extension",result:"pass"}),false);
  assert.equal(await verifier(p,{source}),false);
  await writeFile(f,"tampered",{mode:0o600});
  assert.equal(await verifier(p,{source}),false);
 });
});
test("forged signer, malformed canonical JSON and swapped source are refused",()=>{
 const a=setup(),b=setup(),p=proof(Buffer.from("fixture"));
 const signed=a.signManifest(a.manifest(p));
 assert.throws(()=>createApprovedCriterionArtifactVerifier({root:"/nonexistent",operatorPublicKeyPem:b.pem,envelope:signed,nowMs}),/signature failure/);
 const malformed=Buffer.from(JSON.stringify(a.manifest(p)).replace('"source":','"source":{"route":"forged"},"source":'));
 const forged={...signed,manifestBase64:malformed.toString("base64"),signatureBase64:sign(null,malformed,a.keys.privateKey).toString("base64")};
 assert.throws(()=>createApprovedCriterionArtifactVerifier({root:"/nonexistent",operatorPublicKeyPem:a.pem,envelope:forged,nowMs}),/Noncanonical manifest JSON/);
 const substitute=a.manifest(p);substitute.source.buildId="other-build";
 const verify=createApprovedCriterionArtifactVerifier({root:"/nonexistent",operatorPublicKeyPem:a.pem,
  envelope:a.signManifest(substitute),nowMs});
 assert.equal(typeof verify,"function");
});
test("expired, future, duplicate and operator-added untrusted proof refuse",()=>{
 const {pem,manifest,signManifest}=setup(),p=proof(Buffer.from("fixture"));
 let obj=manifest(p);obj.expiresAt="2026-10-21T20:01:00.000Z";
 assert.throws(()=>createApprovedCriterionArtifactVerifier({root:"/unused",operatorPublicKeyPem:pem,envelope:signManifest(obj),nowMs}),/Expired/);
 obj=manifest(p);obj.proofs.push({...obj.proofs[0]});
 assert.throws(()=>createApprovedCriterionArtifactVerifier({root:"/unused",operatorPublicKeyPem:pem,envelope:signManifest(obj),nowMs}),/repeated operator proof/);
 obj=manifest(p);obj.proofs[0].proof.url="https://untrusted.invalid/malware";
 assert.throws(()=>createApprovedCriterionArtifactVerifier({root:"/unused",operatorPublicKeyPem:pem,envelope:signManifest(obj),nowMs}),/Invalid or repeated operator proof/);
});
test("symlinks, insecure proof files, insecure archive and absent blobs refuse",async()=>{
 await withArchive(async({root,temp})=>{
  const b=Buffer.from("archive safety fixture"),p=proof(b),f=join(root,p.sha256+".proof");
  const {pem,manifest,signManifest}=setup();
  const envelope=signManifest(manifest(p));
  const verifyFor=path=>createApprovedCriterionArtifactVerifier({root:path,operatorPublicKeyPem:pem,envelope,nowMs});
  assert.equal(await verifyFor(root)(p,{source},{criterionId:"safe_extension",earned:1}),false);
  await writeFile(f,b,{mode:0o600});
  await chmod(f,0o644);
  assert.equal(await verifyFor(root)(p,{source},{criterionId:"safe_extension",earned:1}),false);
  await chmod(f,0o600);
  assert.equal(await verifyFor(root)(p,{source},{criterionId:"safe_extension",earned:1}),true);
  await chmod(root,0o755);
  assert.equal(await verifyFor(root)(p,{source},{criterionId:"safe_extension",earned:1}),false);
  await chmod(root,0o700);
  await rm(f);
  const elsewhere=join(temp,"untrusted");
  await writeFile(elsewhere,b,{mode:0o600});
  await symlink(elsewhere,f);
  assert.equal(await verifyFor(root)(p,{source},{criterionId:"safe_extension",earned:1}),false);
  const alias=join(temp,"root-link");
  await symlink(root,alias);
  assert.equal(await verifyFor(alias)(p,{source},{criterionId:"safe_extension",earned:1}),false);
 });
});

test("v1 operator manifests and malformed score/gate target approvals refuse",()=>{
 const {pem,manifest,signManifest}=setup(),p=proof(Buffer.from("synthetic"));
 const old=manifest(p);old.schema="aoe2war.kingdom-index.operator-approved-proofs.v1";
 assert.throws(()=>createApprovedCriterionArtifactVerifier({
  root:"/nonexistent",operatorPublicKeyPem:pem,envelope:signManifest(old),nowMs
 }),/Invalid operator manifest metadata/);
 let bad=manifest(p);bad.proofs[0].target={criterionId:"safe_extension"};
 assert.throws(()=>createApprovedCriterionArtifactVerifier({
  root:"/nonexistent",operatorPublicKeyPem:pem,envelope:signManifest(bad),nowMs
 }),/approved criterion target/);
 bad=manifest(p);bad.proofs[0].target={gateId:"score-verification",result:"maybe"};
 assert.throws(()=>createApprovedCriterionArtifactVerifier({
  root:"/nonexistent",operatorPublicKeyPem:pem,envelope:signManifest(bad),nowMs
 }),/Invalid approved specialized gate target/);
});
