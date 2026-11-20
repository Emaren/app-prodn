import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { executeSocialTextWrite } from "../lib/socialWriterCore.mjs";

const source = (path: string) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const TOKEN = "L".repeat(64);
const KEY = "a".repeat(32);

const call = async (
  input: Record<string, unknown>,
  decision: Record<string, unknown>,
  scope = "lobby",
) => {
  const statements: Array<{ sql: string; params?: unknown[] }> = [];
  let uidValidated = false;
  let releases = 0;
  const pool = {
    connect: async () => ({
      query: async (sql: string, params?: unknown[]) => {
        statements.push({ sql, params });
        if (sql.includes("SELECT aoe2war_lobby_hd_v1.post_text"))
          return { rows: [{ decision }] };
        if (sql.includes("SELECT aoe2war_social_hd_v2"))
          throw new Error("UNEXPECTED_NONLOBBY_SQL");
        return { rows: [] };
      },
      release: () => { releases++; },
    }),
  };
  const output = await executeSocialTextWrite({
    pool,
    verifySession: async (token: string) => {
      assert.equal(token, TOKEN);
      uidValidated = true;
      return "u_authenticated_scribe";
    },
    sessionToken: TOKEN,
    scope,
    input,
  });
  return { output, statements, uidValidated, releases };
};

test("production Lobby has fixed signed socket route, not original broad SQL POST", () => {
  const route = source("app/api/lobby/chat/route.ts");
  const client = source("lib/socialWriterClient.ts");
  const daemon = source("bin/social-writer.mjs");
  const home = source("app/HomePageClient.tsx");
  const core = source("lib/socialWriterCore.mjs");
  assert.match(route, /if \(usesNonfinancialProductionAuth\(\)\)/);
  assert.match(route, /getSessionUid\(request\)/);
  assert.match(route, /validateSocialWriteOrigin\(request\)/);
  assert.match(route, /signedSocialCookie\(request\)/);
  assert.match(route, /readBoundedSocialJson\(request\)/);
  assert.match(route, /callSocialWriter\("lobby", token/);
  assert.ok(route.indexOf('callSocialWriter("lobby", token') <
    route.indexOf("await prisma.chatMessage.create("));
  assert.match(route, /status: 202/);
  assert.match(client, /"clan" \| "direct" \| "lobby"/);
  for (const part of [daemon, client]) assert.match(part, /\/v1\/lobby\/text/);
  assert.match(core, /aoe2war_lobby_hd_v1\.post_text/);
  assert.doesNotMatch(core, /INSERT INTO public\.chat_messages|GRANT ALL|DROP TABLE/);
  assert.match(home, /crypto\.randomUUID\(\)\.replaceAll\("-", ""\)/);
  assert.match(home, /lobbyPendingRequestRef\.current/);
  assert.match(home, /idempotencyKey,/);
});

test("signed actor identity, 32-char key and bounded body reach only the reviewed SQL function", async () => {
  const {output, statements, uidValidated, releases} = await call(
    {message:"Player message", requestKey:KEY},
    {status:201,ok:true,messageId:1234,replayed:false},
  );
  assert.deepEqual(output, {status:201,body:{ok:true,messageId:1234,replayed:false}});
  assert.equal(uidValidated,true);
  assert.equal(releases,1);
  const select=statements.find(x=>x.sql.includes("SELECT aoe2war_lobby_hd_v1.post_text"));
  assert.ok(select);
  assert.deepEqual(select.params, ["u_authenticated_scribe","Player message",KEY]);
  assert.ok(statements.some(x=>x.sql.startsWith("BEGIN ISOLATION LEVEL SERIALIZABLE")));
  assert.ok(statements.some(x=>x.sql==="COMMIT"));
  assert.ok(!statements.some(x=>x.sql==="ROLLBACK"));
});

test("DB-reported idempotent retry retains the identical numeric ID in isolated mock only", async () => {
  const a=await call({message:"Repeated same logical send",requestKey:KEY},
    {status:201,ok:true,messageId:77,replayed:false});
  const b=await call({message:"Repeated same logical send",requestKey:KEY},
    {status:201,ok:true,messageId:77,replayed:true});
  assert.equal(a.output.body.messageId,b.output.body.messageId);
  assert.equal(b.output.body.replayed,true);
});

test("denial and conflicting idempotency keys cannot commit a row", async () => {
  for(const status of [400,401,403,404,409,429,503]) {
    const r=await call({message:"Acceptable",requestKey:KEY},
      {status,detail:"LOBBY_POLICY_DENIED"});
    assert.equal(r.output.status,status);
    assert.ok(r.statements.some(s=>s.sql==="ROLLBACK"));
    assert.ok(!r.statements.some(s=>s.sql==="COMMIT"));
  }
});

test("untrusted source payload and oversized requests denied BEFORE opening a DB", async () => {
  const neverDb={connect:async()=>{throw new Error("DB_MUST_NOT_OPEN");}};
  const invoke=(input:Record<string,unknown>,scope="lobby") =>
    executeSocialTextWrite({pool:neverDb,verifySession:async()=> "u_scribe",
      sessionToken:TOKEN,scope,input});
  const blocked=[
    {message:"text",requestKey:"z".repeat(32)},
    {message:"text",requestKey:KEY,senderUid:"u_admin"},
    {message:"text",requestKey:KEY,sql:"select pg_sleep(9)"},
    {message:"x".repeat(281),requestKey:KEY},
    {message:"text",requestKey:KEY,attachment:"/etc/passwd"},
    {message:"text",requestKey:"a".repeat(31)},
  ];
  for(const input of blocked) assert.equal((await invoke(input)).status,400);
  assert.equal((await invoke({message:"hello",requestKey:KEY},"funding")).status,404);
  const noToken=await executeSocialTextWrite({
    pool:neverDb,verifySession:async()=> "u_scribe",sessionToken:"",
    scope:"lobby",input:{message:"hello",requestKey:KEY},
  });
  assert.equal(noToken.status,401);
});

test("bad or forged SQL reply is rejected, not reported as persisted", async () => {
  for(const decision of [
    {status:201,ok:true,messageId:0,replayed:false},
    {status:201,ok:true,messageId:"77",replayed:false},
    {status:201,ok:true,messageId:77,replayed:false,actorUid:"u_admin"},
    {status:201,ok:true,messageId:77},
    {status:409,detail:"unsafe free text"},
  ]) {
    const result=await call({message:"hello",requestKey:KEY},decision);
    assert.equal(result.output.status,503);
    assert.ok(result.statements.some(s=>s.sql==="ROLLBACK"));
    assert.ok(!result.statements.some(s=>s.sql==="COMMIT"));
  }
});
