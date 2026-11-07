import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import {autoBetDailyBudgetAvailable} from "../lib/betMoneyLimits.ts";

const sql=(name:string)=>readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),"utf8");
const migration="20261021_230000_satchel_authoritative_product_limits";

// SQL constraint/admission tests only: no synthetic record is described as a
// valid owner signature, bank proof, deposit, reserve certificate or live fund.
test("forward product caps preserve immutable owner authority in disposable PostgreSQL",{skip:process.env.RUN_SATCHEL_PHYSICAL_PG_TESTS!=="1"},async t=>{
 const bin=process.env.AOE2WAR_TEST_PG_BIN||"/opt/homebrew/opt/postgresql@16/bin";
 assert.ok(existsSync(path.join(bin,"initdb")));
 const root=mkdtempSync("/tmp/satchel-product-limits-"),data=path.join(root,"data"),socket=path.join(root,"socket");
 mkdirSync(socket,{mode:0o700});let started=false;const clients:pg.Client[]=[];
 const connect=async()=>{const c=new pg.Client({host:socket,user:"limits_fixture",database:"postgres"});await c.connect();clients.push(c);await c.query("SET statement_timeout='5s'");
  // Force a local calendar day different from UTC, whatever time CI runs.
  await c.query(new Date().getUTCHours()<12?"SET TIME ZONE 'Etc/GMT+12'":"SET TIME ZONE 'Etc/GMT-12'");return c;};
 try{
  execFileSync(path.join(bin,"initdb"),["-D",data,"-U","limits_fixture","--auth-local=trust","--auth-host=reject"],{stdio:"pipe"});
  execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-l",path.join(root,"server.log"),"-o",`-h '' -k ${socket}`,"-w","start"],{stdio:"pipe"});started=true;
  const c=await connect();
  await c.query("CREATE TABLE users(id int PRIMARY KEY); CREATE TABLE bet_markets(id int PRIMARY KEY); CREATE TABLE bet_stake_tickets(id int PRIMARY KEY); CREATE TABLE pending_wolo_claims(id int PRIMARY KEY)");
  for(const m of ["20260801193000_add_bet_auto_preview_foundation","20261014_103500_war_satchel_noncrediting_foundation","20261014_133000_war_satchel_wallet_owner_challenges","20261014_150000_war_satchel_simulated_double_entry","20261014_164500_war_satchel_simulation_concurrency_guard","20261014_191500_war_satchel_simulation_single_owner","20261017_012000_war_satchel_funded_ledger_foundation","20261018_040000_war_satchel_financial_authorizations"])await c.query(sql(m));
  await c.query("INSERT INTO users VALUES(1); INSERT INTO bet_auto_presets(user_id,winner_stake_wolo,games_remaining) VALUES(1,1000,1); INSERT INTO pending_wolo_claims VALUES(101),(102)");
  const consent=(id:number,stake:number,daily:number)=>c.query(`INSERT INTO war_satchel_auto_spend_consents
   (id,owner_user_id,preset_id,preset_version,owner_uid,wallet_address,nonce,winner_stake_wolo,desync_side,desync_stake_wolo,per_game_cap_wolo,daily_cap_wolo,issued_at,challenge_expires_at,spend_expires_at,signed_at)
   VALUES($1,1,1,1,'fixture-owner','fixture-only-wallet',$2,$3,'none',0,$3,$4,now(),now()+interval '5 minutes',now()+interval '1 day',now())`,
   [`00000000-0000-4000-8000-${String(id).padStart(12,"0")}`,"a".repeat(30)+String(id).padStart(2,"0"),stake,daily]);
  await consent(1,1000,10000);
  const old=(await c.query("SELECT to_jsonb(c) AS row FROM war_satchel_auto_spend_consents c WHERE daily_cap_wolo=10000")).rows[0].row;
  await c.query(sql(migration));
  await t.test("schema update never enlarges a previously signed mandate",async()=>{
   assert.deepEqual((await c.query("SELECT to_jsonb(c) AS row FROM war_satchel_auto_spend_consents c WHERE daily_cap_wolo=10000")).rows[0].row,old);
   await assert.rejects(c.query("UPDATE war_satchel_auto_spend_consents SET daily_cap_wolo=50000"),/immutable/);
  });
  await t.test("exact new owner and finite-plan maxima pass; one unit over refuses",async()=>{
   await consent(2,10000,50000);
   await assert.rejects(consent(3,10001,50000),{code:"23514"});
   await assert.rejects(consent(4,10000,50001),{code:"23514"});
   await c.query("UPDATE bet_auto_presets SET winner_stake_wolo=10000,games_remaining=5");
   await assert.rejects(c.query("UPDATE bet_auto_presets SET games_remaining=6"),{code:"23514"});
  });
  await t.test("a 10000-WOLO original stake can receive its entire unmatched principal",async()=>{
   const insert=(claim:number,funded:string)=>c.query(`INSERT INTO war_satchel_claim_return_authorizations
    (claim_id,owner_user_id,owner_uid,ticket_id,market_id,leg_id,entitlement_id,operation_id,funding_tx_hash,funded_amount_uwolo,amount_uwolo,principal_uwolo,claim_kind,escrow_address,vault_address,return_tx_hash,approval_json,allocation_digest,context_fingerprint)
    VALUES($1,1,'fixture-owner',1,1,1,$2,'satchel:ticket:1',$3,$4,$4,$4,'bet_refund','fixture-escrow','fixture-vault',$5,'{"fixture_only":true}',$6,$6)`,
    [claim,"fixture-entitlement-"+claim,"A".repeat(64),funded,String(claim%10).repeat(64),"b".repeat(64)]);
   await insert(101,"10000000000");
   await assert.rejects(insert(102,"10001000000"),{code:"23514"});
   assert.equal((await c.query("SELECT amount_uwolo=principal_uwolo AND principal_uwolo=funded_amount_uwolo AS full FROM war_satchel_claim_return_authorizations")).rows[0].full,true);
  });
  await t.test("concurrent daily admissions share the production vault lock and cannot exceed 50000",async()=>{
   // Exercise the production arithmetic against actual immutable journal sums
   // and its existing advisory-lock protocol, not a mocked sum or an array.
   const insert=(db:pg.Client,key:string,amount:bigint)=>db.query(`INSERT INTO war_satchel_funded_journal
    (owner_user_id,source_key,event_kind,amount_uwolo,delta_available_uwolo,delta_reserved_uwolo,delta_committed_uwolo,delta_withdrawal_pending_uwolo,execution_id)
    VALUES(1,$1,'wager_reserve',$2,-$2::bigint,$2,0,0,1)`,[key,amount.toString()]);
   await insert(c,"fixture-earlier-reservations",40000000000n);
   assert.equal((await c.query("SELECT to_char(created_at,'YYYY-MM-DD') AS day FROM war_satchel_funded_journal")).rows[0].day,new Date().toISOString().slice(0,10));
   const attempt=async(db:pg.Client,key:string)=>{await db.query("BEGIN");try{
    await db.query("SELECT pg_advisory_xact_lock(724176,47)");
    const used=BigInt((await db.query("SELECT coalesce(sum(amount_uwolo),0)::text AS used FROM war_satchel_funded_journal WHERE owner_user_id=1 AND event_kind='wager_reserve' AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC')")).rows[0].used);
    const admitted=autoBetDailyBudgetAvailable(used,10000000000n,50000);
    if(admitted)await insert(db,key,10000000000n);await db.query("COMMIT");return admitted;
   }catch(error){await db.query("ROLLBACK");throw error;}};
   const outcomes=await Promise.all([attempt(await connect(),"fixture-a"),attempt(await connect(),"fixture-b")]);
   assert.equal(outcomes.filter(Boolean).length,1);
   assert.equal((await c.query("SELECT sum(amount_uwolo)::text AS total FROM war_satchel_funded_journal")).rows[0].total,"50000000000");
  });
 }finally{
  await Promise.all(clients.map(c=>c.end()));if(started)execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-m","immediate","-w","stop"],{stdio:"pipe"});rmSync(root,{recursive:true,force:true});
 }
});
