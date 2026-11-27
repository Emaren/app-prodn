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
test("tracked R25 guard retains exact historical text socket boundary",()=>{
  const guard=src("scripts/r25_b_guard_production_v1.cjs");
  assert.match(guard,/nonfinancial-production-v1/);
  assert.match(guard,/const safe = \["GET", "HEAD"\]/);
  assert.match(guard,/response\.writeHead\(405/);
  assert.doesNotMatch(guard,/SOCIAL_WRITER_SOCKET/);
  assert.match(guard,/const SOCIAL_SOCKET = "\/run\/aoe2war-social-writer\/social\.sock";/);
  const paths=guard.match(/const SOCIAL_SERVICE_PATHS = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(paths);
  assert.deepEqual([...paths[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]),["/v1/clan/text","/v1/direct/text","/v1/lobby/text"]);
  assert.match(guard,/SOCIAL_SERVICE_PATHS\.has\(opts\.path\) && opts\.method === "POST"/);
  assert.match(guard,/opts\.timeout === 2300/);
  assert.match(guard,/h\["Content-Length"\] <= 4096/);
  const production=src("scripts/product_boundary_guard.py");
  assert.match(production,/UNREVIEWED_EXECUTABLE_SURFACE/);
});
test("both production POST handlers use session/origin + exact writer, no direct DB sender",()=>{
  const clan=src("app/api/social/clan-text/route.ts");
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
  assert.match(src("components/clans/ClanHallClient.tsx"),/fetch\("\/api\/social\/clan-text"/);
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
