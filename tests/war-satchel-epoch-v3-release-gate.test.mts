import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {EPOCH_V3_EXECUTION_ENABLED,EPOCH_V3_WITNESS_DOMAIN,
  evaluateHeldEpochV3Release,heldEpochV3Port,epochV3Diagnostic,v3WitnessMessage,
  type EpochWitnessRole,type EpochWitness,type EpochPinnedWitnessKey
} from "../lib/warSatchelEpochV3ReleaseGate.ts";
import {EPOCH_V3_DURABLE_WRITER_INSTALLED,proposeEpochOperationTransition,
  inspectEpochDailyWagerCandidate,inspectUncreditedPhysicalConsumption
} from "../lib/warSatchelEpochV3Durability.ts";
import {NEW_EPOCH_HD_MAINNET_ENABLED} from "../lib/warSatchelNewEpochFinancialContracts.ts";

const epoch="epoch_20261026_scope_1", commit="a".repeat(40),now=1793069000000,
  appHash="b".repeat(64),certHash="c".repeat(64),vault="wolo1"+"q".repeat(38),escrow="wolo1"+"p".repeat(38);
const roles:EpochWitnessRole[]=["native_chain","bank_vault","bank_escrow","custody_vault","custody_escrow","writer_fence","owner_approval","finance_census","recovery"];
function evidence(role:EpochWitnessRole):Record<string,unknown> {
  if (role==="native_chain") return {height:"2001",commitHeight:"2002",appHash,
    commitHash:certHash,nativeIcs23Verified:true,trustedCometHeaderVerified:true};
  if(role==="bank_vault"||role==="bank_escrow")return {accountRole:role==="bank_vault"?"vault":"escrow",
    height:"2001",appHash,nativeBankProofVerified:true,accountAddressSha256:"d".repeat(64),
    spendableUwolo:"1000000",uniqueLiabilitiesUwolo:"500000",maxUnknownUwolo:"200000",
    gasReserveUwolo:"100",operatingFloorUwolo:"100",proposedDebitUwolo:"100"};
  if(role==="custody_vault")return {publicKeySha256:"1".repeat(64),keyringLineageSha256:"2".repeat(64),
    nativeAddressDerived:true,legacySignersExcluded:true,escrowSignerExcluded:true};
  if(role==="custody_escrow")return {publicKeySha256:"3".repeat(64),keyringLineageSha256:"4".repeat(64),
    nativeAddressDerived:true,legacySignersExcluded:true,vaultSignerExcluded:true};
  if(role==="writer_fence")return {allFinancialWriterSurfacesExcluded:true,
    cronContainersExternalCovered:true,legacy8092Excluded:true};
  if(role==="owner_approval")return {explicitTransactionScope:true,offhostNonceReserved:true,
    permitDigest:"e".repeat(64)};
  if(role==="finance_census")return {hdDeUnfilteredReadOnly:true,oldAmbiguousLiabilitiesPreserved:true,
    noLegacySourceCanDebitNewAccounts:true,overlappingRecordsReconciled:true};
  return {fullHdDeRestoreVerified:true,writerFenceRevocable:true};
}
function packet(change?:{role:EpochWitnessRole;field:string;value:unknown}) {
  const material=roles.map(role=>{const key=generateKeyPairSync("ed25519");
    const pub=key.publicKey.export({type:"spki",format:"pem"}).toString();
    const der=key.publicKey.export({type:"spki",format:"der"}) as Buffer;
    return {role,pub,key,sha:createHash("sha256").update(der).digest("hex")};
  });
  const pinnedKeys:EpochPinnedWitnessKey[]=material.map(m=>({role:m.role,
    publicKeySpkiPem:m.pub,expectedKeySha256:m.sha}));
  const witnesses:EpochWitness[]=material.map(m=>{
    const statement:EpochWitness={
      domain:EPOCH_V3_WITNESS_DOMAIN,role:m.role,epochId:epoch,chainId:"wolo-1",
      observedAtMs:now-1000,expiresAtMs:now+50000,sourceCommit:commit,
      evidence:{...evidence(m.role),...(change?.role===m.role?{[change.field]:change.value}:{})},
      signatureBase64:""};
    return {...statement,signatureBase64:sign(null,Buffer.from(v3WitnessMessage(statement)),m.key.privateKey).toString("base64")};
  });
  return {bundle:{epochId:epoch,sourceCommit:commit,observedAtMs:now,witnesses},
    pinnedKeys,expectedEpochId:epoch,expectedSourceCommit:commit,nowMs:now};
}
const inspect=(p:ReturnType<typeof packet>)=>evaluateHeldEpochV3Release(p);
const has=(p:ReturnType<typeof packet>,code:string)=>assert.ok(inspect(p).findings.some(x=>x.code===code),code);

