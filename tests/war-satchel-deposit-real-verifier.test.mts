import assert from "node:assert/strict";
import test from "node:test";
import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,realpathSync} from "node:fs";
import path from "node:path";
import pg from "pg";
import {PrismaPg} from "@prisma/adapter-pg";
import {PrismaClient} from "@/lib/generated/prisma";
import {authenticateOwnerDeposit,isAuthenticatedWarSatchelDeposit} from "../lib/warSatchelAuthenticatedDeposit.ts";
import {creditRecordedSatchelProof,readRecordedSatchelCredit} from "../lib/warSatchelFundedLedger.ts";
import {createHash} from "node:crypto";

test("real signed SDK deposit authenticates then credits the linked HD owner exactly once", {skip:process.env.RUN_SATCHEL_REAL_CREDIT_TESTS!=="1"},async t=>{
  const binary=process.env.SATCHEL_TEST_BINARY!;
  const fixture=JSON.parse(readFileSync(path.join(path.dirname(binary),"isolated-sdk-proof.json"),"utf8"));
  assert.equal(fixture.fixture_only,true);assert.equal(fixture.mainnet_authority,false);
  const i=fixture.intent,o=fixture.deposit_observation;
  // HD persists JavaScript millisecond ISO strings, including a .000 suffix.
  // Go RFC3339Nano may omit it; reconstruct the actual durable HD context.
  i.CreatedAt=new Date(i.CreatedAt).toISOString();i.ExpiresAt=new Date(i.ExpiresAt).toISOString();
  const root=realpathSync(mkdtempSync("/tmp/hd-credit-postgres-"));
  const socket=path.join(root,"socket"),data=path.join(root,"data");mkdirSync(socket,{mode:0o700});
  const authority=path.join(root,"authority.json");
  const publicFixture=JSON.parse(readFileSync(new URL("fixtures/satchel-financial-bridge-v1.json",import.meta.url),"utf8"));
  writeFileSync(authority,JSON.stringify({trust_anchor:fixture.anchor,vault:i.Vault,betting_escrow:publicFixture.betting_escrow,approval_public_key_hex:publicFixture.approval_public_key_hex}),{mode:0o600});
  const context={protocol:1,kind:"deposit",owner_id:i.OwnerID,sender:i.Sender,recipient:i.Vault,amount_uwolo:i.AmountUWolo,memo:i.Memo,tx_hash:o.TxHash,created_at:i.CreatedAt,expires_at:i.ExpiresAt};
  const envelope={protocol:1,chain_id:"wolo-1",denom:"uwolo",context,context_digest:createHash("sha256").update(JSON.stringify(context)).digest("hex"),tx_hash:o.TxHash,receipt_id:`wolo-1:${o.TxHash}:0`,transfer_index:0,message_index:0,height:o.Height,block_hash:o.BlockHash,consensus_authenticated:true,credit_authorized:false,proof:fixture.deposit_proof};
  const expected={intentId:"00000000-0000-4000-8000-000000000001",ownerUid:i.OwnerID,sender:i.Sender,vault:i.Vault,amountUwolo:i.AmountUWolo,memo:i.Memo,createdAtUtc:i.CreatedAt,expiresAtUtc:i.ExpiresAt,txHash:o.TxHash};
  Object.assign(process.env,{WAR_SATCHEL_PROOF_VERIFIER_ENABLED:"true",WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED:"true",WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS:i.Vault,WAR_SATCHEL_SIGNER_AUTH_TOKEN:"t".repeat(64),WAR_SATCHEL_VERIFIER_BINARY:binary,WAR_SATCHEL_VERIFIER_AUTHORITY_FILE:authority,WAR_SATCHEL_VERIFIER_SHA256:process.env.SATCHEL_TEST_BINARY_SHA256,WAR_SATCHEL_FUNDED_LEDGER_ENABLED:"true",WOLO_BET_ESCROW_ADDRESS:publicFixture.betting_escrow,WOLO_BET_PAYOUT_ADDRESS:i.Sender});
  const reader=(body:unknown)=>(async(url,options)=>{
    assert.equal(url,"http://127.0.0.1:8094/satchel/v1/proofs/deposit");assert.equal(options?.method,"POST");
    return new Response(JSON.stringify(body),{status:200});
  }) as typeof fetch;
  const authenticated=await authenticateOwnerDeposit(expected,reader(envelope));
  assert.equal(isAuthenticatedWarSatchelDeposit(authenticated),true);
  assert.equal(isAuthenticatedWarSatchelDeposit({...authenticated}),false,"copying the private symbol is insufficient");
  assert.equal(isAuthenticatedWarSatchelDeposit(JSON.parse(JSON.stringify(envelope))),false);
  await t.test("forged chain, denom, success, ownership, amount and finality fail independent verification",async()=>{
    for(const mode of ["chain","denom","result","hash","amount","owner","vault","pending","REST"]){
      const bad=structuredClone(envelope),want={...expected};
      if(mode==="chain")bad.chain_id="not-wolo";
      if(mode==="denom")bad.denom="stake";
      if(mode==="hash")want.txHash="A".repeat(64);
      if(mode==="amount")want.amountUwolo="1";
      if(mode==="owner"){want.ownerUid="another-owner";want.memo="aoe2war/satchel/v1/another-owner/abcdefghijklmnop";}
      if(mode==="vault"){want.vault=i.Sender;}
      if(mode==="result")for(const r of bad.proof.responses)if(r.path==="/tx")r.body.result.tx_result.code=7;
      if(mode==="pending")for(const r of bad.proof.responses)if(r.path==="/status")r.body.result.sync_info.latest_block_height="100";
      if(mode==="REST")bad.proof.responses=bad.proof.responses.filter((r:{source:string})=>r.source==="rest");
      await assert.rejects(authenticateOwnerDeposit(want,reader(bad)),undefined,mode);
    }
  });
  const bin=process.env.AOE2WAR_TEST_PG_BIN||"/opt/homebrew/opt/postgresql@16/bin";
  let started=false;let sql:pg.Client|undefined;let db:PrismaClient|undefined;
  try{
    execFileSync(path.join(bin,"initdb"),["-D",data,"-U","credit_fixture","--auth-local=trust","--auth-host=reject"],{stdio:"pipe"});
    execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-l",path.join(root,"server.log"),"-o",`-h '' -k ${socket} -c timezone=UTC`,"-w","start"],{stdio:"pipe"});started=true;
    sql=new pg.Client({host:socket,user:"credit_fixture",database:"postgres"});await sql.connect();
    await sql.query("CREATE TABLE users(id int PRIMARY KEY,uid text,wallet_address text); CREATE TABLE bet_auto_presets(id int PRIMARY KEY); CREATE TABLE bet_auto_executions(id int PRIMARY KEY); CREATE TABLE pending_wolo_claims(id int PRIMARY KEY)");
    const migrations=["20261014_103500_war_satchel_noncrediting_foundation","20261014_133000_war_satchel_wallet_owner_challenges","20261014_150000_war_satchel_simulated_double_entry","20261014_164500_war_satchel_simulation_concurrency_guard","20261014_191500_war_satchel_simulation_single_owner","20261015_151500_war_satchel_simulation_guard_correction","20261017_012000_war_satchel_funded_ledger_foundation","20261018_020000_war_satchel_physical_receipt_consumption"];
    for(const m of migrations)await sql.query(readFileSync(new URL("../prisma/migrations/"+m+"/migration.sql",import.meta.url),"utf8"));
    await sql.query("INSERT INTO users VALUES(1,$1,$2)",[i.OwnerID,i.Sender]);
    await sql.query("INSERT INTO war_satchel_deposit_intents(id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,created_at,expires_at) VALUES($1,1,$2,$3,$4,$5,'abcdefghijklmnop',$6,$7)",[expected.intentId,i.Sender,i.Vault,i.AmountUWolo,i.Memo,i.CreatedAt,i.ExpiresAt]);
    await sql.query("INSERT INTO war_satchel_proof_candidates(intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at) VALUES($1,1,'wolo-1',$2,0,$3,$4,$5,$6,now())",[expected.intentId,o.TxHash,i.Sender,i.Vault,i.AmountUWolo,o.Height]);
    const adapter=()=>new PrismaPg({host:socket,user:"credit_fixture",database:"postgres"});
    db=new PrismaClient({adapter:adapter()});
    const input={ownerUserId:1,ownerUid:i.OwnerID,proofCandidateId:BigInt(1),expectedTxHash:o.TxHash,authenticatedDeposit:authenticated,bank:{chainId:"wolo-1" as const,denom:"uwolo" as const,vaultAddress:i.Vault,balanceUwolo:BigInt(i.AmountUWolo),height:BigInt(102),observedAtMs:Date.now()}};
    await t.test("a failure after receipt insertion rolls back consumption, journal and balance",async()=>{
      await sql!.query("CREATE FUNCTION fixture_journal_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated crash after receipt'; END $$; CREATE TRIGGER fixture_crash BEFORE INSERT ON war_satchel_funded_journal FOR EACH ROW EXECUTE FUNCTION fixture_journal_failure()");
      await assert.rejects(creditRecordedSatchelProof(db!,input),/isolated crash after receipt/);
      assert.equal((await sql!.query("SELECT count(*) FROM war_satchel_physical_receipt_consumptions")).rows[0].count,"0");
      assert.equal((await sql!.query("SELECT count(*) FROM war_satchel_funded_receipts")).rows[0].count,"0");
      await sql!.query("DROP TRIGGER fixture_crash ON war_satchel_funded_journal");
    });
    await t.test("legitimate owner credit succeeds and concurrent retries cannot increment it twice",async()=>{
      const first=await creditRecordedSatchelProof(db!,input);assert.equal(first.status,"credited");assert.equal(first.availableUwolo,i.AmountUWolo);
      const results=await Promise.allSettled(Array.from({length:6},()=>creditRecordedSatchelProof(db!,input)));
      assert.ok(results.some(r=>r.status==="fulfilled"&&r.value.status==="already_credited"));
      assert.equal((await sql!.query("SELECT count(*) FROM war_satchel_funded_receipts")).rows[0].count,"1");
      assert.equal((await sql!.query("SELECT count(*) FROM war_satchel_funded_journal")).rows[0].count,"1");
      assert.equal((await sql!.query("SELECT available_uwolo FROM war_satchel_funded_balances")).rows[0].available_uwolo,i.AmountUWolo);
    });
    await db.$disconnect();db=new PrismaClient({adapter:adapter()});
    await t.test("restart returns durable credit without re-verifying or resending expired evidence",async()=>{
      const retry=await readRecordedSatchelCredit(db!,{ownerUserId:1,ownerUid:i.OwnerID,intentId:expected.intentId,txHash:o.TxHash});
      assert.equal(retry?.status,"already_credited");assert.equal(retry?.availableUwolo,i.AmountUWolo);
      await assert.rejects(readRecordedSatchelCredit(db!,{ownerUserId:1,ownerUid:"another-owner",intentId:expected.intentId,txHash:o.TxHash}));
      await assert.rejects(readRecordedSatchelCredit(db!,{ownerUserId:1,ownerUid:i.OwnerID,intentId:expected.intentId,txHash:"B".repeat(64)}));
    });
    await t.test("partial historical receipt cannot masquerade as a committed credit",async()=>{
      const partialId="00000000-0000-4000-8000-000000000002",partialHash="C".repeat(64);
      await sql!.query("INSERT INTO war_satchel_deposit_intents(id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,created_at,expires_at) VALUES($1,1,$2,$3,$4,$5,'incomplete_receipt_nonce_1234',$6,$7)",[partialId,i.Sender,i.Vault,i.AmountUWolo,i.Memo+"/incomplete",i.CreatedAt,i.ExpiresAt]);
      const partial=await sql!.query("INSERT INTO war_satchel_proof_candidates(intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at) VALUES($1,1,'wolo-1',$2,0,$3,$4,$5,$6,now()) RETURNING id",[partialId,partialHash,i.Sender,i.Vault,i.AmountUWolo,o.Height]);
      await sql!.query("INSERT INTO war_satchel_funded_receipts(owner_user_id,proof_candidate_id,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height) VALUES(1,$1,'wolo-1',$2,0,$3,$4,$5)",[partial.rows[0].id,partialHash,i.AmountUWolo,i.Vault,o.Height]);
      await assert.rejects(readRecordedSatchelCredit(db!,{ownerUserId:1,ownerUid:i.OwnerID,intentId:partialId,txHash:partialHash}),/incomplete_recorded_deposit_credit/);
      assert.equal((await sql!.query("SELECT available_uwolo FROM war_satchel_funded_balances")).rows[0].available_uwolo,i.AmountUWolo);
    });
  }finally{
    if(db)await db.$disconnect();if(sql)await sql.end();
    if(started)execFileSync(path.join(bin,"pg_ctl"),["-D",data,"-m","immediate","-w","stop"],{stdio:"pipe"});
    rmSync(root,{recursive:true,force:true});
  }
});
