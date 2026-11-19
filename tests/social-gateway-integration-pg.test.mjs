import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import pg from "pg";
import {executeSocialTextWrite} from "../lib/socialWriterCore.mjs";

// Creates and destroys its OWN synthetic database/role, not HD/DE or a site.
const host=process.env.SOCIAL_GATEWAY_TEST_PGHOST;
const run=Boolean(host);
const DB="we3_gateway_source_lab_20261119";
const ROLE="we3_gateway_source_writer_20261119";
const ROOT="aoe_product_runner";
const doc=readFileSync(new URL("../docs/WE3_SOCIAL_GATEWAY_V1_REVIEW_20261119.md",import.meta.url),"utf8");
const blocks=[...doc.matchAll(/~~~sql\n([\s\S]*?)\n~~~/g)].map(m=>m[1]);
const sqlInstall=blocks[0]?.replaceAll("aoe2war_social_writer",ROLE);
const sqlInverse=blocks[1]?.replaceAll("aoe2war_social_writer",ROLE);
const seed=[
 "CREATE TABLE public.users(id serial PRIMARY KEY,uid varchar(100) UNIQUE,is_admin boolean NOT NULL DEFAULT false,verification_method varchar(30),in_game_name varchar(100),steam_persona_name varchar(100),created_at timestamptz DEFAULT now())",
 "CREATE TABLE public.clans(id serial PRIMARY KEY,slug varchar(80) UNIQUE,status varchar(30),chat_audience_policy varchar(30))",
 "CREATE TABLE public.clan_members(clan_id integer,user_id integer,status varchar(30),role varchar(30),PRIMARY KEY(clan_id,user_id))",
 "CREATE TABLE public.clan_messages(id serial PRIMARY KEY,clan_id integer,author_user_id integer,body varchar(1200),audience varchar(30),created_at timestamptz,updated_at timestamptz)",
 "CREATE TABLE public.direct_conversations(id serial PRIMARY KEY,pair_key varchar(100) UNIQUE NOT NULL,created_at timestamptz,updated_at timestamptz)",
 "CREATE TABLE public.direct_conversation_participants(id serial PRIMARY KEY,conversation_id integer,user_id integer,joined_at timestamptz,last_read_at timestamptz,typing_updated_at timestamptz,UNIQUE(conversation_id,user_id))",
 "CREATE TABLE public.direct_messages(id serial PRIMARY KEY,conversation_id integer,sender_user_id integer,body text,reply_to_message_id integer,created_at timestamptz)",
 "CREATE TABLE public.direct_message_drafts(id serial PRIMARY KEY,conversation_id integer,user_id integer,body text)",
 "CREATE TABLE public.financial_test_escrow(id serial PRIMARY KEY,amount numeric)",
 "INSERT INTO public.users(id,uid,is_admin,verification_method,in_game_name) VALUES (1,'u_alice',false,'steam','Scribe Fixture'),(2,'u_bob',false,'steam','Bob Fixture'),(3,'u_admin',true,'steam','Admin Fixture'),(4,'u_outsider',false,'steam','Outsider'),(5,'u_system',false,'system','System')",
 "SELECT setval('public.users_id_seq',5,true)",
 "INSERT INTO public.clans(id,slug,status,chat_audience_policy) VALUES (1,'aoe2war','active','public'),(2,'private-hall','active','clan')",
 "INSERT INTO public.clan_members(clan_id,user_id,status,role) VALUES (1,1,'active','member'),(1,2,'active','member')"
].join(";\n")+";";
const censusSQL="SELECT n.nspname,c.relname,c.relacl::text AS raw "+
 "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
 "WHERE n.nspname='public' AND c.relname IN "+
 "('users','clans','clan_members','clan_messages','direct_conversations',"+
 "'direct_conversation_participants','direct_messages','direct_message_drafts',"+
 "'clan_messages_id_seq','direct_conversations_id_seq',"+
 "'direct_conversation_participants_id_seq','direct_messages_id_seq') "+
 "ORDER BY c.relname";
