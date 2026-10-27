import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {ingestNativeVerifiedV3Receipt,EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED,
  EPOCH_V3_NATIVE_SOURCE_PIN,validateNativeV3WireShape} from "../lib/warSatchelEpochV3NativePgIngest.ts";

test("Phase7 held native-Comet verifier refuses ALL inputs before any PG query or legacy fallback",async()=>{
 let calls=0;
 const pg={query:async(_q:string,_v?:unknown[])=>{calls++;throw Error("UNEXPECTED_POSTGRES_OR_PAYMENT_OPERATION")}};
 const cfg={binaryPath:"/tmp/fake-woloescrowd",binarySha256:"a".repeat(64),
   trustAnchorSha256:"b".repeat(64),observedWoloSource:EPOCH_V3_NATIVE_SOURCE_PIN,
   expectedEpoch:"epoch_20261027_funding",expectedOwnerUid:"warrior:alpha",
   expectedTxHash:"C".repeat(64),expectedMessageIndex:0 as const,
   expectedPurpose:"wager_funding" as const,expectedEconomicKey:"ticket:55",
   expectedVaultAddress:"wolo1vault",expectedEscrowAddress:"wolo1escrow"};
 assert.equal(EPOCH_V3_NATIVE_PG_FINANCIAL_ENABLED,false);
 await assert.rejects(
  ()=>ingestNativeVerifiedV3Receipt(cfg,JSON.stringify({native_verdict:"COMET_ICS23_NATIVE_VERIFIED",
    bank_proof:true,credit_authorized:true,source:"legacy-8092",owner_uid:"warrior:alpha"}),pg),
  /NEW_ESCROW_NATIVE_VERIFIER_ABSENT/);
 assert.equal(calls,0);
});
test("Financial read-only preflight cannot manufacture GO when no auditor is enrolled",()=>{
 const src=fileURLToPath(new URL("../scripts/review/epoch_v3_readonly_production_preflight.mjs",import.meta.url));
 const p=spawnSync(process.execPath,[src],{encoding:"utf8",maxBuffer:256*1024,timeout:10000,
   env:{PATH:process.env.PATH||"",NODE_ENV:"test"}});
 assert.equal(p.status,2);
 const x=JSON.parse(p.stdout);
 assert.equal(x.financial_admission,"HOLD");
 assert.equal(x.real_money_authorized,false);
 assert.equal(x.database.queried,false);
 assert.equal(x.actual_native_bank_proof_authenticated_by_this_process,false);
 assert.ok(x.findings.some((f:{code:string})=>f.code==="AUDITOR_CONNECTION_UNAVAILABLE"));
 assert.ok(x.findings.some((f:{code:string})=>f.code==="HISTORICAL_HD_DE_LIABILITIES_UNKNOWN"));
});

test("Phase8 Go wire v1 is structurally pinned to one native MsgSend and both bank accounts",()=>{
 // Synthetic shape-negative fixture ONLY. It never represents actual native
 // SDK/Comet evidence and cannot enter a database or release financial flags.
 const cfg={binaryPath:"/root/bin/escrow-v3-verifier",binarySha256:"a".repeat(64),
   trustAnchorSha256:"b".repeat(64),observedWoloSource:EPOCH_V3_NATIVE_SOURCE_PIN,
   expectedEpoch:"epoch_20261027_funding",expectedOwnerUid:"warrior:alpha",
   expectedTxHash:"C".repeat(64),expectedMessageIndex:0 as const,
   expectedPurpose:"wager_funding" as const,expectedEconomicKey:"ticket:55",
   expectedVaultAddress:"wolo1vault",expectedEscrowAddress:"wolo1escrow"};
 const now=Date.now(),observed=new Date(now-5000).toISOString(),
  expires=new Date(now+50000).toISOString();
 const bank=(role:string,account:string)=>({
  account_role:role,account,bank_state_height:1502,bank_commit_height:1503,
  block_sha256:"D".repeat(64),app_sha256:"E".repeat(64),
  proof_sha256:"f".repeat(64),inventory_sha256:"a".repeat(64),
  nonoverlap_sha256:"b".repeat(64),
  bank_balance_uwolo:"9000000000",liabilities_uwolo:"1000000",
  maximum_unknown_outflow_uwolo:"0",gas_uwolo:"1",operating_floor_uwolo:"1"
 });
 const good={
  wire_version:1,protocol:"aoe2war/escrow-epoch/v3",
  native_verdict:"COMET_ICS23_NATIVE_VERIFIED",legacy_payment_authorized:false,
  chain_id:"wolo-1",denom:"uwolo",epoch_id:cfg.expectedEpoch,owner_uid:cfg.expectedOwnerUid,
  purpose:"wager_funding",economic_key:"ticket:55",
  tx_hash:cfg.expectedTxHash,message_index:0,message_ordinal_kind:"SDK_MSG_SEND",
  tx_success_proven:true,native_consensus_authenticated:true,native_ics23_authenticated:true,
  native_verifier_source:cfg.observedWoloSource,native_verifier_binary_sha256:cfg.binarySha256,
  trust_anchor_sha256:cfg.trustAnchorSha256,raw_proof_bundle_sha256:"c".repeat(64),
  owner_mandate_authenticated:true,bank_state_height:1502,bank_commit_height:1503,
  primary_head_height:1503,witness_head_height:1503,
  funding_height:1500,block_sha256:"D".repeat(64),app_sha256:"E".repeat(64),
  observed_at:observed,expires_at:expires,chain_time:observed,proof_sha256:"d".repeat(64),
  verification_record_sha256:"e".repeat(64),
  sender:"wolo1vault",recipient:"wolo1escrow",memo:"aoe2war/satchel/epoch-v3/epoch_20261027_funding/ticket/55",
  amount_uwolo:"100000000",original_funding_principal_uwolo:"100000000",
  funding_message_count:1,vault_address:"wolo1vault",escrow_address:"wolo1escrow",
  vault_bank:bank("vault","wolo1vault"),escrow_bank:bank("escrow","wolo1escrow")
 };
 assert.equal(validateNativeV3WireShape(good,cfg,"c".repeat(64)).v.tx_hash,cfg.expectedTxHash);
 const mutations:Array<[string,(x:any)=>void]>=[
  ["chain",x=>x.chain_id="cosmoshub-4"],["ordinal",x=>x.message_index=1],
  ["receipt",x=>x.tx_hash="B".repeat(64)],["owner",x=>x.owner_uid="another"],
  ["economic",x=>x.economic_key="ticket:56"],["purpose",x=>x.purpose="deposit"],
  ["denom",x=>x.denom="atom"],["principal",x=>x.original_funding_principal_uwolo="200000000"],
  ["message_count",x=>x.funding_message_count=2],["head",x=>x.witness_head_height=1504],
  ["root",x=>x.escrow_bank.app_sha256="F".repeat(64)],
  ["balance",x=>x.vault_bank.bank_balance_uwolo="1"],
  ["sdk_flag",x=>x.native_consensus_authenticated=false],
  ["anchor",x=>x.trust_anchor_sha256="0".repeat(64)],
  ["recipient",x=>x.recipient="wolo1attacker"],
  ["freshness",x=>x.expires_at=new Date(now-1000).toISOString()],
  ["wire_version",x=>x.wire_version=2]
 ];
 for(const [name,mutate] of mutations){
  const changed=structuredClone(good);mutate(changed);
  assert.throws(()=>validateNativeV3WireShape(changed,cfg,"c".repeat(64)),/EPOCH_V3_NATIVE_INGEST_HOLD/,name);
 }
});
