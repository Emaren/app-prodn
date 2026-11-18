import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { executeSocialTextWrite } from "../lib/socialWriterCore.mjs";

const enabled = Boolean(process.env.SOCIAL_TEST_PGHOST);
const scope = enabled ? {host:process.env.SOCIAL_TEST_PGHOST,database:"aoe2hd_db",
  user:"aoe2war_social_writer",max:2} : null;
const t = (name, fn) => test(name,{skip:!enabled},fn);
const TOKEN = Object.freeze({
  alice:"A".repeat(64),bob:"B".repeat(64),outsider:"C".repeat(64),
  admin:"D".repeat(64),system:"S".repeat(64),
});
const verify = async token => {
  if (token === TOKEN.alice) return "u_alice";
  if (token === TOKEN.bob) return "u_bob";
  if (token === TOKEN.outsider) return "u_outsider";
  if (token === TOKEN.admin) return "u_admin";
  if (token === TOKEN.system) return "u_system";
  throw new Error("SIGNED_SESSION_INVALID");
};
const CLAN_BODY = "Synthetic Clan Hall PG proof " + process.pid;
const DIRECT_BODY = "Synthetic direct PG proof " + process.pid;
const FOREIGN_BODY = "Foreign thread " + process.pid;
const P = scope ? new pg.Pool(scope) : null;
const AUDITOR = scope ? new pg.Pool({...scope,user:"aoe_product_runner"}) : null;
const submit = (sessionToken, type, input) => executeSocialTextWrite({
  pool:P,sessionToken,scope:type,input,verifySession:verify,
  onError:(code)=>console.error("ISOLATED_SOCIAL_PG_SQLSTATE",code),
});
const q = async(sql,values=[]) => (await AUDITOR.query(sql,values)).rows;
t("normal Clan Hall text persists with authenticated original author",async()=>{
  const out = await submit(TOKEN.alice,"clan",{slug:"aoe2war",message:CLAN_BODY,audience:"public"});
  assert.equal(out.status,201,JSON.stringify(out));
  const row = (await q("SELECT m.id,m.body,m.audience,u.uid FROM public.clan_messages m JOIN public.users u ON u.id=m.author_user_id WHERE m.id=$1",[out.body.messageId]))[0];
  assert.deepEqual({body:row.body,audience:row.audience,uid:row.uid},
    {body:CLAN_BODY,audience:"public",uid:"u_alice"});
  const replay = await submit(TOKEN.alice,"clan",{slug:"aoe2war",message:CLAN_BODY,audience:"public"});
  assert.equal(replay.status,201);
  assert.equal(replay.body.messageId,out.body.messageId);
  assert.equal(replay.body.replayed,true);
});
t("nonmember denied private audience and wider-than-policy messages",async()=>{
  const nonmember = await submit(TOKEN.outsider,"clan",{slug:"aoe2war",message:"Not allowed",audience:"clan"});
  assert.equal(nonmember.status,403);
  const tooWide = await submit(TOKEN.outsider,"clan",{slug:"private-hall",message:"Not allowed",audience:"public"});
  assert.equal(tooWide.status,403);
  const absent = await submit(TOKEN.alice,"clan",{slug:"nonexistent",message:"Not allowed",audience:"public"});
  assert.equal(absent.status,404);
});
t("direct pair transaction commits conversation, both participants, sender and message",async()=>{
  const out = await submit(TOKEN.alice,"direct",{targetUid:"u_bob",body:DIRECT_BODY,replyToMessageId:null});
  assert.equal(out.status,201,JSON.stringify(out));
  const [row] = await q(
    "SELECT m.id,m.body,m.conversation_id,c.pair_key,u.uid FROM public.direct_messages m JOIN public.direct_conversations c ON c.id=m.conversation_id JOIN public.users u ON u.id=m.sender_user_id WHERE m.id=$1",
    [out.body.messageId]);
  assert.deepEqual({body:row.body,uid:row.uid},{body:DIRECT_BODY,uid:"u_alice"});
  const ps=await q("SELECT u.uid FROM public.direct_conversation_participants p JOIN public.users u ON u.id=p.user_id WHERE p.conversation_id=$1 ORDER BY u.uid",[row.conversation_id]);
  assert.deepEqual(ps.map(p=>p.uid),["u_alice","u_bob"]);
  assert.equal(out.body.targetUid,"u_bob");
  const replay = await submit(TOKEN.alice,"direct",{targetUid:"u_bob",body:DIRECT_BODY,replyToMessageId:null});
  assert.equal(replay.status,201);
  assert.equal(replay.body.messageId,out.body.messageId);
  assert.equal(replay.body.replayed,true);
  const throttle = await submit(TOKEN.alice,"direct",{targetUid:"u_bob",body:"Different rapid message",replyToMessageId:null});
  assert.equal(throttle.status,429);
});
t("recipient, self, system and foreign reply impersonation are rejected",async()=>{
  const system=await submit(TOKEN.alice,"direct",{targetUid:"u_system",body:"Nope"});
  assert.equal(system.status,403);
  const reserved = await submit(TOKEN.alice,"direct",{targetUid:"aoe2hd_ai_concierge",body:"No synthetic AI thread"});
  assert.equal(reserved.status,403);
  const self=await submit(TOKEN.alice,"direct",{targetUid:"u_alice",body:"Nope"});
  assert.equal(self.status,400);
  const fakeAuthor=await submit(TOKEN.alice,"direct",{targetUid:"u_bob",body:"Nope",senderUid:"u_admin"});
  assert.equal(fakeAuthor.status,400);
  const prior = await submit(TOKEN.admin,"direct",{targetUid:"u_outsider",body:FOREIGN_BODY});
  assert.equal(prior.status,201);
  const foreign=await submit(TOKEN.alice,"direct",{targetUid:"u_bob",body:"Reply outside",replyToMessageId:prior.body.messageId});
  assert.equal(foreign.status,400);
});
t("unauthenticated, spoofed and unknown operations fail closed",async()=>{
  assert.equal((await submit("", "direct",{targetUid:"u_bob",body:"x"})).status,401);
  assert.equal((await submit("Z".repeat(64),"direct",{targetUid:"u_bob",body:"x"})).status,401);
  assert.equal((await submit(TOKEN.system,"direct",{targetUid:"u_bob",body:"x"})).status,401);
  assert.equal((await submit(TOKEN.alice,"direct",{targetUid:"u_bob",body:"x",sql:"drop"})).status,400);
  assert.equal((await submit(TOKEN.alice,"unsupported",{body:"x"})).status,404);
  assert.equal((await submit(TOKEN.alice,"clan",{slug:"aoe2war",message:"bad",audience:"clan",userId:5})).status,400);
});
t("dedicated social writer and public web roles cannot modify finance",async()=>{
  await assert.rejects(
    P.query("INSERT INTO public.financial_test_escrow(amount) VALUES (999)"),
    e=>e.code==="42501");
  const web = new pg.Pool({host:process.env.SOCIAL_TEST_PGHOST,database:"aoe2hd_db",user:"aoe2war_web_prod"});
  try{
    await assert.rejects(web.query("INSERT INTO public.direct_messages(conversation_id,sender_user_id,body) VALUES (1,1,'x')"),e=>e.code==="42501");
    await assert.rejects(web.query("SELECT body FROM public.direct_messages"),e=>e.code==="42501");
  } finally {await web.end();}
});
t("reader-model truth remains consistent across direct targets",async()=>{
  const rows=await q("SELECT c.pair_key,u.uid,m.body FROM public.direct_messages m JOIN public.direct_conversations c ON c.id=m.conversation_id JOIN public.users u ON u.id=m.sender_user_id WHERE m.body IN ($1,$2) ORDER BY m.id",[DIRECT_BODY,FOREIGN_BODY]);
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(r=>r.uid),["u_alice","u_admin"]);
});
test.after(async()=>{if(P)await P.end();if(AUDITOR)await AUDITOR.end();});