const q=async(db,sql,params=[]) => (await db.query(sql,params)).rows;
test("full social gateway signed-identity fixture: sends, readback, denials, finance and committed raw inverse",
  {skip:!run},async()=>{
  assert.equal(blocks.length,2,"Exact installer and inverse SQL fences");
  const admin=new pg.Client({host,database:"aoe2hd_db",user:ROOT});
  let db=null, pool=null, created=false;
  await admin.connect();
  try {
    const existing=await q(admin,"SELECT count(*)::int AS n FROM pg_database WHERE datname=$1",[DB]);
    assert.equal(existing[0].n,0,"Refuse existing database");
    const preRole=await q(admin,"SELECT count(*)::int AS n FROM pg_roles WHERE rolname=$1",[ROLE]);
    assert.equal(preRole[0].n,0,"Refuse existing role");
    await admin.query("CREATE DATABASE "+DB+" TEMPLATE template0");
    created=true;
    db=new pg.Client({host,database:DB,user:ROOT});
    await db.connect();
    await db.query(seed);
    const before=await q(db,censusSQL);
    assert.equal(before.length,12);
    assert.ok(before.every(row=>row.raw===null),"Fixture preimage requires raw NULL ACLs");
    await db.query(sqlInstall);
    assert.deepEqual(await q(db,censusSQL),before,"Install must not mutate legacy raw ACL");
    const publicExec=await q(db,"SELECT has_function_privilege('public','social_gateway_v1.send_direct_text(integer,integer,text,integer)','EXECUTE') AS allowed");
    assert.equal(publicExec[0].allowed,false);
    const roleRights=await q(db,"SELECT has_table_privilege($1,'public.direct_messages','INSERT') AS base_write,"+
      "has_sequence_privilege($1,'public.direct_messages_id_seq','USAGE') AS seq_use,"+
      "has_table_privilege($1,'social_gateway_v1.direct_messages','SELECT') AS view_read",[ROLE]);
    assert.deepEqual(roleRights[0],{base_write:false,seq_use:false,view_read:true});
    pool=new pg.Pool({host,database:DB,user:ROLE,max:2});
    const tokens={alice:"A".repeat(64),bob:"B".repeat(64),outsider:"C".repeat(64)};
    const verify=async(token)=> {
      if(token===tokens.alice)return "u_alice";
      if(token===tokens.bob)return "u_bob";
      if(token===tokens.outsider)return "u_outsider";
      throw Error("INVALID_SIGNED_SESSION");
    };
    const submit=(token,scope,input)=>executeSocialTextWrite({
      pool,verifySession:verify,sessionToken:token,scope,input,
      onError:code=>{throw new Error("Unexpected SQLSTATE "+code);}
    });
    const clan=await submit(tokens.alice,"clan",
      {slug:"aoe2war",message:"Gateway-clan-20261119",audience:"public"});
    assert.equal(clan.status,201,JSON.stringify(clan));
    const body=await q(db,"SELECT m.body,u.uid FROM public.clan_messages m JOIN public.users u ON u.id=m.author_user_id WHERE m.id=$1",[clan.body.messageId]);
    assert.deepEqual(body,[{body:"Gateway-clan-20261119",uid:"u_alice"}]);
    const replay=await submit(tokens.alice,"clan",
      {slug:"aoe2war",message:"Gateway-clan-20261119",audience:"public"});
    assert.equal(replay.status,201);
    assert.equal(replay.body.messageId,clan.body.messageId);
    const denied=await submit(tokens.outsider,"clan",
      {slug:"private-hall",message:"not allowed",audience:"clan"});
    assert.equal(denied.status,403);
    const direct=await submit(tokens.alice,"direct",
      {targetUid:"u_bob",body:"Gateway-direct-20261119",replyToMessageId:null});
    assert.equal(direct.status,201,JSON.stringify(direct));
    const directRead=await q(db,"SELECT m.body,u.uid AS sender,p.user_id AS participant "+
      "FROM public.direct_messages m JOIN public.users u ON u.id=m.sender_user_id "+
      "JOIN public.direct_conversation_participants p ON p.conversation_id=m.conversation_id "+
      "WHERE m.id=$1 ORDER BY p.user_id",[direct.body.messageId]);
    assert.deepEqual(directRead.map(x=>x.participant),[1,2]);
    assert.equal(directRead[0].sender,"u_alice");
    assert.equal(directRead[0].body,"Gateway-direct-20261119");
    const replayDirect=await submit(tokens.alice,"direct",
      {targetUid:"u_bob",body:"Gateway-direct-20261119",replyToMessageId:null});
    assert.equal(replayDirect.status,201);
    assert.equal(replayDirect.body.messageId,direct.body.messageId);
    assert.equal((await submit("", "direct",{targetUid:"u_bob",body:"x"})).status,401);
    assert.equal((await submit(tokens.alice,"direct",{targetUid:"u_system",body:"x"})).status,403);
    assert.equal((await submit(tokens.alice,"direct",{targetUid:"u_bob",body:"x",senderUid:"u_admin"})).status,400);
    // A compromised local writer credential still has no direct finance/legacy DML.
    for (const sql of [
      "INSERT INTO public.financial_test_escrow(amount) VALUES (1)",
      "SELECT nextval('public.direct_messages_id_seq')",
      "DELETE FROM public.direct_message_drafts",
    ]) {
      let denial=null;
      try {await pool.query(sql);}catch(error){denial=error.code;}
      assert.equal(denial,"42501","Unexpected writer capability: "+sql);
    }
    // A synthetic owner-owned trigger is a real transitive-bypass counterexample.
    // A physical WE1 inspector MUST reject this catalog before any grant.
    await db.query("CREATE FUNCTION public.we3_probe_financial_trigger() RETURNS trigger "+
      "LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$ "+
      "BEGIN INSERT INTO public.financial_test_escrow(amount) VALUES(1); RETURN NEW; END $f$");
    await db.query("CREATE TRIGGER we3_probe_finance AFTER INSERT ON public.clan_messages "+
      "FOR EACH ROW EXECUTE FUNCTION public.we3_probe_financial_trigger()");
    const risky=await q(db,"SELECT count(*)::int AS n FROM pg_trigger "+
      "WHERE tgrelid='public.clan_messages'::regclass AND NOT tgisinternal AND tgenabled <> 'D'");
    assert.ok(risky[0].n>0,"Untrusted social trigger must be observable");
    await db.query("DROP TRIGGER we3_probe_finance ON public.clan_messages");
    await db.query("DROP FUNCTION public.we3_probe_financial_trigger()");
    const financial=await q(db,"SELECT count(*)::int AS n FROM public.financial_test_escrow");
    assert.equal(financial[0].n,0);
    assert.deepEqual(await q(db,censusSQL),before,"Gateway writes do not mutate legacy ACL");
    await pool.end();pool=null;
    await db.query(sqlInverse);
    assert.deepEqual(await q(db,censusSQL),before,"Committed inverse raw ACL matches preimage");
    const absent=await q(db,"SELECT (SELECT count(*)::int FROM pg_roles WHERE rolname=$1) AS roles,"+
      "(SELECT count(*)::int FROM pg_namespace WHERE nspname='social_gateway_v1') AS schemas",[ROLE]);
    assert.deepEqual(absent[0],{roles:0,schemas:0});
    assert.equal((await q(db,"SELECT count(*)::int AS n FROM public.clan_messages"))[0].n,1,"Rollback never deletes original replay or message rows");
  } finally {
    if(pool){try{await pool.end();}catch{}}
    if(db){try{await db.end();}catch{}}
    if(created){
      try{await admin.query("DROP DATABASE "+DB+" WITH (FORCE)");}catch{}
      try{await admin.query("DROP ROLE IF EXISTS "+ROLE);}catch{}
    }
    await admin.end();
  }
});
