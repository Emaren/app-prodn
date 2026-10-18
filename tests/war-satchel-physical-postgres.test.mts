import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";

const bin = process.env.AOE2WAR_TEST_PG_BIN || "/opt/homebrew/opt/postgresql@16/bin";
const migrations = ["20261014_103500_war_satchel_noncrediting_foundation", "20261014_133000_war_satchel_wallet_owner_challenges", "20261014_150000_war_satchel_simulated_double_entry", "20261014_164500_war_satchel_simulation_concurrency_guard", "20261014_191500_war_satchel_simulation_single_owner", "20261017_012000_war_satchel_funded_ledger_foundation"];
const migration = readFileSync(new URL("../prisma/migrations/20261018_020000_war_satchel_physical_receipt_consumption/migration.sql",import.meta.url),"utf8");
const vault = "wolo1"+"p".repeat(38);
const sender = "wolo1"+"q".repeat(38);

test("physical Satchel receipts are globally unique in real isolated PostgreSQL", {skip: process.env.RUN_SATCHEL_PHYSICAL_PG_TESTS !== "1"}, async t => {
  assert.ok(existsSync(path.join(bin,"initdb")));
  const root=mkdtempSync("/tmp/aoe2-satchel-physical-");
  const data=path.join(root,"data"), socket=path.join(root,"socket"); mkdirSync(socket,{mode:0o700});
  const clients: pg.Client[]=[];
  let started=false;
  const connect=async (database="postgres")=>{
    const c=new pg.Client({host:socket,user:"satchel_fixture",database});await c.connect();clients.push(c);
    await c.query("SET statement_timeout='5s'");return c;
  };
  const setup=async(c:pg.Client)=>{
    await c.query("CREATE TABLE users(id int PRIMARY KEY); CREATE TABLE bet_auto_presets(id int PRIMARY KEY); CREATE TABLE bet_auto_executions(id int PRIMARY KEY); CREATE TABLE pending_wolo_claims(id int PRIMARY KEY)");
    for(const m of migrations)await c.query(readFileSync(new URL("../prisma/migrations/"+m+"/migration.sql",import.meta.url),"utf8"));
    await c.query("INSERT INTO users VALUES(1),(2); INSERT INTO pending_wolo_claims VALUES(101),(102),(103),(104),(105)");
    for(let n=1;n<=5;n++){
      const id=`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
      await c.query("INSERT INTO war_satchel_deposit_intents(id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,expires_at) VALUES($1,1,$2,$3,100,$4,$5,now()+interval '10 minutes')",[id,sender,vault,"aoe2war/satchel/v1/player/"+"a".repeat(20)+n,"a".repeat(20)+n]);
      await c.query("INSERT INTO war_satchel_proof_candidates(intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,status,verified_at) VALUES($1,1,'wolo-1',$2,0,$3,$4,100,100,'uncredited',now())",[id,String(n).repeat(64),sender,vault]);
    }
  };
  const deposit=(c:pg.Client,n:number)=>c.query("INSERT INTO war_satchel_funded_receipts(owner_user_id,proof_candidate_id,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height) VALUES(1,$1,'wolo-1',$2,0,100,$3,100)",[n,String(n).repeat(64),vault]);
  const returned=(c:pg.Client,n:number)=>c.query("INSERT INTO war_satchel_funded_claim_returns(claim_id,owner_user_id,source_market_id,claim_kind,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height) VALUES($1,2,1,'bet_refund','wolo-1',$2,0,100,$3,100)",[100+n,String(n).repeat(64),vault]);
  try {
    execFileSync(path.join(bin,"initdb"),["-D",data,"-U","satchel_fixture","--auth-local=trust","--auth-host=reject"],{stdio:"pipe"});
    execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-l",path.join(root,"server.log"),"-o",`-h '' -k ${socket}`,"-w","start"],{stdio:"pipe"});started=true;
    const c=await connect();await setup(c);await deposit(c,1);await c.query(migration);
    await t.test("existing receipts backfill without changing history",async()=>{
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_physical_receipt_consumptions")).rows[0].count,"1");
      await assert.rejects(returned(c,1),{code:"23505"});
      await assert.rejects(deposit(c,1),{code:"23505"});
    });
    await t.test("claim-return first blocks later deposit across tables and owners",async()=>{await returned(c,2);await assert.rejects(deposit(c,2),{code:"23505"});});
    await t.test("concurrent cross-path inserts wait then reject the second physical claim",async()=>{
      const a=await connect(),b=await connect();await a.query("BEGIN");await deposit(a,3);await b.query("BEGIN");
      const blocked=assert.rejects(returned(b,3),{code:"23505"});
      await a.query("COMMIT");await blocked;await b.query("ROLLBACK");
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_physical_receipt_consumptions WHERE tx_hash=$1",["3".repeat(64)])).rows[0].count,"1");
    });
    await t.test("rollback releases only the uncommitted consumption",async()=>{await c.query("BEGIN");await deposit(c,4);await c.query("ROLLBACK");await returned(c,4);});
    await t.test("connection crash rolls back receipt and physical consumption together",async()=>{
      const crashed=await connect();await crashed.query("BEGIN");await deposit(crashed,5);await crashed.end();await returned(c,5);
    });
    await t.test("physical consumption is immutable",async()=>{
      await assert.rejects(c.query("DELETE FROM war_satchel_physical_receipt_consumptions"),/immutable/);
      await assert.rejects(c.query("TRUNCATE war_satchel_physical_receipt_consumptions"),/immutable/);
      await assert.rejects(c.query("UPDATE war_satchel_physical_receipt_consumptions SET owner_user_id=2"),/immutable/);
      assert.equal((await c.query("SELECT count(*) FROM war_satchel_physical_receipt_consumptions")).rows[0].count,"5");
    });
    await t.test("existing migration cohort rolls back all schema changes in one caller transaction",async()=>{
      await c.query("CREATE DATABASE rehearsal_fixture");const scratch=await connect("rehearsal_fixture");
      await scratch.query("CREATE TABLE users(id int PRIMARY KEY); CREATE TABLE bet_auto_presets(id int PRIMARY KEY); CREATE TABLE bet_auto_executions(id int PRIMARY KEY); CREATE TABLE pending_wolo_claims(id int PRIMARY KEY); INSERT INTO users VALUES(99)");
      // Exercise the actual checked-in SQL directly. The production website
      // release controller does not own these held financial migrations.
      await scratch.query("BEGIN");
      for(const m of migrations)await scratch.query(readFileSync(new URL("../prisma/migrations/"+m+"/migration.sql",import.meta.url),"utf8"));
      await scratch.query(migration);
      assert.equal((await scratch.query("SELECT to_regclass('war_satchel_physical_receipt_consumptions') AS name")).rows[0].name,"war_satchel_physical_receipt_consumptions");
      await scratch.query("ROLLBACK");
      assert.equal((await scratch.query("SELECT to_regclass('war_satchel_physical_receipt_consumptions') AS name")).rows[0].name,null);
      assert.equal((await scratch.query("SELECT to_regclass('war_satchel_funded_receipts') AS name")).rows[0].name,null);
      assert.equal((await scratch.query("SELECT id FROM users")).rows[0].id,99);
    });
    await t.test("historical cross-path collision aborts migration with original rows intact",async()=>{
      await c.query("CREATE DATABASE collision_fixture");const old=await connect("collision_fixture");await setup(old);await deposit(old,1);await returned(old,1);
      await assert.rejects(old.query(migration),{code:"23505"});await old.query("ROLLBACK");
      assert.equal((await old.query("SELECT to_regclass('war_satchel_physical_receipt_consumptions') AS table_name")).rows[0].table_name,null);
      assert.equal((await old.query("SELECT count(*) FROM war_satchel_funded_receipts")).rows[0].count,"1");
      assert.equal((await old.query("SELECT count(*) FROM war_satchel_funded_claim_returns")).rows[0].count,"1");
    });
  } finally {
    for(const c of clients)try{await c.end();}catch{}
    if(started)execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-m","immediate","-w","stop"],{stdio:"pipe"});
    rmSync(root,{recursive:true,force:true});
  }
});
