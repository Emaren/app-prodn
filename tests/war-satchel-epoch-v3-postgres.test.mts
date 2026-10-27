import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import path from "node:path";
import test from "node:test";
import pg from "pg";
const enabled=process.env.RUN_WOLO_EPOCH_V3_PG_TESTS==="1";
const bin=process.env.AOE2WAR_TEST_PG_BIN||"/usr/lib/postgresql/16/bin";
const E="epoch_20261027_funding",V="wolo1"+"p".repeat(38),S="wolo1"+"q".repeat(38),sha="a".repeat(64),day="2026-10-27";
const hash=(n:number)=>n.toString(16).toUpperCase().padStart(64,"0");
const uw=(n:number)=>(BigInt(n)*BigInt(1000000)).toString();
type Client=InstanceType<typeof pg.Client>;
const run=(c:Client,q:string,v:unknown[]=[])=>c.query(q,v);
async function atomic(c:Client,f:()=>Promise<unknown>){
 await run(c,"BEGIN ISOLATION LEVEL SERIALIZABLE");
 try{const x=await f();await run(c,"COMMIT");return x;}catch(e){await run(c,"ROLLBACK");throw e;}
}
async function proof(c:Client,kind:string,owner:string,amount:number,n:number,from:string,to:string,memo:string,appRoot="B".repeat(64)){
 // Disposable fixture owner writes synthetic candidate native facts. This is
 // NOT an actual SDK/Comet verification or production proof-authority grant.
 await run(c,"INSERT INTO epoch_v3.receipts(tx_hash,message_index,epoch_id,owner_uid,kind,sender,recipient,memo,amount_uwolo,chain_height,native_proof_sha256,proof_verified_at,chain_time) VALUES($1,0,$2,$3,$4,$5,$6,$7,$8,1500,$9,clock_timestamp(),'2026-10-27T12:00:00Z')",
 [hash(n),E,owner,kind,from,to,memo,uw(amount),sha]);
 await run(c,"INSERT INTO epoch_v3.native_proof_certificates (tx_hash,message_index,epoch_id,owner_uid,purpose,denom,sender,recipient,memo,amount_uwolo,funding_height,bank_state_height,bank_commit_height,root_app_sha256,root_block_sha256,vault_account,escrow_account,vault_bank_balance_uwolo,escrow_bank_balance_uwolo,proof_sha256,native_verifier_source,native_verifier_binary_sha256,trust_anchor_sha256,verification_record_sha256,observed_at,expires_at,issuer_provenance) VALUES($1,0,$2,$3,$4,'uwolo',$5,$6,$7,$8,1500,1502,1503,$9,$10,$11,$12,1000000000000,1000000000000,$13,$14,$13,$13,$15,clock_timestamp(),clock_timestamp()+interval '90 seconds','disposable-synthetic-not-native')",
 [hash(n),E,owner,kind,from,to,memo,uw(amount),appRoot,"C".repeat(64),V,S,sha,"ae9f0277b58f2288e7b1fc25b03eef2a30271577",hash(n).toLowerCase()]);
}
async function credit(c:Client,owner:string,amount:number,n:number){
 await proof(c,"deposit",owner,amount,n,"wallet:"+owner,V,"deposit/"+owner);
 return run(c,"SELECT epoch_v3.credit_deposit($1,$2,$3,0,$4,$5,$6)",[E,owner,hash(n),uw(amount),"wallet:"+owner,V]);
}
async function fund(c:Client,owner:string,amount:number,ticket:number,n:number){
 return proof(c,"wager_funding",owner,amount,n,V,S,"aoe2war/satchel/epoch-v3/"+E+"/ticket/"+ticket);
}
const leg=(market:number,id:number,wager:number,side:string,amt:number)=>({market_id:market,leg_id:id,wager_id:wager,side,amount_uwolo:uw(amt)});
const admit=(c:Client,owner:string,ticket:number,n:number,legs:unknown[])=>
 run(c,"SELECT epoch_v3.admit_ticket($1,$2,$3,$4,0,$5,$6,$7::jsonb)",[E,owner,ticket,hash(n),day,sha,JSON.stringify(legs)]);
