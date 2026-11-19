import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import pg from "pg";
import {
  loadLibraryActivityUploads, loadLibraryActivityBatches,
  loadLibraryPackageReceipts, loadLibraryBatchProvenance,
} from "../lib/libraryPublicProjection.ts";

// UID650 disposable PG16 ONLY. No host/finance credentials, existing DB or TCP.
const host = process.env.LIBRARY_PROJECTION_TEST_PGHOST;
const port = Number(process.env.LIBRARY_PROJECTION_TEST_PGPORT || "5432");
const DB = "aoe2hd_db";
const me = "aoe_product_runner";
const verifiedFixture = (key, expectedSha256) => {
  const filename = process.env[key];
  if (!filename) throw Error("EXPLICIT_WE1_PRIVATE_SQL_FIXTURE_REQUIRED");
  const bytes = readFileSync(filename);
  assert.equal(createHash("sha256").update(bytes).digest("hex"),expectedSha256,
    "Do not execute unpinned SQL fixture");
  return bytes.toString("utf8");
};
// PRODUCT never checks in or installs SQL: WE1 owns the protected source.
// The opt-in fixture files live only in UID650 private scratch.
const install = host ? verifiedFixture(
  "LIBRARY_PROJECTION_TEST_WE1_INSTALL_FILE",
  "c5d841708b8423cd1f6c4287836bd8486fd2d849f6d67db621fcd8351f514110")
  .replaceAll("__ACTIVITY_NONFINANCIAL_OWNER__","we3_event_activity_owner")
  .replaceAll("__WATCHER_NONFINANCIAL_OWNER__","we3_event_watcher_owner") : null;
const inverse = host ? verifiedFixture(
  "LIBRARY_PROJECTION_TEST_WE1_INVERSE_FILE",
  "3a25744c02dce756493652fcc1f16e184ff62c198cded6855e8aab284f38903c") : null;
const acl = `
 SELECT c.relname,c.relacl::text AS acl FROM pg_class c
 WHERE c.relnamespace='public'::regnamespace
 AND c.relname IN ('user_activity_events','user_activity_events_id_seq',
  'watcher_client_events','watcher_client_events_id_seq','bet_wagers')
 ORDER BY c.relname`;
const get = async(client,query,params=[]) => (await client.query(query,params)).rows;
async function denied(client,sql) {
  let code = null;
  try {await client.query(sql);} catch(e) {code=e.code;}
  assert.equal(code,"42501",sql+" must be denied for website role");
}
function adapter(client) {
  return {$queryRaw:async(strings,...values)=>{
    let sql=strings[0];
    for(let i=0;i<values.length;i++)sql+="$"+(i+1)+strings[i+1];
    return (await client.query(sql,values)).rows;
  }};
}

test("exact WE1 public projections: privacy, restricted reader, truthful rows, raw ACL inverse",
  {skip:!host}, async()=>{
  const db = new pg.Client({host,port,database:DB,user:me});
  const web = new pg.Client({host,port,database:DB,user:"aoe2war_web_prod"});
  await db.connect();
  let connected=false;
  try {
    await db.query(`
      CREATE ROLE we3_event_activity_owner NOLOGIN NOINHERIT NOSUPERUSER;
      CREATE ROLE we3_event_watcher_owner NOLOGIN NOINHERIT NOSUPERUSER;
      CREATE ROLE aoe2war_web_prod LOGIN NOINHERIT NOSUPERUSER;
      CREATE TABLE public.user_activity_events(
        id serial PRIMARY KEY,user_id integer NOT NULL,type text NOT NULL,
        label text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        metadata jsonb NOT NULL,ip_address text,private_audit_header text);
      CREATE TABLE public.watcher_client_events(
        id serial PRIMARY KEY,user_id integer,user_uid text,
        event_type text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        watcher_id text,session_id text,replay_hash text,
        private_agent text,ip_address text);
      CREATE TABLE public.bet_wagers(id serial PRIMARY KEY,stake integer NOT NULL);
      INSERT INTO public.user_activity_events(user_id,type,label,metadata,ip_address,private_audit_header)
        VALUES (1,'replay_upload','War archive',
          '{"packageUpload":true,"receivedCount":2,"gameIds":[9101,9102],"privateIp":"should-never-leak","financialWallet":"never"}',
          '10.0.0.9','SHOULD_NOT_APPEAR');
      INSERT INTO public.user_activity_events(user_id,type,label,metadata)
        VALUES (2,'private_event','not public','{"password":"secret"}');
      INSERT INTO public.watcher_client_events(
        user_id,user_uid,event_type,watcher_id,session_id,replay_hash,private_agent,ip_address)
        VALUES (1,'scribe','batch_upload_file_succeeded','internal_watcher','internal_session','hash9101',
                'PRIVATE-HEADER','10.0.0.9');
      INSERT INTO public.watcher_client_events(user_id,user_uid,event_type,private_agent)
        VALUES (2,'outsider','private_system_key','PRIVATE-SECRET');
      INSERT INTO public.bet_wagers(stake) VALUES(900);
      ALTER TABLE public.user_activity_events OWNER TO we3_event_activity_owner;
      ALTER TABLE public.watcher_client_events OWNER TO we3_event_watcher_owner;
    `);
    const before=await get(db,acl);
    assert.equal(before.length,5);
    assert.ok(before.every(row=>row.acl===null));
    await db.query(install);
    assert.deepEqual(await get(db,acl),before,"original table and sequence ACLs preserved");
    await web.connect();connected=true;
    const projection=adapter(web);
    const uploads=await loadLibraryActivityUploads(projection);
    const packages=await loadLibraryPackageReceipts(projection);
    assert.equal(uploads.length,1);
    assert.equal(packages.length,1);
    assert.equal(packages[0].user_id,1);
    assert.deepEqual(Object.keys(uploads[0].metadata).sort(),
      ["gameIds","packageUpload","receivedCount"].sort());
    assert.equal(uploads[0].metadata.privateIp,undefined);
    assert.equal(uploads[0].metadata.financialWallet,undefined);
    const batches=await loadLibraryActivityBatches(projection,new Date(Date.now()-3600_000));
    const batchHistory=await loadLibraryBatchProvenance(projection);
    assert.equal(batches.length,1);
    assert.equal(batchHistory.length,1);
    assert.equal(batchHistory[0].replay_hash,"hash9101");
    assert.deepEqual(await loadLibraryActivityBatches(projection,new Date(Date.now()+3600_000)),[]);
    await denied(web,"SELECT * FROM public.user_activity_events");
    await denied(web,"SELECT * FROM public.watcher_client_events");
    await denied(web,"SELECT * FROM public.bet_wagers");
    await denied(web,"INSERT INTO public.bet_wagers(stake) VALUES(1)");
    assert.equal((await get(web,"SELECT count(*)::int AS n FROM aoe2war_library_activity_public.replay_uploads WHERE type='private_event'"))[0].n,0);
    assert.equal((await get(web,"SELECT count(*)::int AS n FROM aoe2war_library_watcher_public.batch_receipts WHERE event_type='private_system_key'"))[0].n,0);
  } finally {
    if(connected)await web.end();
    // No CASCADE and no original grant/revoke; do not suppress inverse failure.
    await db.query(inverse);
    const after=await get(db,acl);
    assert.equal(after.length,5);
    assert.ok(after.every(row=>row.acl===null));
    assert.equal((await get(db,"SELECT count(*)::int AS n FROM public.bet_wagers"))[0].n,1);
    assert.deepEqual(after,await get(db,acl));
    await db.end();
  }
});
