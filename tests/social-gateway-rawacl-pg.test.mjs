import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

// Isolated PostgreSQL 16 only. The environment variable is never set in production.
const enabled = Boolean(process.env.SOCIAL_GATEWAY_TEST_PGHOST);
const c = enabled ? new pg.Client({host:process.env.SOCIAL_GATEWAY_TEST_PGHOST,
  database:"aoe2hd_db",user:"aoe_product_runner"}) : null;
const q = async(sql,values=[]) => (await c.query(sql,values)).rows;
async function deny(sql) {
  await c.query("SAVEPOINT denial");
  let code = null;
  try {await c.query(sql);}catch(e){code=e.code;}
  await c.query("ROLLBACK TO SAVEPOINT denial");
  await c.query("RELEASE SAVEPOINT denial");
  assert.equal(code,"42501","Wrong denial result: "+sql);
}
test("new gateway functions insert and upsert without mutating five legacy NULL ACLs",
  {skip:!enabled},async()=>{
  await c.connect();
  try {
    await c.query("BEGIN");
    const existing=await q("SELECT count(*)::int AS n FROM pg_roles WHERE rolname='we3_gateway_probe_role'");
    assert.equal(existing[0].n,0,"Never reuse existing role");
    const preexistingSchema=await q("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname IN ('we3_gateway_probe_base','we3_gateway_probe_api')");
    assert.equal(preexistingSchema[0].n,0,"Never reuse an existing schema");
    await c.query("CREATE SCHEMA we3_gateway_probe_base");
    // Public USAGE on a disposable fixture schema isolates table ACL denial.
    await c.query("GRANT USAGE ON SCHEMA we3_gateway_probe_base TO PUBLIC");
    await c.query("CREATE TABLE we3_gateway_probe_base.clan_messages(id serial PRIMARY KEY,body text NOT NULL)");
    await c.query("CREATE TABLE we3_gateway_probe_base.direct_conversations(id serial PRIMARY KEY,pair_key text UNIQUE NOT NULL)");
    await c.query("CREATE TABLE we3_gateway_probe_base.direct_conversation_participants(id serial PRIMARY KEY,conversation_id integer NOT NULL)");
    await c.query("CREATE TABLE we3_gateway_probe_base.direct_messages(id serial PRIMARY KEY,body text NOT NULL)");
    await c.query("CREATE TABLE we3_gateway_probe_base.direct_message_drafts(id serial PRIMARY KEY,body text)");
    const rawSQL="SELECT relname,relacl::text AS raw FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "+
      "WHERE n.nspname='we3_gateway_probe_base' AND relname IN "+
      "('clan_messages_id_seq','direct_conversations_id_seq','direct_conversation_participants_id_seq',"+
      "'direct_messages_id_seq','direct_message_drafts') ORDER BY relname";
    const initial=await q(rawSQL);
    assert.equal(initial.length,5);
    assert.ok(initial.every(row=>row.raw===null));
    await c.query("COMMIT"); // Existing objects are durable before adding the gateway.
    await c.query("BEGIN");
    await c.query("CREATE ROLE we3_gateway_probe_role NOLOGIN NOINHERIT");
    await c.query("CREATE SCHEMA we3_gateway_probe_api");
    await c.query("CREATE VIEW we3_gateway_probe_api.messages WITH (security_barrier=true) "+
      "AS SELECT id,body FROM we3_gateway_probe_base.clan_messages");
    await c.query("CREATE VIEW we3_gateway_probe_api.conversations WITH (security_barrier=true) "+
      "AS SELECT id,pair_key FROM we3_gateway_probe_base.direct_conversations");
    await c.query("CREATE FUNCTION we3_gateway_probe_api.append_message(p_body text) RETURNS integer "+
      "LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$ "+
      "DECLARE new_id integer; BEGIN "+
      "IF p_body IS NULL OR btrim(p_body)='' OR char_length(p_body)>1200 THEN "+
      "RAISE EXCEPTION 'invalid body' USING ERRCODE='22023'; END IF; "+
      "INSERT INTO we3_gateway_probe_base.clan_messages(body) VALUES(p_body) RETURNING id INTO new_id; "+
      "RETURN new_id; END $f$");
    await c.query("CREATE FUNCTION we3_gateway_probe_api.ensure_conversation(p_pair text) RETURNS integer "+
      "LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $f$ "+
      "DECLARE new_id integer; BEGIN "+
      "IF p_pair !~ '^[1-9][0-9]*:[1-9][0-9]*$' THEN "+
      "RAISE EXCEPTION 'invalid key' USING ERRCODE='22023'; END IF; "+
      "INSERT INTO we3_gateway_probe_base.direct_conversations(pair_key) VALUES(p_pair) "+
      "ON CONFLICT(pair_key) DO NOTHING; "+
      "SELECT id INTO new_id FROM we3_gateway_probe_base.direct_conversations WHERE pair_key=p_pair; "+
      "RETURN new_id; END $f$");
    await c.query("REVOKE ALL ON FUNCTION we3_gateway_probe_api.append_message(text),"+
      "we3_gateway_probe_api.ensure_conversation(text) FROM PUBLIC");
    await c.query("GRANT USAGE ON SCHEMA we3_gateway_probe_api TO we3_gateway_probe_role");
    await c.query("GRANT SELECT ON we3_gateway_probe_api.messages,we3_gateway_probe_api.conversations TO we3_gateway_probe_role");
    await c.query("GRANT EXECUTE ON FUNCTION we3_gateway_probe_api.append_message(text),"+
      "we3_gateway_probe_api.ensure_conversation(text) TO we3_gateway_probe_role");
    assert.deepEqual(await q(rawSQL),initial,"Original objects must remain raw-null");
    const pub=await q("SELECT has_function_privilege('public','we3_gateway_probe_api.append_message(text)','EXECUTE') AS granted");
    assert.equal(pub[0].granted,false,"No PUBLIC function execution");
    await c.query("SET LOCAL ROLE we3_gateway_probe_role");
    assert.equal((await q("SELECT we3_gateway_probe_api.append_message('hello') AS id"))[0].id,1);
    const first=(await q("SELECT we3_gateway_probe_api.ensure_conversation('1:2') AS id"))[0].id;
    const second=(await q("SELECT we3_gateway_probe_api.ensure_conversation('1:2') AS id"))[0].id;
    assert.equal(first,second,"Conflict retry must be idempotent");
    assert.deepEqual((await q("SELECT body FROM we3_gateway_probe_api.messages")).map(r=>r.body),["hello"]);
    await deny("INSERT INTO we3_gateway_probe_base.clan_messages(body) VALUES('not authorized')");
    await deny("SELECT nextval('we3_gateway_probe_base.clan_messages_id_seq')");
    await deny("DELETE FROM we3_gateway_probe_base.direct_message_drafts");
    await c.query("RESET ROLE");
    await c.query("COMMIT"); // Simulate completed gateway installation + real writes.
    assert.deepEqual(await q(rawSQL),initial,"Installed gateway must not rewrite raw ACLs");
    assert.equal((await q("SELECT count(*)::int AS n FROM we3_gateway_probe_base.clan_messages"))[0].n,1);
    await c.query("BEGIN");
    // Exact inverse: remove exclusively new gateway objects, no legacy GRANT/REVOKE.
    await c.query("REVOKE EXECUTE ON FUNCTION we3_gateway_probe_api.append_message(text),"+
      "we3_gateway_probe_api.ensure_conversation(text) FROM we3_gateway_probe_role");
    await c.query("REVOKE SELECT ON we3_gateway_probe_api.messages,"+
      "we3_gateway_probe_api.conversations FROM we3_gateway_probe_role");
    await c.query("REVOKE USAGE ON SCHEMA we3_gateway_probe_api FROM we3_gateway_probe_role");
    await c.query("DROP FUNCTION we3_gateway_probe_api.append_message(text),"+
      "we3_gateway_probe_api.ensure_conversation(text) RESTRICT");
    await c.query("DROP VIEW we3_gateway_probe_api.messages,"+
      "we3_gateway_probe_api.conversations RESTRICT");
    await c.query("DROP SCHEMA we3_gateway_probe_api RESTRICT");
    await c.query("DROP ROLE we3_gateway_probe_role");
    await c.query("COMMIT");
    assert.deepEqual(await q(rawSQL),initial,"Committed inverse must restore exact five raw ACL bytes");
    const absentAfter=await q("SELECT (SELECT count(*)::int FROM pg_roles WHERE rolname='we3_gateway_probe_role') AS roles,"+
      "(SELECT count(*)::int FROM pg_namespace WHERE nspname='we3_gateway_probe_api') AS schemas");
    assert.deepEqual(absentAfter[0],{roles:0,schemas:0});
    assert.equal((await q("SELECT count(*)::int AS n FROM we3_gateway_probe_base.clan_messages"))[0].n,1,
      "Inverse must not delete real persisted messages");
  } finally {
    // Clean only wholly synthetic test objects in the UID650 local fixture.
    try {await c.query("ROLLBACK");} catch {}
    try {await c.query("DROP SCHEMA IF EXISTS we3_gateway_probe_api CASCADE");} catch {}
    try {await c.query("DROP ROLE IF EXISTS we3_gateway_probe_role");} catch {}
    try {await c.query("DROP SCHEMA IF EXISTS we3_gateway_probe_base CASCADE");} catch {}
    await c.end();
  }
});