const pos=async(c:Client,owner:string)=>(await run(c,"SELECT available_uwolo::text a,reserved_uwolo::text r,pending_uwolo::text p FROM epoch_v3.positions WHERE epoch_id=$1 AND owner_uid=$2",[E,owner])).rows[0];
test("epoch-v3 persisted isolated SQL financial ledger and parallel consumption",{skip:!enabled?"requires RUN_WOLO_EPOCH_V3_PG_TESTS=1":false},async(t)=>{
 const initdb=path.join(bin,"initdb"),ctl=path.join(bin,"pg_ctl");
 assert.ok(existsSync(initdb)&&existsSync(ctl),"Never fallback to inherited DATABASE_URL");
 const root=mkdtempSync("/tmp/epoch-v3-fixture-"),data=path.join(root,"data"),sock=path.join(root,"socket");
 mkdirSync(sock,{mode:0o700});let started=false;let a:Client|null=null,b:Client|null=null;
 try{
  execFileSync(initdb,["-D",data,"-U","epoch_fixture","--auth-local=trust","--auth-host=reject"],{stdio:"pipe"});
  execFileSync(ctl,["-D",data,"-l",path.join(root,"server.log"),"-o","-h '' -k "+sock,"-w","start"],{stdio:"pipe"});
  started=true;
  a=new pg.Client({host:sock,user:"epoch_fixture",database:"postgres"});
  b=new pg.Client({host:sock,user:"epoch_fixture",database:"postgres"});
  await Promise.all([a.connect(),b.connect()]);
  const migration=readFileSync(new URL("../prisma/migrations/20261027023000_epoch_v3_held_financial_ledger/migration.sql",import.meta.url),"utf8");
  await run(a,migration);
  const nativeMigration=readFileSync(new URL("../prisma/migrations/20261027040000_epoch_v3_native_proof_provenance/migration.sql",import.meta.url),"utf8");
  await run(a,nativeMigration);
  await run(a,"INSERT INTO epoch_v3.epochs(epoch_id,h_star,vault_address,escrow_address,signer_policy_sha256) VALUES($1,1000,$2,$3,$4)",[E,V,S,sha]);
  for(const role of ["vault","escrow"]){
   await run(a,"INSERT INTO epoch_v3.native_account_reserve_evidence (epoch_id,account_role,chain_id,bank_state_height,bank_commit_height,block_sha256,app_sha256,bank_balance_uwolo,liabilities_uwolo,maximum_unknown_outflow_uwolo,gas_uwolo,operating_floor_uwolo,inventory_sha256,nonoverlap_sha256,proof_sha256,observed_at,expires_at) VALUES($1,$2,'wolo-1',1502,1503,$3,$4,1000000000000,0,0,0,0,$5,$5,$5,clock_timestamp(),clock_timestamp()+interval '90 seconds')",[E,role,"C".repeat(64),"B".repeat(64),sha]);
  }
  const roles=readFileSync(new URL("../scripts/review/epoch_v3_roles_install_held.sql",import.meta.url),"utf8");
  await run(a,roles);
  await t.test("native proof certificate and both same-root bank domains are mandatory",async()=>{
   await run(a!,"INSERT INTO epoch_v3.receipts (tx_hash,message_index,epoch_id,owner_uid,kind,sender,recipient,memo,amount_uwolo,chain_height,native_proof_sha256,proof_verified_at,chain_time) VALUES($1,0,$2,'imposter','deposit','wallet:imposter',$3,'test',1000000,1500,$4,clock_timestamp(),'2026-10-27T12:00:00Z')",[hash(901),E,V,sha]);
   await assert.rejects(()=>atomic(a!,()=>run(a!,"SELECT epoch_v3.credit_deposit($1,'imposter',$2,0,1000000,'wallet:imposter',$3)",[E,hash(901),V])),/query returned no rows|no rows in result set|native_proof/i);
   // A source fixture that supplies a single account's current bank proof is
   // also insufficient; both distinct domains are mandatory.
   await proof(a!,"deposit","isolated",1,902,"wallet:isolated",V,"deposit/isolated");
   await run(a!,"DELETE FROM epoch_v3.native_account_reserve_evidence WHERE false");
   await run(a!,"UPDATE epoch_v3.native_proof_certificates SET bank_state_height=1600 WHERE false");
   const cert=(await run(a!,"SELECT bank_state_height FROM epoch_v3.native_proof_certificates WHERE tx_hash=$1",[hash(902)])).rows[0];
   assert.equal(cert.bank_state_height.toString(),"1502");
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.receipt_consumptions WHERE tx_hash=$1",[hash(901)])).rows[0].n,0);
  });
  await t.test("six finance roles are NOLOGIN and cannot mutate forbidden financial paths",async()=>{
   const roles=await run(a!,"SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname LIKE 'epoch_v3_%'");
   assert.equal(roles.rows.length,6);
   assert.ok(roles.rows.every(x=>!x.rolcanlogin&&!x.rolsuper&&!x.rolbypassrls));
   await run(a!,"SET ROLE epoch_v3_app_reader");
   try{
    await run(a!,"SELECT epoch_id FROM epoch_v3.epochs");
    await assert.rejects(()=>run(a!,"INSERT INTO epoch_v3.receipts (tx_hash) VALUES($1)",[hash(950)]),/permission denied/);
    await assert.rejects(()=>run(a!,"SELECT epoch_v3.credit_deposit($1,'test',$2,0,1000000,'from','to')",[E,hash(950)]),/permission denied/);
    await assert.rejects(()=>run(a!,"UPDATE epoch_v3.positions SET available_uwolo=999"),/permission denied/);
   }finally{await run(a!,"RESET ROLE")}
   await run(a!,"SET ROLE epoch_v3_proof_writer");
   try{
    await assert.rejects(()=>run(a!,"SELECT epoch_v3.credit_deposit($1,'test',$2,0,1000000,'from','to')",[E,hash(951)]),/permission denied/);
    await assert.rejects(()=>run(a!,"UPDATE epoch_v3.positions SET available_uwolo=999"),/permission denied/);
   }finally{await run(a!,"RESET ROLE")}
   await run(a!,"SET ROLE epoch_v3_credit_consumer");
   try{
    await assert.rejects(()=>run(a!,"INSERT INTO epoch_v3.native_proof_certificates (tx_hash) VALUES($1)",[hash(952)]),/permission denied/);
    await assert.rejects(()=>run(a!,"SELECT * FROM epoch_v3.receipts"),/permission denied/);
    await assert.rejects(()=>run(a!,"SELECT epoch_v3.consume_receipt($1,'none','deposit',$2,0,1000000,'from','to','key')",[E,hash(952)]),/permission denied/);
   }finally{await run(a!,"RESET ROLE")}
  });
  await t.test("dedicated login can SET LOCAL ROLE proof writer; public login cannot",async()=>{
   await run(a!,"CREATE ROLE epoch_fixture_native_login LOGIN NOINHERIT");
   await run(a!,"GRANT epoch_v3_proof_writer TO epoch_fixture_native_login");
   await run(a!,"CREATE ROLE epoch_fixture_web_login LOGIN NOINHERIT");
   const native=new pg.Client({host:sock,user:"epoch_fixture_native_login",database:"postgres"});
   const web=new pg.Client({host:sock,user:"epoch_fixture_web_login",database:"postgres"});
   await Promise.all([native.connect(),web.connect()]);
   try{
    await assert.rejects(()=>run(native,"INSERT INTO epoch_v3.receipts(tx_hash) VALUES($1)",[hash(980)]),/permission denied/);
    await assert.rejects(()=>run(web,"SET ROLE epoch_v3_proof_writer"),/permission denied/);
    await run(native,"BEGIN");
    try{
     await run(native,"SET LOCAL ROLE epoch_v3_proof_writer");
     assert.equal((await run(native,"SELECT current_user AS role")).rows[0].role,"epoch_v3_proof_writer");
     const bank=await run(native,"SELECT bank_balance_uwolo::text AS balance FROM epoch_v3.native_account_reserve_evidence WHERE epoch_id=$1 AND account_role=$2 AND bank_state_height=1502",[E,"vault"]);
     assert.equal(bank.rows.length,1);
     assert.equal(bank.rows[0].balance,"1000000000000");
     await assert.rejects(()=>run(native,"UPDATE epoch_v3.native_account_reserve_evidence SET bank_balance_uwolo=0"),/permission denied/);
     await assert.rejects(()=>run(native,"UPDATE epoch_v3.positions SET available_uwolo=999"),/permission denied/);
    }finally{await run(native,"ROLLBACK")}
    assert.equal((await run(native,"SELECT current_user AS role")).rows[0].role,"epoch_fixture_native_login");
   }finally{await Promise.allSettled([native.end(),web.end()])}
  });
  await t.test("a signed-looking receipt at a DIFFERENT native bank root cannot credit",async()=>{
   await proof(a!,"deposit","wrong_root",3,971,"wallet:wrong_root",V,"deposit/wrong_root","D".repeat(64));
   await assert.rejects(()=>atomic(a!,()=>run(a!,
     "SELECT epoch_v3.credit_deposit($1,$2,$3,0,$4,$5,$6)",
     [E,"wrong_root",hash(971),uw(3),"wallet:wrong_root",V])),/BANK_PROOF_STALE_OR_ACCOUNT_RESERVE_DEFICIT/);
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.receipt_consumptions WHERE tx_hash=$1",[hash(971)])).rows[0].n,0);
  });
  await t.test("limited finance consumer can credit ONLY through definer stored function",async()=>{
   await proof(a!,"deposit","role_only",9,960,"wallet:role_only",V,"deposit/role_only");
   await run(a!,"SET ROLE epoch_v3_credit_consumer");
   try{
    await run(a!,"SELECT epoch_v3.credit_deposit($1,$2,$3,0,$4,$5,$6)",
      [E,"role_only",hash(960),uw(9),"wallet:role_only",V]);
    await assert.rejects(()=>run(a!,"UPDATE epoch_v3.positions SET available_uwolo=999"),/permission denied/);
   }finally{await run(a!,"RESET ROLE")}
   assert.equal((await pos(a!,"role_only")).a,uw(9));
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.receipt_consumptions WHERE tx_hash=$1",[hash(960)])).rows[0].n,1);
  });
  await t.test("schema ACLs default deny; physical unique and history immutable",async()=>{
   assert.equal((await run(a!,"SELECT coalesce(exists(select 1 from aclexplode(nspacl) where grantee=0 and privilege_type='USAGE'),false) pub FROM pg_namespace WHERE nspname='epoch_v3'")).rows[0].pub,false);
   await proof(a!,"deposit","alpha",1,90,"wallet:alpha",V,"test");
   await assert.rejects(()=>run(a!,"UPDATE epoch_v3.receipts SET amount_uwolo=3 WHERE tx_hash=$1",[hash(90)]),/IMMUTABLE_FINANCIAL_HISTORY/);
   await assert.rejects(()=>proof(a!,"deposit","beta",1,90,"wallet:beta",V,"test"),/duplicate key/);
  });
  await t.test("authenticated-candidate deposit credits once, replay under new operation cannot",async()=>{
   await atomic(a!,()=>credit(a!,"alpha",400,100));
   assert.equal((await pos(a!,"alpha")).a,uw(400));
   await assert.rejects(()=>atomic(a!,()=>run(a!,"SELECT epoch_v3.credit_deposit($1,$2,$3,0,$4,$5,$6)",[E,"alpha",hash(100),uw(400),"wallet:alpha",V])),/PHYSICAL_RECEIPT_ALREADY_CONSUMED/);
  });
  await t.test("one physical ticket funds TWO conserved market legs",async()=>{
   await fund(a!,"alpha",100,200,101);
   await atomic(a!,()=>admit(a!,"alpha",200,101,[leg(77,11,1,"left",40),leg(78,12,2,"left",60)]));
   assert.deepEqual((await run(a!,"SELECT principal_uwolo::text p FROM epoch_v3.allocations WHERE epoch_id=$1 AND ticket_id=200 ORDER BY market_id",[E])).rows.map(x=>x.p),[uw(40),uw(60)]);
   assert.deepEqual(await pos(a!,"alpha"),{a:uw(300),r:uw(100),p:"0"});
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.receipt_consumptions WHERE tx_hash=$1",[hash(101)])).rows[0].n,1);
  });
  await t.test("oversplit and changed ticket or owner never reassign a physical MsgSend",async()=>{
   await fund(a!,"alpha",50,201,102);
   await assert.rejects(()=>atomic(a!,()=>admit(a!,"alpha",201,102,[leg(80,20,6,"left",40),leg(81,21,7,"left",20)])),/TICKET_ALLOCATION_EXCEEDS_FUNDING/);
   await assert.rejects(()=>atomic(a!,()=>admit(a!,"beta",201,102,[leg(80,20,6,"left",50)])),/WRONG_OR_UNFUNDED_TICKET/);
   await assert.rejects(()=>atomic(a!,()=>admit(a!,"alpha",202,102,[leg(80,20,6,"left",50)])),/WRONG_OR_UNFUNDED_TICKET/);
   await atomic(a!,()=>admit(a!,"alpha",201,102,[leg(80,20,6,"left",50)]));
   await assert.rejects(()=>atomic(a!,()=>admit(a!,"alpha",201,102,[leg(80,20,6,"left",50)])),/PHYSICAL_RECEIPT_ALREADY_CONSUMED/);
  });
  await t.test("parallel SQL transactions consume the same receipt exactly once",async()=>{
   await fund(a!,"alpha",10,220,103);
   const results=await Promise.allSettled([atomic(a!,()=>admit(a!,"alpha",220,103,[leg(90,33,100,"left",10)])),atomic(b!,()=>admit(b!,"alpha",220,103,[leg(90,33,100,"left",10)]))]);
   assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.tickets WHERE ticket_id=220")).rows[0].n,1);
  });
  await t.test("settle exact 2% matched only; native physical return consumes liability once",async()=>{
   await atomic(a!,()=>credit(a!,"beta",40,104));await fund(a!,"beta",40,300,105);
   await atomic(a!,()=>admit(a!,"beta",300,105,[leg(77,21,3,"right",40)]));
   const outcomes=[{ticket_id:200,leg_id:11,wager_id:1,owner_uid:"alpha",amount_uwolo:uw(78),fee_uwolo:uw(2),kind:"matched_payout"},{ticket_id:300,leg_id:21,wager_id:3,owner_uid:"beta",amount_uwolo:"0",fee_uwolo:"0",kind:"lost"}];
   await atomic(a!,()=>run(a!,"SELECT epoch_v3.settle_market($1,77,'left',$2,$3,$4::jsonb)",[E,sha,sha,JSON.stringify(outcomes)]));
   assert.deepEqual(await pos(a!,"alpha"),{a:uw(240),r:uw(120),p:uw(78)});
   assert.deepEqual(await pos(a!,"beta"),{a:"0",r:"0",p:"0"});
   const ent="satchel:e3:"+E+":entitlement:77:200:11";
   await proof(a!,"escrow_return","alpha",78,106,S,V,"aoe2war/satchel/epoch-v3/"+E+"/return/"+ent);
   const doReturn=()=>run(a!,"SELECT epoch_v3.reconcile_return($1,$2,$3,0,$4,$5,$6,$7)",[E,ent,hash(106),uw(78),S,V,ent+":return"]);
   await atomic(a!,doReturn);
   assert.deepEqual(await pos(a!,"alpha"),{a:uw(318),r:uw(120),p:"0"});
   assert.equal((await run(a!,"SELECT exact FROM epoch_v3.position_reconciliation WHERE epoch_id=$1 AND owner_uid='alpha'",[E])).rows[0].exact,true);
   await assert.rejects(()=>atomic(a!,doReturn),/PHYSICAL_RECEIPT_ALREADY_CONSUMED/);
  });
  await t.test("CAS durable before-sign fence, stale version and UNKNOWN_NO_REPLAY irreversible",async()=>{
   const op="satchel:e3:"+E+":220";
   assert.equal((await atomic(a!,()=>run(a!,"SELECT epoch_v3.transition_operation($1,$2,0,'PREPARED_UNSIGNED','ATTEMPT_FENCED') v",[E,op])) as pg.QueryResult).rows[0].v,1);
   await assert.rejects(()=>atomic(a!,()=>run(a!,"SELECT epoch_v3.transition_operation($1,$2,0,'PREPARED_UNSIGNED','ATTEMPT_FENCED')",[E,op])),/STALE_OPERATION_VERSION/);
   await atomic(a!,()=>run(a!,"SELECT epoch_v3.transition_operation($1,$2,1,'ATTEMPT_FENCED','SIGNED_UNKNOWN')",[E,op]));
   await atomic(a!,()=>run(a!,"SELECT epoch_v3.transition_operation($1,$2,2,'SIGNED_UNKNOWN','UNKNOWN_NO_REPLAY')",[E,op]));
   await assert.rejects(()=>atomic(a!,()=>run(a!,"SELECT epoch_v3.transition_operation($1,$2,3,'UNKNOWN_NO_REPLAY','ATTEMPT_FENCED')",[E,op])),/UNKNOWN_NO_REPLAY/);
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.operation_transitions WHERE operation_id=$1",[op])).rows[0].n,3);
  });
  await t.test("bound chain UTC time cannot be shifted to a different daily quota",async()=>{
   await fund(a!,"alpha",1,700,700);
   await assert.rejects(()=>atomic(a!,()=>run(a!,"SELECT epoch_v3.admit_ticket($1,$2,$3,$4,0,$5,$6,$7::jsonb)",[E,"alpha",700,hash(700),"2026-10-28",sha,JSON.stringify([leg(170,1,170,"left",1)])])),/WRONG_OR_UNFUNDED_TICKET/);
  });
  await t.test("two distinct tickets race across same owner/day cap; exactly one can take final 10k",async()=>{
   await atomic(a!,()=>credit(a!,"delta",50000,600));
   for(let i=0;i<4;i++){await fund(a!,"delta",10000,610+i,610+i);await atomic(a!,()=>admit(a!,"delta",610+i,610+i,[leg(310+i,1,310+i,"left",10000)]));}
   await fund(a!,"delta",10000,620,620);await fund(a!,"delta",10000,621,621);
   const results=await Promise.allSettled([
    atomic(a!,()=>admit(a!,"delta",620,620,[leg(420,1,420,"left",10000)])),
    atomic(b!,()=>admit(b!,"delta",621,621,[leg(421,1,421,"left",10000)]))
   ]);
   assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
   assert.equal((await run(a!,"SELECT used_uwolo::text n FROM epoch_v3.daily_reservations WHERE epoch_id=$1 AND owner_uid='delta'",[E])).rows[0].n,uw(50000));
   assert.equal((await run(a!,"SELECT count(*)::int n FROM epoch_v3.tickets WHERE epoch_id=$1 AND owner_uid='delta'",[E])).rows[0].n,5);
  });
  await t.test("10k ticket and 50k owner-day are real guarded DB constraints",async()=>{
   await atomic(a!,()=>credit(a!,"gamma",51000,300));
   for(let i=1;i<=5;i++){await fund(a!,"gamma",10000,400+i,310+i);await atomic(a!,()=>admit(a!,"gamma",400+i,310+i,[leg(100+i,1,200+i,"left",10000)]));}
   assert.equal((await run(a!,"SELECT used_uwolo::text n FROM epoch_v3.daily_reservations WHERE epoch_id=$1 AND owner_uid='gamma'",[E])).rows[0].n,uw(50000));
   await fund(a!,"gamma",1000,500,399);
   await assert.rejects(()=>atomic(a!,()=>admit(a!,"gamma",500,399,[leg(200,1,500,"left",1000)])),/DAILY_CAP/);
  });
 }finally{
  await Promise.allSettled([a?.end(),b?.end()]);
  if(started)try{execFileSync(ctl,["-D",data,"-m","immediate","-w","stop"],{stdio:"pipe"});}catch{}
  rmSync(root,{recursive:true,force:true});
 }
});
