#!/usr/bin/env node
/**
 * Phase7 production-facing read-only financial inspector.
 * No deposits, SET ROLE to writer, signing, retry or financial DML.
 * A GREEN source or bank-shaped row never grants financial release GO.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import pg from "pg";
const result={
 schema:"aoe2war.epoch-v3.live-financial-inspection.v1",
 financial_admission:"HOLD",
 checked_at:new Date().toISOString(),
 findings:[],
 source:{},
 database:{queried:false},
 actual_native_bank_proof_authenticated_by_this_process:false,
 real_money_authorized:false
};
function check(code,state,cause,owner,evidence=null){
 result.findings.push({code,state,cause,owner,evidence_source:evidence,production_admission:state==="PASS"?"NO_OVERRIDE":"HOLD"});
}
const required=[
 ["20261027023000_epoch_v3_held_financial_ledger","prisma/migrations/20261027023000_epoch_v3_held_financial_ledger/migration.sql"],
 ["20261027040000_epoch_v3_native_proof_provenance","prisma/migrations/20261027040000_epoch_v3_native_proof_provenance/migration.sql"]
];
for(const [name,file] of required){
 const full=new URL("../../"+file,import.meta.url);
 if(fs.existsSync(full)){
  const checksum=crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
  result.source[name]={path:file,sha256:checksum};
 }else check("MIGRATION_SOURCE_MISSING","HOLD",file+" absent","HD Finance",file);
}
const socket=process.env.EPOCH_V3_AUDITOR_SOCKET||"";
const user=process.env.EPOCH_V3_AUDITOR_LOGIN||"";
const database=process.env.EPOCH_V3_AUDITOR_DATABASE||"";
if(!socket.startsWith("/")||!user||!database||!fs.existsSync(socket)){
 check("AUDITOR_CONNECTION_UNAVAILABLE","HOLD","Verified local Unix-socket reader not configured; no connection attempted","Operator","explicit EPOCH_V3_AUDITOR_* only");
}else{
 const client=new pg.Client({host:socket,user,database,connectionTimeoutMillis:4000,
   application_name:"epoch-v3-readonly-admission"});
 let tx=false;
 try{
  await client.connect();
  // NO escalation to finance issuer/writer. SET ROLE only to audit-only group,
  // and reject connections that cannot assume that exact predefined role.
  await client.query("SET ROLE epoch_v3_auditor");
  const identity=(await client.query("SELECT current_user as role")).rows[0]?.role;
  if(identity!=="epoch_v3_auditor")throw Error("AUDITOR_ROLE_NOT_ENROLLED");
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  tx=true;
  await client.query("SET LOCAL statement_timeout='4000ms'");
  result.database.queried=true;
  result.database.role=identity;
  const migrations=(await client.query("SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations WHERE migration_name=$1 OR migration_name=$2",required.map(x=>x[0]))).rows;
  const valid=required.every(([name])=>{
   const row=migrations.find(x=>x.migration_name===name);
   return row&&row.finished_at&&!row.rolled_back_at&&row.checksum===result.source[name]?.sha256;
  });
  check("MIGRATION_CHRONOLOGY",valid?"PASS":"HOLD",
   valid?"Both source-checksummed migrations applied in canonical chronology":"Missing, altered or unapproved migration checksum","HD Finance","readonly _prisma_migrations");
  if(valid){
   const bad=(await client.query("SELECT count(*)::int n FROM epoch_v3.position_reconciliation WHERE NOT exact")).rows[0]?.n;
   check("LEDGER_RECONCILIATION",bad===0?"PASS":"HOLD",bad===0?"Owner balances match immutable events":"Materialized owner balance differs from immutable ledger","HD Finance","epoch_v3.position_reconciliation");
   const liabilities=(await client.query("SELECT epoch_id,total_new_epoch_liability_uwolo::text as owed FROM epoch_v3.account_liability_inventory ORDER BY epoch_id")).rows;
   result.database.new_epoch_liabilities=liabilities;
   const banks=(await client.query("SELECT epoch_id,account_role,bank_state_height,bank_commit_height,block_sha256,app_sha256,bank_balance_uwolo,liabilities_uwolo,maximum_unknown_outflow_uwolo,gas_uwolo,operating_floor_uwolo,expires_at FROM epoch_v3.native_account_reserve_evidence WHERE expires_at>clock_timestamp() ORDER BY bank_state_height DESC LIMIT 20")).rows;
   const epochs=[...new Set(banks.map(b=>b.epoch_id))];
   for(const epoch of epochs){
    const candidates=banks.filter(x=>x.epoch_id===epoch);
    const vault=candidates.find(x=>x.account_role==="vault");
    const escrow=candidates.find(x=>x.account_role==="escrow");
    const root=!!(vault&&escrow&&vault.bank_state_height===escrow.bank_state_height&&vault.bank_commit_height===escrow.bank_commit_height&&vault.block_sha256===escrow.block_sha256&&vault.app_sha256===escrow.app_sha256&&vault.bank_commit_height===Number(vault.bank_state_height)+1);
    const covers=x=>x&&BigInt(x.bank_balance_uwolo)>=BigInt(x.liabilities_uwolo)+BigInt(x.maximum_unknown_outflow_uwolo)+BigInt(x.gas_uwolo)+BigInt(x.operating_floor_uwolo);
    check("VAULT_ESCROW_BANK_SAME_ROOT",root?"PASS":"HOLD",
      root?"DB has matching claimed proof records; native authenticity separately required":"Missing/stale/mismatched account H/H+1","Codex/Wolo + Operator","epoch_v3.native_account_reserve_evidence "+epoch);
    check("ACCOUNT_LOCAL_RESERVE",root&&covers(vault)&&covers(escrow)?"PASS":"HOLD",
      "Neither vault nor escrow may borrow the other's balance","HD+DE Finance","account-local proof candidates "+epoch);
   }
   if(!epochs.length)check("BANK_PROOF_STALE","HOLD","No fresh same-root candidate records","Codex/Wolo","native reserve audit");
  }
 }catch(e){
  check("READONLY_PRODUCTION_INSPECTION_FAILED","HOLD",String(e.message).slice(0,250),"Operator","readonly local PG");
 }finally{
  if(tx)try{await client.query("ROLLBACK")}catch{}
  await client.end().catch(()=>{});
 }
}
for(const [code,owner,detail] of [
 ["NATIVE_COMET_TRUST","Codex/Wolo","This JS inspector cannot authenticate signatures or ICS23"],
 ["NEW_ESCROW_SIGNER_ABSENT","Codex/Wolo","Independent signer not proven installed"],
 ["WRITER_EXCLUSION_INCOMPLETE","HEL1 Operator","Old HD/DE and external writers not independently fenced"],
 ["HISTORICAL_HD_DE_LIABILITIES_UNKNOWN","HD+DE Finance","Legacy and DE full unfiltered census not certified"],
 ["OWNER_PERMIT_MISSING","Central Command","No exact approved canary permit/offhost nonce"],
 ["BACKUP_RESTORE_UNPROVEN","Operator","Independent full HD+DE restore not certified"]
 ])check(code,"HOLD",detail,owner,null);
process.stdout.write(JSON.stringify(result,null,2)+"\n");
process.exitCode=2;
