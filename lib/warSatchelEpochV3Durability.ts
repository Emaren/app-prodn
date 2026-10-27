/**
 * HD v3 source-only durable transition contract. Integration MUST place the
 * compare-and-swap, unique financial row and physical receipt insert in ONE
 * SERIALIZABLE PostgreSQL transaction with independently proven chain data.
 * This file has no DB connector and no signer; it returns immutable proposals.
 */
import { inspectNewEpochWagerAdmission, type EpochWagerRequest } from "./warSatchelNewEpochFinancialContracts.ts";

export const EPOCH_V3_DURABLE_WRITER_INSTALLED = false as const;
const NAT = /^(0|[1-9][0-9]{0,38})$/;
const MAX_DAILY = BigInt(50_000) * BigInt(1_000_000);
export type EpochOperationStage =
  | "PREPARED_UNSIGNED" | "ATTEMPT_FENCED" | "SIGNED_UNKNOWN"
  | "BROADCAST_UNKNOWN" | "UNKNOWN_QUARANTINED" | "PROVEN_FINAL";
export type EpochFinancialOperation = Readonly<{
  epochId:string; operationId:string; ownerUid:string;
  ticketId:number; version:number; state:EpochOperationStage;
  immutableIntentSha256:string; lastKnownTxHash:string|null;
}>;
export type EpochTransitionProposal=Readonly<{
  epochId:string; operationId:string; expectedVersion:number; newVersion:number;
  from:EpochOperationStage; to:EpochOperationStage;
  durableTransactionRequired:true; writeAuthorized:false; retryAuthorized:false;
}>;
const ALLOWED: Readonly<Record<EpochOperationStage,readonly EpochOperationStage[]>> = {
  PREPARED_UNSIGNED:["ATTEMPT_FENCED"],
  ATTEMPT_FENCED:["SIGNED_UNKNOWN","UNKNOWN_QUARANTINED"],
  SIGNED_UNKNOWN:["BROADCAST_UNKNOWN","UNKNOWN_QUARANTINED"],
  BROADCAST_UNKNOWN:["UNKNOWN_QUARANTINED"],
  UNKNOWN_QUARANTINED:[],
  PROVEN_FINAL:[]
};
function requireOne(ok:unknown, reason:string):asserts ok {
  if(!ok) throw Error("EPOCH_V3_DURABLE_HOLD:"+reason);
}
function nat(v:unknown):bigint {
  requireOne(typeof v==="string" && NAT.test(v), "invalid_integer");
  return BigInt(v);
}
/** No code path permits retry after ATTEMPT_FENCED (including a lost commit ACK). */
export function proposeEpochOperationTransition(
  previous:EpochFinancialOperation, requested:EpochOperationStage, expectedVersion:number,
):EpochTransitionProposal {
  requireOne(previous && previous.state in ALLOWED &&
    Number.isSafeInteger(previous.ticketId) && previous.ticketId>0 &&
    Number.isSafeInteger(previous.version) && previous.version>=0 &&
    expectedVersion===previous.version, "stale_or_invalid_version");
  requireOne(previous.operationId ===
    "satchel:e3:"+previous.epochId+":"+previous.ticketId &&
    /^[a-z][a-z0-9_-]{11,63}$/.test(previous.epochId) &&
    /^[a-zA-Z0-9_.:-]{1,100}$/.test(previous.ownerUid) &&
    /^[a-f0-9]{64}$/.test(previous.immutableIntentSha256), "owner_epoch_operation_scope");
  requireOne(ALLOWED[previous.state].includes(requested),
    "unsafe_transition_or_duplicate_broadcast");
  if (requested==="PROVEN_FINAL") throw Error("EPOCH_V3_DURABLE_HOLD:native_physical_proof_not_integrated");
  return Object.freeze({
    epochId:previous.epochId,operationId:previous.operationId,
    expectedVersion,newVersion:previous.version+1,
    from:previous.state,to:requested,
    durableTransactionRequired:true as const,writeAuthorized:false as const,
    retryAuthorized:false as const
  });
}
export type EpochDailySpendCandidate=Readonly<{
  request:EpochWagerRequest; ownerUid:string; utcDay:string;
  priorDailyCommittedUwolo:string; unresolvedReservedUwolo:string;
  seenDailySourceOperationIds:readonly string[];
}>;
/** To be re-executed INSIDE owner/day SELECT...FOR UPDATE transaction; no credit. */
export function inspectEpochDailyWagerCandidate(input:EpochDailySpendCandidate) {
  const i=inspectNewEpochWagerAdmission(input.request);
  requireOne(input.ownerUid===i.ownerUid &&
    /^\d{4}-\d\d-\d\d$/.test(input.utcDay) &&
    Number.isFinite(Date.parse(input.utcDay+"T00:00:00Z")),
    "owner_or_day_mismatch");
  const prior=nat(input.priorDailyCommittedUwolo),unknown=nat(input.unresolvedReservedUwolo),
    proposed=nat(i.principalUwolo);
  requireOne(Array.isArray(input.seenDailySourceOperationIds) &&
    !input.seenDailySourceOperationIds.includes(i.operationId), "daily_operation_replay");
  requireOne(prior+unknown+proposed <= MAX_DAILY, "daily_50000_cap_or_uncertainty");
  return Object.freeze({epochId:i.epochId,ownerUid:i.ownerUid,utcDay:input.utcDay,
    operationId:i.operationId,principalUwolo:i.principalUwolo,
    totalWithUncertainUwolo:(prior+unknown+proposed).toString(),
    status:"TRANSACTIONALLY_RECHECK_REQUIRED" as const,spendAuthorized:false as const});
}
export type EpochReceiptCandidate=Readonly<{
  chainId:"wolo-1"; epochId:string; operationId:string; ownerUid:string;
  txHash:string; messageIndex:0; amountUwolo:string;
  sender:string;recipient:string;memo:string;
}>;
/**
 * DB must own a UNIQUE (chainId,txHash,messageIndex) claim table shared across
 * deposit/wager/return/fee/withdrawal, plus UNIQUE(epoch,operationId).
 * Source-supplied spent list and candidate are NOT sufficient for credit.
 */
