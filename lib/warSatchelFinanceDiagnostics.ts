/** Finance-owned observations for Doctor/Kingdom/Inspections consumers.
 * No finding, JSON assertion, source score or cache can authorize money.
 * Native proof capabilities and the source financial HOLD remain authoritative.
 */
import type { InspectionCheck } from "./generalInspections/types.ts";
import {authenticatedWarSatchelBankFreshAt} from "./warSatchelAuthenticatedBank.ts";

export type FinanceDiagnosticState="OBSERVED"|"UNKNOWN"|"STALE"|"DRIFT"|"BLOCKED";
export type FinanceDiagnosticFinding=Readonly<{
 id:string;state:FinanceDiagnosticState;severity:"INFO"|"P1"|"P0";
 reason:string;detail:string;source:string;observedAt:string|null;ttlSeconds:number;
 authority:"OPERATOR_OBSERVATION"|"DATABASE_READ_ONLY"|"UNAUTHENTICATED_RPC"|"NATIVE_AUTHENTICATED_CHAIN"|"UNAVAILABLE";
 confidence:"SCOPED_OBSERVATION"|"UNPROVEN";
 owner:string;reproducer:string;automaticAction:"READ_ONLY";
}>;
export type FinanceDiagnostics=Readonly<{
 schema:"aoe2war.satchel-finance-observations.v1";generatedAt:string;
 status:"HOLD";financialAuthorized:false;custodyAuthorized:false;
 completeGlobalWriterCensus:false;globalSolvency:"UNKNOWN";
 scopedBankComparison:Readonly<{state:"UNKNOWN"|"COVERS_SCOPED_BUCKETS"|"BELOW_SCOPED_BUCKETS";commonAuthenticatedHeight:false}>;
 findings:readonly FinanceDiagnosticFinding[];
}>;
export type FinanceCensus=Readonly<{
 observedAt:string;availableUwolo:string;reservedUwolo:string;withdrawalPendingUwolo:string;
 ownerMismatchCount:number;negativeBucketCount:number;unknownReservations:number;
 unknownWithdrawals:number;frozenReservations:number;pendingRefunds:number;
 pendingWithdrawals:number;orphanCandidates:number;lastWatcherAt:string|null;lastReceiptAt:string|null;
}>;
export type FinanceEvidence=Readonly<{
 observedAt:string;sourceSha:string;publisher:string;
 build?:{expectedSource:string;runningSource:string;expectedBuild:string;runningBuild:string};
 writerRoster?:{expected:string;observed:string};
 signerRoles?:{execution:string;wagerReview:string;withdrawalReview:string};
 storage?:{rootFreeBytes:number;volumeFreeBytes:number;volumeUsedPercent:number};
 backup?:{capturedAt:string;restoredAt:string;offHostVerifiedAt:string;fullSize:boolean};
 recovery?:{sourceSha:string;observedAt:string;boundedMountVerified:boolean;pairedRecoveryObserved:boolean};
}>;
export type FinanceObservationInput=Readonly<{
 nowMs:number;collectionStartedAtMs:number;evidence?:unknown;census?:unknown;
 chain?:unknown;bank?:unknown;publisherConflict?:boolean;sourceError?:boolean;
 failureCode?:"COLLECTION_DEADLINE"|"COLLECTOR_CAPACITY_HELD"|"CANCELED";
}>;

