import test from "node:test";
import assert from "node:assert/strict";
import {register} from "node:module";
import {mkdtempSync,mkdirSync,readdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

// Isolated test-only Next alias and synthetic admin gate. Not exported to production.
register("./ember-route-loader.mjs",import.meta.url);
register("./storage-owner-admin-test-loader.mjs",import.meta.url);
const {GET,POST}=await import("../app/api/admin/storage-os/archive-preference/route.ts");
const {NextRequest}=await import("next/server");
const URL="http://localhost:3000/api/admin/storage-os/archive-preference";
const roles=["other-admin","scribe","guest","stale-session"] as const;
const keys=["AOE2WAR_OS_STORE_DIR","AOE2WAR_STORAGE_TEACHING_OWNER_UID",
  "AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY",
  "AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY",
  "AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET",
  "AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED"] as const;
function req(role:string,method="GET",body?:object,origin="http://localhost:3000"){
 return new NextRequest(URL,{method,
  headers:{"x-storage-fixture-role":role,
   ...(method==="POST"?{"Content-Type":"application/json",Origin:origin,
     "sec-fetch-site":origin==="http://localhost:3000"?"same-origin":"cross-site"}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});
}
const complete={
 objectId:"a".repeat(64),fingerprint:"b".repeat(64),sourceDigest:"c".repeat(64),
 observedAt:new Date().toISOString(),choice:"YES",previousChoiceId:null,
};
test("archive YES/NO is owner-only: other admin, Scribe, guest, stale user and cross-origin POST denied",async()=>{
 const tmp=mkdtempSync(path.join(tmpdir(),"we3-archive-role-"));
 mkdirSync(path.join(tmp,"state"),{mode:0o700});
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  process.env.AOE2WAR_OS_STORE_DIR=tmp;
  process.env.AOE2WAR_STORAGE_TEACHING_OWNER_UID="fixture-owner";
  process.env.AOE2WAR_STORAGE_ARCHIVE_PREFERENCE_HMAC_KEY="42".repeat(32);
  process.env.AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY="11".repeat(32);
  delete process.env.AOE2WAR_EXACT_ITEM_CONTRACT_ADMITTED;
  delete process.env.AOE2WAR_STORAGE_OWNER_TIP_WITNESS_SOCKET;
  for(const role of roles){
   const status=role==="other-admin"||role==="scribe"?403:401;
   const get=await GET(req(role));
   const post=await POST(req(role,"POST",complete));
   assert.equal(get.status,status,role+" GET");
   assert.equal(post.status,status,role+" POST");
   if(role==="other-admin")
    assert.ok(get.headers.get("cache-control")?.includes("no-store"));
  }
  assert.equal((await POST(req("owner","POST",complete,"http://evil.example"))).status,403);
  assert.equal((await POST(req("owner","POST",{}))).status,400);
  const validButSourceAbsent=await POST(req("owner","POST",complete));
  assert.equal(validButSourceAbsent.status,409);
  assert.equal((await validButSourceAbsent.json()).detail,"EXACT_OBJECT_SOURCE_NOT_ADMITTED");
  const read=await GET(req("owner"));
  assert.equal(read.status,503,"owner GET never invents independent root tip");
  assert.equal((await read.json()).detail,"ARCHIVE_SIGNED_SOURCE_OR_LEDGER_HOLD");
  assert.deepEqual(readdirSync(path.join(tmp,"state")),[],
   "unauthorized and source-absent requests must not make any owner event directory");
  delete process.env.AOE2WAR_STORAGE_TEACHING_OWNER_UID;
  const notEnrolled=await GET(req("owner"));
  assert.equal(notEnrolled.status,503);
  assert.equal((await notEnrolled.json()).detail,"ARCHIVE_OWNER_NOT_ENROLLED");
 }finally{
  for(const k of keys){
   if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];
  }
  rmSync(tmp,{recursive:true,force:true});
 }
});
