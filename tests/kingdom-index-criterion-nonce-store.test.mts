import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, stat, chmod, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDurableCriterionNonceConsumer } from "../lib/kingdomIndexCriterionNonceStore.mjs";

const sha = text => createHash("sha256").update(text).digest("hex");
async function withLedger(fn) {
  const temp = await mkdtemp(join(tmpdir(), "aoe2war-nonce-fixture-"));
  const root = join(temp, "ledger");
  await mkdir(root,{mode:0o700});
  try { await fn({temp,root,consume:createDurableCriterionNonceConsumer(root)}); }
  finally { await rm(temp,{recursive:true,force:true}); }
}

test("atomically persists once and refuses replay after callback reconstruction",async()=>{
 await withLedger(async({root,consume})=>{
  const digest=sha("synthetic-test-submission");
  assert.equal(await consume("signer:git:build","nonce A",digest),true);
  const recreated=createDurableCriterionNonceConsumer(root);
  assert.equal(await recreated("signer:git:build","nonce A",digest),false);
  assert.equal(await recreated("signer:git:build","nonce A",sha("altered-signed-payload")),false);
  const files=await readdir(root);
  assert.equal(files.length,1);
  assert.match(files[0],/^[a-f0-9]{64}\.nonce$/);
  assert.equal((await stat(join(root,files[0]))).mode&0o777,0o600);
  const receipt=JSON.parse(await readFile(join(root,files[0]),"utf8"));
  assert.equal(receipt.payloadSha256,digest);
  assert.equal(receipt.kind,"aoe2war-criterion-nonce-consumption");
  assert.equal(await recreated("signer:git:next-build","nonce A",digest),true);
  assert.equal(await recreated("other-signer:git:build","nonce A",digest),true);
 });
});
test("simultaneous attempts for the same nonce accept exactly one",async()=>{
 await withLedger(async({root})=>{
  const callers=Array.from({length:24},()=>createDurableCriterionNonceConsumer(root));
  const outcomes=await Promise.all(callers.map(fn=>fn("key:git:build","collision",sha("digest"))));
  assert.equal(outcomes.filter(Boolean).length,1);
  assert.equal(outcomes.filter(x=>x===false).length,23);
  assert.equal((await readdir(root)).length,1);
 });
});
test("hostile nonce strings cannot cause traversal or basename collisions",async()=>{
 await withLedger(async({root,consume})=>{
  const malicious="../foo/\\..\n\0end";
  assert.equal(await consume("namespace",malicious,sha("payload")),true);
  assert.equal(await consume("namespace",malicious,sha("payload")),false);
  assert.equal(await consume("namespace",malicious+"x",sha("payload")),true);
  assert.equal((await readdir(root)).length,2);
  assert.ok((await readdir(root)).every(name=>/^[a-f0-9]{64}\.nonce$/.test(name)));
 });
});
test("missing, symlinked, or group-readable ledger directories refuse",async()=>{
 const temp=await mkdtemp(join(tmpdir(),"aoe2war-nonce-negative-"));
 try {
  const root=join(temp,"ledger");
  const cb=createDurableCriterionNonceConsumer(root);
  await assert.rejects(cb("ns","nonce",sha("digest")),/ENOENT/);
  await mkdir(root,{mode:0o700});
  await chmod(root,0o770);
  await assert.rejects(cb("ns","nonce",sha("digest")),/process-owned and private/);
  await chmod(root,0o700);
  const alias=join(temp,"ledger-link");
  await symlink(root,alias);
  await assert.rejects(createDurableCriterionNonceConsumer(alias)("ns","nonce",sha("digest")),/ELOOP|ENOTDIR/);
 } finally {await rm(temp,{recursive:true,force:true});}
});
test("invalid inputs and malformed digests refuse without consumption",async()=>{
 assert.throws(()=>createDurableCriterionNonceConsumer("relative/path"),/Root must be/);
 await withLedger(async({root,consume})=>{
  await assert.rejects(consume("","nonce",sha("digest")),/Invalid namespace/);
  await assert.rejects(consume("namespace","",sha("digest")),/Invalid namespace/);
  await assert.rejects(consume("namespace","nonce","not a digest"),/Invalid namespace/);
  assert.deepEqual(await readdir(root),[]);
 });
});