const SPECS=[
 ["chain-age",90,"WoloChain operator","Canonical27657 head age and catch-up state; HTTP is not finality."],
 ["chain-trust",30,"WoloChain operator","A native authenticated commit/bank capability is required; cached JSON is not proof."],
 ["build-parity",120,"Release operator","Compare expected and observed source/build identities."],
 ["writer-roster",120,"Financial owner","Compare configured writer digests; equality is not a global census."],
 ["signer-roles",120,"Custody owner","Execution, wager review and withdrawal roles must remain separate."],
 ["watcher-freshness",30,"Watcher operator","Telemetry freshness does not authenticate original Watcher admission or owner/side."],
 ["ledger-conservation",120,"Financial owner","Compare every owner bucket with its journal; committed history is not vault liability."],
 ["bank-coverage",30,"Financial owner","Bank assets require native authenticated same-height proof and reconciliation."],
 ["global-obligations",120,"Financial owner","HD/DE/external/legacy claims, reserves and overlapping effects remain outside a local census."],
 ["unknown-broadcasts",120,"Settlement operator","Uncertain reservations/withdrawals require reconciliation; NEVER rebroadcast or release automatically."],
 ["frozen-reservations",120,"Settlement operator","Old unresolved reservations require an original-operation review."],
 ["refund-queue",120,"Settlement operator","Unfulfilled approved claim returns require proof review, not a retry."],
 ["withdrawal-queue",120,"Custody owner","Pending withdrawals require their original durable authorization and chain outcome."],
 ["orphan-deposits",120,"Financial owner","Uncredited proof candidates are review inputs, never spendable funds."],
 ["receipt-age",900,"Financial owner","Receipt absence or age does not establish bank outcome or a drained queue."],
 ["backup-freshness",86400,"Recovery operator","Capture, full-size isolated restoration and off-host verification are distinct observations."],
 ["storage-pressure",120,"Host operator","Storage observations preserve reserve capacity and cannot authorize cleanup."],
 ["recovery-readiness",3600,"Recovery operator","Bounded storage and paired recovery evidence do not authorize maintenance."],
] as const;
type RecordValue=Record<string,unknown>;
function row(value:unknown):RecordValue{return value!==null&&typeof value==="object"&&!Array.isArray(value)?value as RecordValue:{}}
function counter(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0}
function sha(value:unknown,n:number):value is string{return typeof value==="string"&&new RegExp("^[a-f0-9]{"+n+"}$").test(value)&&value!=="0".repeat(n)}
function build(value:unknown):value is string{return typeof value==="string"&&/^[A-Za-z0-9_.-]{8,128}$/.test(value)}
function amount(value:unknown):bigint|null{
 if(typeof value!=="string"||!/^(0|[1-9][0-9]{0,18})$/.test(value))return null;
 const n=BigInt(value);return n<=BigInt("9223372036854775807")?n:null;
}
function date(value:unknown):number|null{
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value))return null;
 const n=Date.parse(value);return Number.isFinite(n)?n:null;
}
function freshness(value:unknown,now:number,ttl:number):"fresh"|"stale"|"invalid"{
 const n=date(value);return n===null||n>now+5000?"invalid":now-n>ttl*1000?"stale":"fresh";
}

/** Pure diagnostics only. All mutable source timestamps are evaluated at END
 * of collection, including the census after its repeatable-read transaction. */
