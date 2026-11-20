import test from "node:test";
import assert from "node:assert/strict";
import {register} from "node:module";
import {mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

// Test-only hook intercepts only the adminSession module. Production never
// reads synthetic role headers or this fixture; no real credentials are used.
register("./ember-route-loader.mjs",import.meta.url);
register("./storage-owner-admin-test-loader.mjs",import.meta.url);
const {GET,POST}=await import("../app/api/admin/storage-os/teaching/route.ts");
const {NextRequest}=await import("next/server");
const URL="http://localhost:3000/api/admin/storage-os/teaching";
const ROLE="x-storage-fixture-role";
function request(role:string,method="GET",body?:object){
  return new NextRequest(URL,{
    method,
    headers:{[ROLE]:role,...(method==="POST"?{"Content-Type":"application/json",
      Origin:"http://localhost:3000","sec-fetch-site":"same-origin"}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}
const keys=["AOE2WAR_STORAGE_TEACHING_OWNER_UID",
  "AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY",
  "AOE2WAR_STORAGE_VISUAL_HMAC_KEY","AOE2WAR_OS_STORE_DIR"] as const;
test("private teaching GET and POST admit only enrolled owner, not a second admin",async()=>{
  const dir=mkdtempSync(path.join(tmpdir(),"storage-teaching-owner-route-"));
  mkdirSync(path.join(dir,"state"),{mode:0o700});
  const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    Object.assign(process.env,{
      AOE2WAR_STORAGE_TEACHING_OWNER_UID:"fixture-owner",
      AOE2WAR_STORAGE_OWNER_TEACHING_HMAC_KEY:"a".repeat(64),
      AOE2WAR_STORAGE_VISUAL_HMAC_KEY:"b".repeat(64),
      AOE2WAR_OS_STORE_DIR:dir,
    });
    for(const [role,expected] of [
      ["other-admin",403],["scribe",403],["guest",401],["stale-session",401]
    ] as const){
      const get=await GET(request(role));assert.equal(get.status,expected,role+" GET");
      const post=await POST(request(role,"POST",{}));
      assert.equal(post.status,expected,role+" POST");
      assert.equal(get.headers.get("cache-control")?.includes("no-store")??role!=="other-admin",true);
    }
    const owner=await GET(request("owner"));
    assert.equal(owner.status,200);
    const v=await owner.json();
    assert.equal(v.schema,"aoe2war.storage-teaching-history.v1");
    assert.deepEqual(v.events,[]);
    assert.equal(v.mayRecord,true);
    assert.match(v.ownerBinding,/^[a-f0-9]{64}$/);
    assert.equal(v.authority,"OWNER_FEEDBACK_ONLY_NO_DELETE");
    const bad=await POST(request("owner","POST",{}));
    assert.equal(bad.status,400,"owner still cannot submit malformed/source-free teaching");
    // Fail closed before reading any owner history if no owner UID is enrolled.
    delete process.env.AOE2WAR_STORAGE_TEACHING_OWNER_UID;
    const ownerWithoutEnrollment=await GET(request("owner"));
    assert.equal(ownerWithoutEnrollment.status,503);
    assert.equal((await ownerWithoutEnrollment.json()).detail,"TEACHING_OWNER_NOT_ENROLLED");
  }finally{
    for(const k of keys) {
      if(old[k]===undefined)delete process.env[k];
      else process.env[k]=old[k];
    }
    rmSync(dir,{recursive:true,force:true});
  }
});