export function inspectUncreditedPhysicalConsumption(input:Readonly<{
  source:EpochReceiptCandidate; expected:EpochReceiptCandidate;
  globallyConsumedKeys:readonly string[]; epochConsumedOperations:readonly string[];
}>) {
  const {source:s,expected:e}=input;
  requireOne(s && e && s.chainId==="wolo-1" && e.chainId==="wolo-1" &&
    s.epochId===e.epochId && s.operationId===e.operationId &&
    s.ownerUid===e.ownerUid && s.amountUwolo===e.amountUwolo &&
    nat(s.amountUwolo)>BigInt(0) && s.sender===e.sender &&
    s.recipient===e.recipient && s.memo===e.memo &&
    s.messageIndex===0 && e.messageIndex===0 &&
    /^[A-F0-9]{64}$/.test(s.txHash) && s.txHash===e.txHash,
    "physical_or_ownership_mismatch");
  const key="wolo-1:"+s.txHash+":0";
  requireOne(Array.isArray(input.globallyConsumedKeys) &&
    Array.isArray(input.epochConsumedOperations) &&
    !input.globallyConsumedKeys.includes(key) &&
    !input.epochConsumedOperations.includes(s.operationId),
    "physical_effect_or_economic_operation_already_consumed");
  return Object.freeze({
    physicalKey:key,epochId:s.epochId,operationId:s.operationId,
    status:"GLOBAL_SERIALIZABLE_CONSUMPTION_REQUIRED" as const,
    nativeCometVerified:false as const,creditAuthorized:false as const
  });
}
