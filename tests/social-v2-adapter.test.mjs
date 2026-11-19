import test from "node:test";
import assert from "node:assert/strict";
import { executeSocialTextWrite } from "../lib/socialWriterCore.mjs";

const signed = "S".repeat(64);
function fixture({decision,verify="u_scribe",error=null}={}) {
  const queries = [];
  let releases=0, opened=0;
  const client={
    async query(sql,values) {
      queries.push({sql,values});
      if (sql.startsWith("SELECT aoe2war_social_hd_v2.")) {
        if(error)throw error;
        return {rows:[{decision}]};
      }
      return {rows:[]};
    },
    release(){releases++}
  };
  const pool={async connect(){opened++;return client;}};
  const verifySession=async token=>{
    if(token!==signed||!verify)throw Error("BAD_SIGNATURE");
    return verify;
  };
  const run=(scope,input,token=signed)=>executeSocialTextWrite({
    pool,verifySession,sessionToken:token,scope,input});
  return {run,queries,stats:()=>({opened,releases})};
}
const clan={slug:"aoe2war",message:"Hello, hall",audience:"clan"};
const direct={targetUid:"u_emaren",body:"Hello, officer",replyToMessageId:null};
const clanOk={status:201,body:{ok:true,messageId:41,clanSlug:"aoe2war"}};
const directOk={status:201,body:{ok:true,messageId:55,targetUid:"u_emaren"}};

test("signed UID is the only source of actor identity for fixed Clan high-level call",async()=>{
  const f=fixture({decision:clanOk});
  assert.deepEqual(await f.run("clan",clan),clanOk);
  const q=f.queries.find(x=>x.sql.includes("clan_text"));
  assert.equal(q.sql,"SELECT aoe2war_social_hd_v2.clan_text($1::text,$2::text,$3::text,$4::text) AS decision");
  assert.deepEqual(q.values,["u_scribe","aoe2war","Hello, hall","clan"]);
  assert.ok(f.queries.some(x=>x.sql==="COMMIT"));
  assert.equal(f.stats().releases,1);
  assert.equal(f.queries.filter(x=>x.sql.startsWith("SELECT aoe2war_social_hd_v2.")).length,1);
});
test("Direct uses only high-level function and verified sender, never global history",async()=>{
  const f=fixture({decision:directOk,verify:"u_bob"});
  assert.deepEqual(await f.run("direct",direct),directOk);
  const q=f.queries.find(x=>x.sql.includes("direct_text"));
  assert.equal(q.sql,"SELECT aoe2war_social_hd_v2.direct_text($1::text,$2::text,$3::text,$4::integer) AS decision");
  assert.deepEqual(q.values,["u_bob","u_emaren","Hello, officer",null]);
  assert.ok(f.queries.every(x=>!/\bFROM\s+(?:public|aoe2war_social_hd_v2)\.(?:direct_messages|v_direct_messages)/i.test(x.sql)));
});
test("forged author/sender/conversation or extra payload refused BEFORE database connect",async()=>{
  const f=fixture({decision:clanOk});
  for(const [scope,input] of [
    ["clan",{...clan,authorUserId:2}],
    ["clan",{...clan,audience:"root"}],
    ["direct",{...direct,senderUserId:5}],
    ["direct",{...direct,conversationId:24}],
    ["direct",{...direct,body:"X".repeat(1001)}],
    ["direct",{...direct,targetUid:"../secret"}],
  ])assert.equal((await f.run(scope,input)).status,400);
  assert.deepEqual(f.stats(),{opened:0,releases:0});
});
test("anonymous and invalid signatures cannot touch SQL",async()=>{
  const f=fixture({decision:clanOk});
  assert.equal((await f.run("clan",clan,"")).status,401);
  assert.equal((await f.run("direct",direct,"X".repeat(64))).status,401);
  assert.equal(f.stats().opened,0);
});
test("database business denial rolls back and never commits unauthorized changes",async()=>{
  for(const [scope,input,response] of [
    ["clan",clan,{status:403,body:{detail:"CLAN_MEMBERSHIP_REQUIRED"}}],
    ["direct",direct,{status:404,body:{detail:"DIRECT_RECIPIENT_NOT_FOUND"}}],
    ["direct",direct,{status:429,body:{detail:"DIRECT_SEND_COOLDOWN"}}],
  ]) {
    const f=fixture({decision:response});
    assert.deepEqual(await f.run(scope,input),response);
    assert.ok(f.queries.some(x=>x.sql==="ROLLBACK"));
    assert.ok(!f.queries.some(x=>x.sql==="COMMIT"));
  }
});
test("malformed DB response and SQL errors fail closed, release resources",async()=>{
  const bad=fixture({decision:{status:201,body:{ok:true,messageId:0,clanSlug:"aoe2war"}}});
  assert.equal((await bad.run("clan",clan)).status,503);
  assert.ok(bad.queries.some(x=>x.sql==="ROLLBACK"));
  assert.equal(bad.stats().releases,1);
  const failure=fixture({error:{code:"42501"}});
  assert.equal((await failure.run("direct",direct)).status,503);
  assert.ok(failure.queries.some(x=>x.sql==="ROLLBACK"));
  assert.equal(failure.stats().releases,1);
});
