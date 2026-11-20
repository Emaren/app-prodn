import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import {executeSocialTextWrite} from "../lib/socialWriterCore.mjs";

/**
 * Only runs inside a fresh, explicitly opted-in UID650 private PG16 fixture
 * with WE1's *exact* HD V2 SQL already installed. No SQL installer or private
 * credential is included in PRODUCT source. Never connect to HEL1/HD/DE.
 */
const enabled = process.env.WE3_SOCIAL_V2_TEST_ONLY === "1"
  && /^\/tmp\/we3-social-v2-/.test(process.env.WE3_SOCIAL_V2_PGHOST ?? "")
  && /^4[0-9]{4}$/.test(process.env.WE3_SOCIAL_V2_PGPORT ?? "");
const host=process.env.WE3_SOCIAL_V2_PGHOST;
const port=Number(process.env.WE3_SOCIAL_V2_PGPORT);
const database="aoe2hd_db";
const adminUser="aoe_product_runner";
const writerRole="aoe2war_social_writer";

test("actual restricted HD V2 functions: two signed users, persistent Clan and Direct, privacy and denial",
  {skip:!enabled},async()=>{
  const db=new pg.Client({host,port,database,user:adminUser});
  const pool=new pg.Pool({host,port,database,user:writerRole,max:2});
  const reader=new pg.Client({host,port,database,user:writerRole});
  const tokens={scribe:"S".repeat(64),emaren:"E".repeat(64),outsider:"O".repeat(64)};
  const verifySession=async (token)=>{
    if(token===tokens.scribe)return "scribe";
    if(token===tokens.emaren)return "emaren";
    if(token===tokens.outsider)return "outsider";
    throw Error("INVALID_SIGNATURE");
  };
  const send=(token,scope,input)=>executeSocialTextWrite({
    pool,verifySession,sessionToken:token,scope,input,
  });
  await db.connect();
  await reader.connect();
  try {
    assert.equal((await db.query(
      "SELECT count(*)::int AS n FROM pg_proc WHERE pronamespace='aoe2war_social_hd_v2'::regnamespace AND prosecdef"
    )).rows[0].n,5);
    const clan=await send(tokens.scribe,"clan",{
      slug:"alpha",audience:"clan",message:"UID650 V2 Clan source acceptance",
    });
    assert.equal(clan.status,201,JSON.stringify(clan));
    const clanDb=await db.query("SELECT author_user_id,body FROM public.clan_messages WHERE id=$1",
      [clan.body.messageId]);
    assert.deepEqual(clanDb.rows,[{author_user_id:1,body:"UID650 V2 Clan source acceptance"}]);
    const retry=await send(tokens.scribe,"clan",{
      slug:"alpha",audience:"clan",message:"UID650 V2 Clan source acceptance",
    });
    assert.equal(retry.status,201);
    assert.equal(retry.body.messageId,clan.body.messageId);
    assert.equal(retry.body.replayed,true);
    const outsiderClan=await send(tokens.outsider,"clan",{
      slug:"alpha",audience:"clan",message:"Do not admit outsider",
    });
    assert.equal(outsiderClan.status,403);
    const adminClan=await send(tokens.emaren,"clan",{
      slug:"alpha",audience:"public",message:"Admin public notice",
    });
    assert.equal(adminClan.status,201);

    const first=await send(tokens.scribe,"direct",{
      targetUid:"emaren",body:"WE3 Direct V2 signed writer",replyToMessageId:null,
    });
    assert.equal(first.status,201,JSON.stringify(first));
    const replay=await send(tokens.scribe,"direct",{
      targetUid:"emaren",body:"WE3 Direct V2 signed writer",replyToMessageId:null,
    });
    assert.equal(replay.status,201);
    assert.equal(replay.body.messageId,first.body.messageId);
    assert.equal(replay.body.replayed,true);
    const forbidden=await send(tokens.scribe,"direct",{
      targetUid:"system",body:"No system recipient",replyToMessageId:null,
    });
    assert.equal(forbidden.status,403);
    const reply=await send(tokens.emaren,"direct",{
      targetUid:"scribe",body:"WE3 approved reply",replyToMessageId:first.body.messageId,
    });
    assert.equal(reply.status,201,JSON.stringify(reply));
    const messages=await db.query(
      "SELECT id,conversation_id,sender_user_id,reply_to_message_id FROM public.direct_messages ORDER BY id"
    );
    assert.equal(messages.rows.length,2);
    assert.deepEqual(messages.rows.map(x=>x.sender_user_id),[1,2]);
    assert.equal(messages.rows[1].reply_to_message_id,first.body.messageId);
    const participants=await db.query(
      "SELECT user_id FROM public.direct_conversation_participants WHERE conversation_id=$1 ORDER BY user_id",
      [messages.rows[0].conversation_id]);
    assert.deepEqual(participants.rows.map(x=>x.user_id),[1,2]);

    await assert.rejects(reader.query(
      "SELECT * FROM aoe2war_social_hd_v2.v_direct_messages"),e=>e.code==="42501");
    await assert.rejects(reader.query(
      "DELETE FROM public.users WHERE id=1"),e=>e.code==="42501");
    await assert.rejects(reader.query(
      "SELECT * FROM public.bet_wagers"),e=>e.code==="42501");
    await assert.rejects(reader.query(
      "SELECT aoe2war_social_hd_v2.leaf_send_direct(1,1,'bypass',NULL)"),
      e=>e.code==="42501");
    const forged=await send(tokens.scribe,"direct",{
      targetUid:"emaren",body:"forged",replyToMessageId:null,senderUserId:2,
    });
    assert.equal(forged.status,400);
    const anonymous=await send("NOT_VALID","clan",{
      slug:"alpha",audience:"public",message:"no cookie",
    });
    assert.equal(anonymous.status,401);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM public.bet_wagers")).rows[0].n,0);
  } finally {
    await reader.end();
    await pool.end();
    await db.end();
  }
});