export function diagnoseSatchelFinance(input:FinanceObservationInput):FinanceDiagnostics{
 const validClock=Number.isSafeInteger(input.nowMs)&&input.nowMs>=0&&input.nowMs<=8640000000000000;
 const now=validClock?input.nowMs:0;
 const timeValid=validClock&&Number.isSafeInteger(input.collectionStartedAtMs)&&
  input.collectionStartedAtMs<=now&&now-input.collectionStartedAtMs<=6500;
 const findings:FinanceDiagnosticFinding[]=SPECS.map(([id,ttl,owner,detail])=>({
  id,state:"UNKNOWN",severity:"P1",reason:input.failureCode??(timeValid?"EVIDENCE_UNAVAILABLE":"COLLECTION_CLOCK_OR_BUDGET_INVALID"),
  detail,source:"unavailable",observedAt:null,ttlSeconds:ttl,authority:"UNAVAILABLE",confidence:"UNPROVEN",owner,
  reproducer:"node --experimental-strip-types scripts/observe-satchel-finance.mts --json",automaticAction:"READ_ONLY",
 }));
 function set(id:string,state:FinanceDiagnosticState,reason:string,source:string,observedAt:unknown,authority:FinanceDiagnosticFinding["authority"]){
  const i=findings.findIndex(f=>f.id===id);const f=findings[i];
  findings[i]={...f,state,reason,source,observedAt:date(observedAt)!==null?observedAt as string:null,
   authority,confidence:state==="OBSERVED"?"SCOPED_OBSERVATION":"UNPROVEN",severity:state==="OBSERVED"?"INFO":id==="unknown-broadcasts"&&state==="BLOCKED"?"P0":"P1"};
 }
 function admit(id:string,value:RecordValue,source:string,authority:FinanceDiagnosticFinding["authority"]){
  const ttl=findings.find(f=>f.id===id)!.ttlSeconds;
  const f=freshness(value.observedAt,now,ttl);
  if(f!=="fresh")set(id,f==="stale"?"STALE":"UNKNOWN",f==="stale"?"EVIDENCE_EXPIRED":"INVALID_OR_FUTURE_TIMESTAMP",source,value.observedAt,authority);
  return f==="fresh";
 }
 let bankComparison:"UNKNOWN"|"COVERS_SCOPED_BUCKETS"|"BELOW_SCOPED_BUCKETS"="UNKNOWN";
 if(timeValid){
  const c=row(input.chain);
  if(Object.keys(c).length&&admit("chain-age",c,"canonical-rpc27657","UNAUTHENTICATED_RPC")){
   if(c.chainId!=="wolo-1"||typeof c.height!=="string"||!/^[1-9][0-9]{0,18}$/.test(c.height)||typeof c.catchingUp!=="boolean")
    set("chain-age","UNKNOWN","INVALID_CHAIN_RESPONSE","canonical-rpc27657",c.observedAt,"UNAUTHENTICATED_RPC");
   else if(c.catchingUp)set("chain-age","BLOCKED","CHAIN_CATCHING_UP","canonical-rpc27657",c.observedAt,"UNAUTHENTICATED_RPC");
   else{const f=freshness(c.blockAt,now,90);set("chain-age",f==="fresh"?"OBSERVED":f==="stale"?"STALE":"UNKNOWN",f==="fresh"?"HEAD_OBSERVED_NOT_AUTHENTICATED":f==="stale"?"CHAIN_HEAD_STALE":"INVALID_OR_FUTURE_BLOCK_TIME","canonical-rpc27657",c.observedAt,"UNAUTHENTICATED_RPC");}
  }
  const e=row(input.evidence);
  const evidenceIds=["build-parity","writer-roster","signer-roles","storage-pressure","backup-freshness","recovery-readiness"];
  if(input.publisherConflict){for(const id of evidenceIds)set(id,"DRIFT","COMPETING_PUBLISHER_OR_GENERATION","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");}
  else if(Object.keys(e).length){
   for(const id of evidenceIds){
    if(!admit(id,e,"private-operator-bridge","OPERATOR_OBSERVATION"))continue;
    if(!sha(e.sourceSha,40)||typeof e.publisher!=="string"||!/^[A-Za-z0-9_.:-]{1,100}$/.test(e.publisher))continue;
    if(id==="build-parity"){
     const b=row(e.build);
     if(sha(b.expectedSource,40)&&sha(b.runningSource,40)&&build(b.expectedBuild)&&build(b.runningBuild))
      set(id,b.expectedSource===b.runningSource&&b.expectedBuild===b.runningBuild?"OBSERVED":"DRIFT",b.expectedSource===b.runningSource&&b.expectedBuild===b.runningBuild?"SOURCE_BUILD_OBSERVED_NOT_CERTIFIED":"SOURCE_OR_BUILD_MISMATCH","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
    }else if(id==="writer-roster"){
     const w=row(e.writerRoster);if(sha(w.expected,64)&&sha(w.observed,64))set(id,w.expected===w.observed?"OBSERVED":"DRIFT",w.expected===w.observed?"CONFIGURED_SCOPE_ONLY":"CONFIGURED_WRITER_ROSTER_DRIFT","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
    }else if(id==="signer-roles"){
     const s=row(e.signerRoles),roles=[s.execution,s.wagerReview,s.withdrawalReview];
     if(roles.every(x=>sha(x,64)))set(id,new Set(roles).size===3?"OBSERVED":"DRIFT",new Set(roles).size===3?"DISTINCT_REPORTED_IDENTITIES_NOT_CONTROL_PROOF":"SIGNER_ROLE_COLLISION","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
    }else if(id==="storage-pressure"){
     const s=row(e.storage);
     if(counter(s.rootFreeBytes)&&counter(s.volumeFreeBytes)&&typeof s.volumeUsedPercent==="number"&&Number.isFinite(s.volumeUsedPercent)&&s.volumeUsedPercent>=0&&s.volumeUsedPercent<=100){
      const held=s.rootFreeBytes<5*1024**3||s.volumeFreeBytes<20*1024**3||s.volumeUsedPercent>=85;
      set(id,held?"BLOCKED":"OBSERVED",held?"STORAGE_RESERVE_PRESSURE":"CAPACITY_OBSERVED_NOT_RESTORE_PROOF","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
     }
    }else if(id==="backup-freshness"){
     const b=row(e.backup),times=[b.capturedAt,b.restoredAt,b.offHostVerifiedAt].map(x=>freshness(x,now,86400));
     if(times.every(t=>t==="fresh")&&b.fullSize===true)set(id,"OBSERVED","REPORTED_CAPTURE_RESTORE_OFFHOST_NOT_CERTIFICATION","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
     else if(times.some(t=>t==="stale"))set(id,"STALE","BACKUP_RESTORE_OR_OFFHOST_EXPIRED","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
    }else if(id==="recovery-readiness"){
     const r=row(e.recovery);
     if(sha(r.sourceSha,40)&&r.sourceSha===e.sourceSha&&freshness(r.observedAt,now,3600)==="fresh"&&r.boundedMountVerified===true&&r.pairedRecoveryObserved===true)
      set(id,"OBSERVED","REPORTED_RECOVERY_NOT_MAINTENANCE_AUTHORITY","private-operator-bridge",e.observedAt,"OPERATOR_OBSERVATION");
    }
   }
  }
  const ledger=row(input.census);
  const ids=["ledger-conservation","unknown-broadcasts","frozen-reservations","refund-queue","withdrawal-queue","orphan-deposits","watcher-freshness","receipt-age"];
  if(Object.keys(ledger).length)for(const id of ids){
   // Watcher/receipt age has its own bound; the census capture itself must
   // first satisfy the shorter120second snapshot bound.
   if(freshness(ledger.observedAt,now,120)!=="fresh"){
    set(id,freshness(ledger.observedAt,now,120)==="stale"?"STALE":"UNKNOWN","CENSUS_STALE_OR_INVALID","read-only-satchel-census",ledger.observedAt,"DATABASE_READ_ONLY");continue;
   }
   if(id==="ledger-conservation"){
    if([ledger.availableUwolo,ledger.reservedUwolo,ledger.withdrawalPendingUwolo].some(v=>amount(v)===null)||!counter(ledger.ownerMismatchCount)||!counter(ledger.negativeBucketCount))continue;
    const bad=ledger.ownerMismatchCount>0||ledger.negativeBucketCount>0;
    set(id,bad?"DRIFT":"OBSERVED",bad?"OWNER_BUCKET_JOURNAL_MISMATCH":"OWNER_BUCKETS_MATCH_NOT_BANK_SOLVENCY","read-only-satchel-census",ledger.observedAt,"DATABASE_READ_ONLY");
   }else if(id==="unknown-broadcasts"){
    if(!counter(ledger.unknownReservations)||!counter(ledger.unknownWithdrawals))continue;
    const held=ledger.unknownReservations>0||ledger.unknownWithdrawals>0;
    set(id,held?"BLOCKED":"OBSERVED",held?"UNCERTAIN_MONEY_HUMAN_RECONCILIATION_NO_RETRY":"NO_UNKNOWNS_IN_SCOPED_CENSUS","read-only-satchel-census",ledger.observedAt,"DATABASE_READ_ONLY");
   }else if(id==="watcher-freshness"||id==="receipt-age"){
    const timestamp=id==="watcher-freshness"?ledger.lastWatcherAt:ledger.lastReceiptAt;
    const f=freshness(timestamp,now,id==="watcher-freshness"?30:900);
    set(id,f==="fresh"?"OBSERVED":f==="stale"?"STALE":"UNKNOWN",f==="fresh"?"TELEMETRY_OBSERVED_NOT_FINANCIAL_PROOF":f==="stale"?"TELEMETRY_EXPIRED":"NO_TELEMETRY_OR_INVALID_CLOCK","read-only-satchel-census",ledger.observedAt,"DATABASE_READ_ONLY");
   }else{
    const key={"frozen-reservations":"frozenReservations","refund-queue":"pendingRefunds","withdrawal-queue":"pendingWithdrawals","orphan-deposits":"orphanCandidates"}[id];
    const n=key?ledger[key]:undefined;if(!counter(n))continue;
    set(id,n>0?"BLOCKED":"OBSERVED",n>0?"PENDING_OR_AGED_OPERATIONS_REQUIRE_REVIEW":"NONE_IN_SCOPED_CENSUS","read-only-satchel-census",ledger.observedAt,"DATABASE_READ_ONLY");
   }
  }
  // Only the existing native verifier's in-process capability can establish
  // this observation. JSON flags, copied objects and archived proof data fail.
  if(authenticatedWarSatchelBankFreshAt(input.bank,now)){
   const bank=input.bank,observedAt=new Date(bank.observedAtMs).toISOString();
   set("chain-trust","OBSERVED","NATIVE_BANK_PROOF_NOT_CUSTODY_AUTHORITY","pinned-native-bank-verifier",observedAt,"NATIVE_AUTHENTICATED_CHAIN");
   const values=[ledger.availableUwolo,ledger.reservedUwolo,ledger.withdrawalPendingUwolo].map(amount);
   if(freshness(ledger.observedAt,now,30)==="fresh"&&values.every(x=>x!==null)){
    const liabilities=values.reduce<bigint>((sum,n)=>sum+n!,BigInt(0));
    bankComparison=bank.balanceUwolo<liabilities?"BELOW_SCOPED_BUCKETS":"COVERS_SCOPED_BUCKETS";
    set("bank-coverage",bank.balanceUwolo<liabilities?"BLOCKED":"UNKNOWN",bank.balanceUwolo<liabilities?
     "BANK_BELOW_OBSERVED_BUCKETS_REQUIRES_RECONCILIATION":"AUTHENTICATED_BANK_LEDGER_HEIGHT_UNBOUND",
     "native-bank-and-read-only-census",observedAt,"NATIVE_AUTHENTICATED_CHAIN");
   }
  }
 }
 return Object.freeze({schema:"aoe2war.satchel-finance-observations.v1",generatedAt:new Date(now).toISOString(),
  status:"HOLD",financialAuthorized:false,custodyAuthorized:false,completeGlobalWriterCensus:false,
  globalSolvency:"UNKNOWN",scopedBankComparison:Object.freeze({state:bankComparison,commonAuthenticatedHeight:false}),
  findings:Object.freeze(findings.map(x=>Object.freeze(x)))});
}

/** These adapters feed existing observability contracts without altering their
 * scoring, source truth, or financial admission. No input text is forwarded. */
export function financeDoctorFindings(report:FinanceDiagnostics){return report.findings.map(f=>({
 severity:f.state==="OBSERVED"?"INFO":"BLOCKER",category:f.id.includes("backup")||f.id.includes("recovery")?"Disaster Recovery":"Production",
 key:"satchel-finance-"+f.id,detail:f.reason+": "+f.detail,deduction:0,
}));}
export function financeInspectionChecks(report:FinanceDiagnostics):InspectionCheck[]{return report.findings.map(f=>({
 id:"satchel-finance-"+f.id,label:f.id,weight:0,earned:0,state:f.state==="OBSERVED"?"amber":"red",
 detail:f.reason+": "+f.detail,evidenceAt:f.observedAt,
}));}
export function publicFinanceDiagnostics(report:FinanceDiagnostics){return {
 schema:report.schema,generatedAt:report.generatedAt,status:"HOLD" as const,financialAuthorized:false as const,
 findings:report.findings.map(({id,state,severity,reason})=>({id,state,severity,reason})),
};}
