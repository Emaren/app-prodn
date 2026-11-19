import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { executeSocialTextWrite } from "../lib/socialWriterCore.mjs";

const src=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const validJWT="X".repeat(64);
const neverDb={connect:()=>{throw new Error("DB_MUST_NOT_BE_OPENED");}};

test("only two fixed social text writer socket endpoints, no public or finance RPC",()=>{
  const daemon=src("bin/social-writer.mjs");
  const client=src("lib/socialWriterClient.ts");
  for(const f of [daemon,client]){
    assert.match(f,/\/run\/aoe2war-social-writer\/social\.sock/);
    assert.match(f,/\/v1\/clan\/text/);
    assert.match(f,/\/v1\/direct\/text/);
    assert.doesNotMatch(f,/809[2345]|\/api\/bets|\/api\/payouts|\/api\/settlement/);
  }
  assert.match(daemon,/aoe2war_social_writer/);
  assert.match(daemon,/aoe2war-social-writer/);
  assert.match(daemon,/verifySocialSignedSession/);
  assert.match(client,/same-origin/);
  assert.match(client,/signedSocialCookie/);
  assert.match(client,/SOCIAL_SEND_STATUS_UNKNOWN_CHECK_HISTORY_BEFORE_RETRY/);
});
test("original R25 guard and PRODUCT guard remain unchanged by P0 source",()=>{
  const guard=src("scripts/r25_b_guard_production_v1.cjs");
  assert.match(guard,/nonfinancial-production-v1/);
  assert.match(guard,/const safe = \["GET", "HEAD"\]/);
  assert.match(guard,/response\.writeHead\(405/);
  assert.doesNotMatch(guard,/SOCIAL_WRITER_SOCKET|\/v1\/clan\/text/);
  const production=src("scripts/product_boundary_guard.py");
  assert.match(production,/UNREVIEWED_EXECUTABLE_SURFACE/);
});
test("both production POST handlers use session/origin + exact writer, no direct DB sender",()=>{
  const clan=src("app/api/clans/[slug]/route.ts");
  const direct=src("app/api/contact-emaren/route.ts");
  for (const s of [clan,direct]) {
    assert.match(s,/usesNonfinancialProductionAuth\(\)/);
    assert.match(s,/getSessionUid\(request\)/);
    assert.match(s,/validateSocialWriteOrigin\(request\)/);
    assert.match(s,/signedSocialCookie\(request\)/);
    assert.match(s,/readBoundedSocialJson\(request\)/);
    assert.match(s,/callSocialWriter\(/);
  }
  assert.match(src("components/contact/ContactEmarenWorkspace.tsx"),/attachment\s*\?\s*\{ method: "POST", body: formData \}/);
});
test("unknown action, oversized, forged creator and media return before any DB connect",async()=>{
  const call=(scope,input)=>executeSocialTextWrite({
    pool:neverDb,verifySession:async()=> "u_alice",
    sessionToken:validJWT,scope,input,
  });
  for(const [scope,input,status] of [
    ["finance",{body:"message"},404],
    ["clan",{slug:"aoe2war",message:"test",audience:"clan",authorUserId:1},400],
    ["clan",{slug:"aoe2war",message:"test",audience:"root"},400],
    ["clan",{slug:"aoe2war",message:"test",audience:"clan",attachments:[]},400],
    ["direct",{targetUid:"u_bob",body:"hello",senderUserId:1},400],
    ["direct",{targetUid:"u_bob",body:"x".repeat(4200)},400],
    ["direct",{targetUid:"u_bob",body:"x".repeat(1001)},400],
    ["direct",{targetUid:"u_bob",body:"x",conversationId:1},400],
  ]) assert.equal((await call(scope,input)).status,status);
});