test("nine genuinely Ed25519 signed synthetic witnesses never grant native chain or financial GO",()=>{
  const result=inspect(packet());
  assert.equal(result.verifiedRoleSignatures,9);
  assert.equal(result.level,"BLOCKED");
  assert.equal(result.releaseAuthorized,false);
  assert.equal(result.nativeChainProofAuthenticated,false);
  assert.ok(result.findings.some(x=>x.code==="NATIVE_EXECUTOR_MISSING"));
  assert.equal(EPOCH_V3_EXECUTION_ENABLED,false);
  assert.equal(NEW_EPOCH_HD_MAINNET_ENABLED,false);
  assert.equal(EPOCH_V3_DURABLE_WRITER_INSTALLED,false);
});

test("signed tampering after signature and malformed source pin reject",()=>{
  const p=packet(),bad=p.bundle.witnesses[0];
  p.bundle.witnesses[0]={...bad,evidence:{...bad.evidence,height:"999"}};
  has(p,"WITNESS_INVALID");
  has({...packet(),expectedSourceCommit:"0".repeat(40)},"INVALID_EPOCH");
});

test("synthetic signer collision and shared keyring refuse even when signed",()=>{
  has(packet({role:"custody_escrow",field:"publicKeySha256",value:"1".repeat(64)}),"SIGNER_COLLISION");
  has(packet({role:"custody_escrow",field:"keyringLineageSha256",value:"2".repeat(64)}),"SIGNER_COLLISION");
  has(packet({role:"custody_vault",field:"legacySignersExcluded",value:false}),"SIGNER_COLLISION");
});
test("vault and escrow shortages independently refuse; cannot net vault surplus",()=>{
  has(packet({role:"bank_escrow",field:"spendableUwolo",value:"699999"}),"RESERVE_DEFICIT");
  has(packet({role:"bank_vault",field:"maxUnknownUwolo",value:null}),"RESERVE_DEFICIT");
  has(packet({role:"bank_vault",field:"gasReserveUwolo",value:"0"}),"RESERVE_DEFICIT");
});
test("stale or equivocal H/H+1 bank source and phony native flags refuse",()=>{
  has(packet({role:"native_chain",field:"commitHeight",value:"2004"}),"STALE_BANK_PROOF");
  has(packet({role:"bank_escrow",field:"appHash",value:"7".repeat(64)}),"STALE_BANK_PROOF");
  has(packet({role:"bank_vault",field:"nativeBankProofVerified",value:false}),"STALE_BANK_PROOF");
  has(packet({role:"native_chain",field:"nativeIcs23Verified",value:false}),"STALE_BANK_PROOF");
});
test("legacy writer exclusion and full HD-DE history lack proof",()=>{
  has(packet({role:"writer_fence",field:"cronContainersExternalCovered",value:false}),"WRITER_FENCE_MISSING");
  has(packet({role:"finance_census",field:"oldAmbiguousLiabilitiesPreserved",value:false}),"FINANCE_CENSUS_MISSING");
  has(packet({role:"finance_census",field:"overlappingRecordsReconciled",value:false}),"FINANCE_CENSUS_MISSING");
});
test("missing solo owner permit, durable offhost nonce, backup+restore all HOLD",()=>{
  has(packet({role:"owner_approval",field:"explicitTransactionScope",value:false}),"OWNER_APPROVAL_MISSING");
  has(packet({role:"owner_approval",field:"offhostNonceReserved",value:false}),"OWNER_APPROVAL_MISSING");
  has(packet({role:"recovery",field:"fullHdDeRestoreVerified",value:false}),"RESTORE_UNVERIFIED");
});
test("expired or time-travel signatures and duplicate reviewer roles fail",()=>{
  const p=packet();
  has({...p,nowMs:now+190_000},"WITNESS_INVALID");
  const d=packet();d.bundle.witnesses[1]=d.bundle.witnesses[0];has(d,"WITNESS_INVALID");
});
test("Doctor evidence codes are stable, owner-specific and never healthy",()=>{
  for(const code of ["SIGNER_COLLISION","RESERVE_DEFICIT","INVALID_EPOCH","STALE_BANK_PROOF",
    "UNCERTAIN_BROADCAST","WRITER_FENCE_MISSING","OWNER_APPROVAL_MISSING",
    "FINANCE_CENSUS_MISSING","NATIVE_EXECUTOR_MISSING","RESTORE_UNVERIFIED"]) {
    const d=epochV3Diagnostic(code);
    assert.equal(d.severity,"BLOCKER");assert.ok(d.evidenceSource);
    assert.ok(d.recovery);assert.ok(d.domain);assert.ok(d.owner);
  }
  assert.throws(()=>epochV3Diagnostic("GREEN"),/DIAGNOSTIC_UNKNOWN/);
});
test("native v3 port refuses reads and has no legacy settlement fallback",async ()=>{
  const port=heldEpochV3Port();assert.equal(port.protocol,"aoe2war/escrow-epoch/v3");
  await assert.rejects(()=>port.operationLookupReadOnly("satchel:e3:ticket"),/NOT_CERTIFIED/);
  await assert.rejects(()=>port.nativeBankObservationReadOnly(epoch),/NOT_CERTIFIED/);
});
test("neither finance candidate module imports IO, signer, Prisma or runtime web routes",()=>{
  for(const path of ["../lib/warSatchelEpochV3ReleaseGate.ts","../lib/warSatchelEpochV3Durability.ts"]) {
    const txt=readFileSync(new URL(path,import.meta.url),"utf8");
    assert.doesNotMatch(txt,/from ["']@prisma|process\.env|signAndBroadcast\s*\(|submitOneShot\s*\(|fetch\s*\(|prisma\.\w+\.create\s*\(|prisma\.\w+\.update\s*\(/);
  }
});
const row=()=>({epochId:epoch,operationId:"satchel:e3:"+epoch+":200",ownerUid:"warrior:alpha",
  ticketId:200,version:3,state:"PREPARED_UNSIGNED" as const,
  immutableIntentSha256:"a".repeat(64),lastKnownTxHash:null});
test("durable pre-sign CAS proposes a fence only; no write authority",()=>{
 const p=proposeEpochOperationTransition(row(),"ATTEMPT_FENCED",3);
 assert.equal(p.expectedVersion,3);assert.equal(p.newVersion,4);
 assert.equal(p.writeAuthorized,false);assert.equal(p.retryAuthorized,false);
});
test("stale concurrent version must not generate two submissions",()=>{
 assert.throws(()=>proposeEpochOperationTransition(row(),"ATTEMPT_FENCED",2),/stale_or_invalid_version/);
 assert.throws(()=>proposeEpochOperationTransition({...row(),state:"ATTEMPT_FENCED"},
   "ATTEMPT_FENCED",3),/unsafe_transition/);
});
test("after-signer crash, uncertain broadcast never permits auto retry or synthetic finality",()=>{
 const r={...row(),state:"SIGNED_UNKNOWN" as const};
 const p=proposeEpochOperationTransition(r,"UNKNOWN_QUARANTINED",3);
 assert.equal(p.to,"UNKNOWN_QUARANTINED");
 assert.throws(()=>proposeEpochOperationTransition(r,"PREPARED_UNSIGNED",3),/unsafe_transition/);
 assert.throws(()=>proposeEpochOperationTransition({...row(),state:"BROADCAST_UNKNOWN"},
   "PROVEN_FINAL",3),/unsafe_transition/);
 assert.throws(()=>proposeEpochOperationTransition({...row(),state:"UNKNOWN_QUARANTINED"},
   "ATTEMPT_FENCED",3),/unsafe_transition/);
});
const request=(amount="100000000",ticketId=200)=>({
 authority:{
 chainId:"wolo-1" as const,epochId:epoch,hStar:"1000",vaultAddress:vault,escrowAddress:escrow,
 vaultSignerPubkeySha256:"1".repeat(64),escrowSignerPubkeySha256:"2".repeat(64),
 vaultKeyringLineageSha256:"3".repeat(64),escrowKeyringLineageSha256:"4".repeat(64),
 escrowPolicySha256:"5".repeat(64),installedEscrowPolicySha256:"5".repeat(64),
 escrowExecutorSha256:"6".repeat(64),escrowReturnApprovalKeySha256:"7".repeat(64),
 excludedLegacyAddresses:["wolo1"+"r".repeat(38)],excludedLegacySignerSha256:["8".repeat(64)],
 excludedLegacyKeyringLineageSha256:["9".repeat(64)],excludedLegacyEscrowPolicySha256:["a".repeat(64)],
 excludedLegacyExecutorSha256:["b".repeat(64)],excludedLegacyApprovalKeySha256:["c".repeat(64)],
 },ticketId,ownerUid:"warrior:alpha",amountUwolo:amount,firstEligibleHeight:"1001",legacyOperationIds:[]
});
const daily=(amount:string,prior:string,unknown:string)=>({
 request:request(amount),ownerUid:"warrior:alpha",utcDay:"2026-10-26",
 priorDailyCommittedUwolo:prior,unresolvedReservedUwolo:unknown,seenDailySourceOperationIds:[]
});
test("single bet 10k and combined UTC owner-day 50k with unresolved holds included",()=>{
 const exact=daily("10000000000","40000000000","0");
 const d=inspectEpochDailyWagerCandidate(exact);
 assert.equal(d.totalWithUncertainUwolo,"50000000000");
 assert.equal(d.spendAuthorized,false);
 assert.throws(()=>inspectEpochDailyWagerCandidate(daily("10000000000","40000000000","1")),"limit");
 assert.throws(()=>inspectEpochDailyWagerCandidate(daily("10000000001","0","0")),/NEW_EPOCH_HD_V3_HELD/);
});
test("owner/day mismatch, duplicate economic operation and invalid numeric limits",()=>{
 const d=daily("1000000","1","1");
 assert.throws(()=>inspectEpochDailyWagerCandidate({...d,ownerUid:"imposter"}),/owner_or_day/);
 assert.throws(()=>inspectEpochDailyWagerCandidate({...d,seenDailySourceOperationIds:["satchel:e3:"+epoch+":200"]}),/daily_operation_replay/);
 assert.throws(()=>inspectEpochDailyWagerCandidate({...d,unresolvedReservedUwolo:"-2"}),/invalid_integer/);
});
const physical=()=>({chainId:"wolo-1" as const,epochId:epoch,
 operationId:"satchel:e3:"+epoch+":200",ownerUid:"warrior:alpha",
 txHash:"A".repeat(64),messageIndex:0 as const,amountUwolo:"1000000",
 sender:vault,recipient:escrow,memo:"aoe2war/satchel/epoch-v3/"+epoch+"/ticket/200"});
test("physical-transaction candidate demands exact owner+epoch+ordinal and global uniqueness",()=>{
 const e=physical();const ok=inspectUncreditedPhysicalConsumption({
 source:e,expected:e,globallyConsumedKeys:[],epochConsumedOperations:[]});
 assert.equal(ok.creditAuthorized,false);
 assert.equal(ok.physicalKey,"wolo-1:"+"A".repeat(64)+":0");
 assert.throws(()=>inspectUncreditedPhysicalConsumption({source:{...e,ownerUid:"legacy_owner"},
  expected:e,globallyConsumedKeys:[],epochConsumedOperations:[]}),/physical_or_ownership_mismatch/);
 assert.throws(()=>inspectUncreditedPhysicalConsumption({source:e,expected:e,
  globallyConsumedKeys:[ok.physicalKey],epochConsumedOperations:[]}),/already_consumed/);
 assert.throws(()=>inspectUncreditedPhysicalConsumption({source:e,expected:e,
  globallyConsumedKeys:[],epochConsumedOperations:[e.operationId]}),/already_consumed/);
});
