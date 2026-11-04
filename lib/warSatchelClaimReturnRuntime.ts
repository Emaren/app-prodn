/** Private pending-claim executor. Independent signed review precedes a durable
 * UNKNOWN fence; only native authenticated escrow→vault proof marks payment.
 * No user input chooses recipient, transaction hash, endpoint or fallback. */
import {createHash} from "node:crypto";
import {Prisma,type PrismaClient} from "@/lib/generated/prisma";
import {withHdFinancialLease} from "./hdFinancialMaintenanceFence.ts";
import {requireSatchelFinancialBridge} from "./warSatchelFinancialBridgeHold.ts";
import {readWarSatchelBoundedUtf8} from "./warSatchelBoundedBody.ts";
import {authenticateWarSatchelEscrowBank} from "./warSatchelAuthenticatedBank.ts";
import {authenticateSatchelClaimReturn,authenticatedWarSatchelClaimReturnFreshAt,type ExpectedWarSatchelClaimReturn} from "./warSatchelAuthenticatedClaimReturn.ts";
import {loadSatchelClaimReturnEconomics,satchelReturnContextFingerprint,type SatchelReturnOwner,type SatchelClaimReturnEconomics} from "./warSatchelClaimReturnAuthorization.ts";
import {creditVerifiedSatchelClaimReturn} from "./warSatchelFundedLedger.ts";
import {executeServiceOnlySatchelEscrowReturn,inspectServiceOnlySatchelEscrowReturn,satchelEscrowReturnSpendObservation,type SatchelEscrowReturnRun} from "./woloBetSettlement.ts";
import {getWoloBetEscrowRuntime} from "./woloChain.ts";
import {assertCurrentSatchelReturnReserve,inspectCurrentSatchelReturnReserve,satchelReturnReserveNativeBinding,type SatchelReturnExecutionCheck} from "./warSatchelClaimReturnReserve.ts";

const ENDPOINT="http://127.0.0.1:8094";
const HASH=/^[A-F0-9]{64}$/;
type DB=Prisma.TransactionClient;
type Review=Prisma.SatchelClaimReturnExecutionReviewGetPayload<object>;
function stop(reason:string):never{throw Error("SATCHEL_CLAIM_RETURN_RUNTIME_REFUSED:"+reason);}
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=="object"||Array.isArray(v))stop("object_required");return v as Record<string,unknown>;}
function canonical(v:unknown):string{
  if(Array.isArray(v))return "["+v.map(canonical).join(",")+"]";
  if(v&&typeof v==="object"){const x=v as Record<string,unknown>;return "{"+Object.keys(x).sort().map(k=>JSON.stringify(k)+":"+canonical(x[k])).join(",")+"}";}
  const s=JSON.stringify(v);if(s===undefined)stop("non_json_review");return s;
}
function digest(v:unknown){return createHash("sha256").update(canonical(v)).digest("hex");}
function configuration(){
  requireSatchelFinancialBridge();
  for(const flag of ["WAR_SATCHEL_CLAIM_RETURN_EXECUTOR_READY","WAR_SATCHEL_RETURN_REVIEW_IMPORT_ENABLED",
    "WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED","WAR_SATCHEL_SIGNER_CLIENT_ENABLED","WAR_SATCHEL_FUNDED_LEDGER_ENABLED",
    "WAR_SATCHEL_BET_PAYOUT_ROUTING_CERTIFIED","WAR_SATCHEL_UNMATCHED_REFUND_CREDIT_CERTIFIED","WAR_SATCHEL_CLAIM_RETURN_CREDIT_ENABLED"])
    if(process.env[flag]!=="true")stop("runtime_not_certified");
  const vault=process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS||"",escrow=getWoloBetEscrowRuntime().escrowAddress||"";
  const token=process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN||"";
  if(!/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/.test(vault)||!escrow||vault===escrow||!/^[A-Za-z0-9_-]{48,512}$/.test(token))stop("custody_identity_missing");
  return {vault,escrow,token};
}
function ownerOf(r:Review):SatchelReturnOwner{
  const e=object(r.economicsJson);return {claimId:r.claimId,ownerUserId:r.ownerUserId,ownerUid:r.ownerUid,vault:String(e.vaultAddress),escrow:String(e.escrowAddress)};
}
async function exclusive<T>(prisma:PrismaClient,action:(tx:DB)=>Promise<T>):Promise<T>{
  return prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(724176,47)`;return action(tx);},{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:9000});
}
async function economics(tx:DB,r:Review,stage:"pending"|"claimed"){
  const stored=object(r.economicsJson),cfg=configuration();
  if(stored.vaultAddress!==cfg.vault||stored.escrowAddress!==cfg.escrow||
     digest({economics:stored,reserveReview:r.reserveReviewJson})!==r.reviewDigest)stop("immutable_review_changed");
  const e=await loadSatchelClaimReturnEconomics(tx,ownerOf(r),{approval:stored.approval,entitlementId:r.entitlementId},stage);
  if(canonical(e)!==canonical(stored)||object(e.approval).allocation_digest!==r.allocationDigest)stop("canonical_claim_or_original_ticket_changed");
  return e;
}
export function satchelClaimReturnExecutionRun(e:SatchelClaimReturnEconomics):SatchelEscrowReturnRun{
  const id="satchel:claim-return:"+e.claimId;
  return Object.freeze({settlement_run_id:id,source_app:"aoe2hdbets",source_event_id:e.operationId,signer_role:"escrow",
    payouts:Object.freeze([Object.freeze({request_id:id,to_address:e.vaultAddress,amount_uwolo:e.amountUwolo,memo:"aoe2war/satchel/claim-return/v1/"+e.claimId})])});
}
/** Native 8094 UNKNOWN is never payment finality. Only its strictly bound
 * tx_hash can become a *candidate* for subsequent separate authenticated
 * reconciliation; a missing hash is a permanent inspection-only hold. */
export function satchelClaimReturnCandidateHash(value:unknown,run:SatchelEscrowReturnRun,escrow:string):string|null{
  if(!escrow||!run.settlement_run_id.startsWith("satchel:claim-return:"))return null;
  const claimId=run.settlement_run_id.slice("satchel:claim-return:".length);
  let observed;
  try{observed=satchelEscrowReturnSpendObservation(value,claimId);}catch{return null;}
  if(observed.operation_id!==run.settlement_run_id||!observed.tx_hash||!HASH.test(observed.tx_hash)||
     observed.tx_hash==="0".repeat(64))return null;
  return observed.tx_hash;
}
function assertPrepared(value:unknown,run:SatchelEscrowReturnRun){
  const p=object(value);
  if(p.kind!=="escrow_run_prepared"||p.execution_authorized!==false||p.credit_authorized!==false||canonical(p.run)!==canonical(run))stop("prepared_run_identity_changed");
}
/** Immutable HD identity for one new native execution attempt. Serialized
 * check metadata is audit-only and can never mint the live opaque check. */
export function satchelClaimReturnExecutionRequest(e:SatchelClaimReturnEconomics,checked:SatchelReturnExecutionCheck){
  assertCurrentSatchelReturnReserve(e,checked);
  return Object.freeze({protocol:1 as const,kind:"satchel_claim_return_8094" as const,
    approval:structuredClone(e.approval),nativeCheck:structuredClone(checked)});
}
function assertNativeAttempt(value:unknown,e:SatchelClaimReturnEconomics):boolean{
  const r=object(value);
  if(r.protocol!==1||r.kind!=="satchel_claim_return_8094")return false;
  if(Object.keys(r).length!==4||Object.keys(r).some(k=>!["protocol","kind","approval","nativeCheck"].includes(k))||canonical(r.approval)!==canonical(e.approval))stop("durable_attempt_changed");
  const c=object(r.nativeCheck),b=object(c.binding);
  // Expiry is deliberately not renewed or required during read-only recovery.
  // This stored DTO proves no current permission; the original signature and
  // transaction identity will be authenticated before any credit.
  if(c.protocol!==1||c.kind!=="escrow_return_execution_check"||c.executionAuthorized!==false||c.creditAuthorized!==false||
    typeof c.operationPermitSha256!=="string"||! /^[a-f0-9]{64}$/.test(c.operationPermitSha256)||c.operationPermitSha256==="0".repeat(64)||
    typeof c.reserveReviewSha256!=="string"||! /^[a-f0-9]{64}$/.test(c.reserveReviewSha256)||c.reserveReviewSha256==="0".repeat(64)||
    b.ticketId!==e.ticketId||b.marketId!==e.marketId||b.legId!==e.legId||b.entitlementId!==e.entitlementId||b.claimKind!==e.claimKind||b.amountUwolo!==e.amountUwolo||
    b.claimId!==e.claimId||b.operationId!==e.operationId||b.ownerId!==e.ownerId||b.allocationDigest!==object(e.approval).allocation_digest||
    b.escrowAddress!==e.escrowAddress||b.vaultAddress!==e.vaultAddress)stop("durable_attempt_changed");
  return true;
}
async function signerRequest(path:"/satchel/v1/returns/prepare"|"/satchel/v1/returns/reconcile",body:unknown,reader:typeof fetch,signal?:AbortSignal){
  const response=await reader(ENDPOINT+path,{method:"POST",redirect:"error",cache:"no-store",headers:{Authorization:"Bearer "+configuration().token,"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(8500),...(signal?[signal]:[])])});
  if(response.status!==200||!response.ok)stop("signer_return_outcome_unknown");
  const raw=await readWarSatchelBoundedUtf8(response.body,65536);if(!raw)stop("signer_return_outcome_unknown");return object(JSON.parse(raw));
}
/** Restricted server review ingestion. Signature and original pending economics
 * are checked before INSERT; review has no return transaction hash. */
export async function recordReviewedSatchelClaimReturnExecution(prisma:PrismaClient,owner:SatchelReturnOwner,review:{approval:unknown;entitlementId:string;reserveReview:unknown},reader:typeof fetch=fetch){
  const cfg=configuration();if(owner.vault!==cfg.vault||owner.escrow!==cfg.escrow)stop("custody_identity_changed");
  const detached=structuredClone(review);
  const e=await exclusive(prisma,tx=>loadSatchelClaimReturnEconomics(tx,owner,detached,"pending"));
  const bank=await authenticateWarSatchelEscrowBank(cfg.escrow,reader);
  satchelReturnReserveNativeBinding(e,bank);
  const fingerprint=digest({economics:e,reserveReview:detached.reserveReview});
  return exclusive(prisma,async tx=>{
    const current=await loadSatchelClaimReturnEconomics(tx,owner,detached,"pending");
    if(canonical(current)!==canonical(e))stop("review_context_changed_during_bank_io");
    satchelReturnReserveNativeBinding(e,bank);
    const prior=await tx.satchelClaimReturnExecutionReview.findUnique({where:{claimId:owner.claimId}});
    if(prior){if(prior.reviewDigest!==fingerprint)stop("immutable_review_conflict");return {state:"already_reviewed" as const};}
    const claim=await tx.pendingWoloClaim.findUnique({where:{id:owner.claimId}});
    if(!claim||claim.payoutAttemptedAt!==null)stop("prior_payment_attempt_requires_reconciliation");
    await tx.satchelClaimReturnExecutionReview.create({data:{claimId:owner.claimId,ownerUserId:owner.ownerUserId,ownerUid:owner.ownerUid,entitlementId:detached.entitlementId,
      allocationDigest:String(object(detached.approval).allocation_digest),economicsJson:e as Prisma.InputJsonValue,reserveReviewJson:detached.reserveReview as Prisma.InputJsonValue,reviewDigest:fingerprint}});
    return {state:"reviewed" as const};
  });
}
async function unknown(prisma:PrismaClient,claimId:number){
  // INSERT acknowledgement can be lost after COMMIT. Re-read the durable fence;
  // do not create evidence that claims an attempt exists when it does not.
  if (!await prisma.satchelClaimReturnExecutionAttempt.findUnique({where:{claimId}})) {
    return {state:"pre_execution_hold" as const};
  }
  await prisma.satchelClaimReturnExecutionObservation.create({data:{claimId,state:"unknown",txHash:null}});
  return {state:"unknown_hold" as const};
}
/** Exact server-selected claim only. Once an attempt exists every pass is GET
 * inspection + native reconciliation; no timeout or empty inspect authorizes POST. */
export async function processCertifiedSatchelClaimReturn(prisma:PrismaClient,claimId:number,reader:typeof fetch=fetch){
  const cfg=configuration();if(!Number.isSafeInteger(claimId)||claimId<1||claimId===889)stop("protected_or_invalid_claim");
  const r=await prisma.satchelClaimReturnExecutionReview.findUnique({where:{claimId}});if(!r)return {state:"review_missing" as const};
  const claim=await prisma.pendingWoloClaim.findUnique({where:{id:claimId}});
  if(!claim)stop("claim_missing");
  if(claim.status==="claimed"){
    await exclusive(prisma,tx=>economics(tx,r,"claimed"));
    const paid=await prisma.satchelClaimReturnExecutionObservation.findFirst({where:{claimId,state:"confirmed"},orderBy:{id:"desc"}});
    if(!paid?.txHash||paid.txHash!==claim.payoutTxHash)stop("native_completion_missing");
    await creditVerifiedSatchelClaimReturn(prisma,{claimId,ownerUserId:r.ownerUserId,ownerUid:r.ownerUid});
    return {state:"credited" as const,txHash:paid.txHash,ownerUserId:r.ownerUserId};
  }
  const e=await exclusive(prisma,tx=>economics(tx,r,"pending")),run=satchelClaimReturnExecutionRun(e);
  const attempt=await prisma.satchelClaimReturnExecutionAttempt.findUnique({where:{claimId}});
  let reply:unknown;
  if(!attempt){
    let entered=false;
    try{
      reply=await withHdFinancialLease({scope:"hd-legacy",producer:"settlement-run",wallet:cfg.escrow},async signal=>{
        entered=true;
        const mayPrepare=await exclusive(prisma,async tx=>{
          await economics(tx,r,"pending");
          if(await tx.satchelClaimReturnExecutionAttempt.findUnique({where:{claimId}}))return false;
          const claim=await tx.pendingWoloClaim.findUnique({where:{id:claimId}});
          if(!claim||claim.payoutAttemptedAt!==null)stop("prior_payment_attempt_requires_reconciliation");
          return true;
        });
        if(!mayPrepare)return null;
        signal.throwIfAborted();
        // Preparation is expressly nonspending. Its journal change makes any
        // imported pre-prepare review ineligible for execution admission.
        assertPrepared(await signerRequest("/satchel/v1/returns/prepare",e.approval,reader,signal),run);
        const checked=await inspectCurrentSatchelReturnReserve(e,reader,signal);
        const request=satchelClaimReturnExecutionRequest(e,checked);
        const won=await exclusive(prisma,async tx=>{
          await economics(tx,r,"pending");assertCurrentSatchelReturnReserve(e,checked);
          if(await tx.satchelClaimReturnExecutionAttempt.findUnique({where:{claimId}}))return false;
          const claim=await tx.pendingWoloClaim.findUnique({where:{id:claimId}});
          if(!claim||claim.payoutAttemptedAt!==null)stop("prior_payment_attempt_requires_reconciliation");
          signal.throwIfAborted();
          assertCurrentSatchelReturnReserve(e,checked);
          await tx.satchelClaimReturnExecutionAttempt.create({data:{claimId,runId:run.settlement_run_id,requestJson:request as Prisma.InputJsonValue,requestDigest:digest(request)}});
          return true;
        });
        if(!won)return null;
        // A lost COMMIT acknowledgement never reaches this POST. A later pass
        // sees the durable attempt and can only inspect/reconcile it.
        signal.throwIfAborted();assertCurrentSatchelReturnReserve(e,checked);
        return executeServiceOnlySatchelEscrowReturn(e.approval,cfg.escrow,reader,signal);
      });
      if(reply===null)return unknown(prisma,claimId);
    }catch{
      if(!entered)return {state:"financial_maintenance_hold" as const};
      return unknown(prisma,claimId);
    }
  }else{
    if(attempt.runId!==run.settlement_run_id||attempt.requestDigest!==digest(attempt.requestJson))stop("durable_attempt_changed");
    if(!assertNativeAttempt(attempt.requestJson,e))return {state:"legacy_attempt_hold" as const};
    try{
      reply=await inspectServiceOnlySatchelEscrowReturn(String(claimId),reader);
    }catch{return unknown(prisma,claimId);}
  }
  const txHash=satchelClaimReturnCandidateHash(reply,run,cfg.escrow);if(!txHash)return unknown(prisma,claimId);
  try{
    // Reconcile is read-only with respect to chain execution. It neither signs
    // nor broadcasts, even if the return approval has expired since submission.
    await signerRequest("/satchel/v1/returns/reconcile",{approval:e.approval,tx_hash:txHash},reader);
    const expectedBody={...e,txHash};
    const expected:ExpectedWarSatchelClaimReturn={...expectedBody,contextFingerprint:satchelReturnContextFingerprint(expectedBody)};
    const proof=await authenticateSatchelClaimReturn(expected,reader);
    if(!authenticatedWarSatchelClaimReturnFreshAt(proof))stop("native_return_proof_expired");
    await exclusive(prisma,async tx=>{
      const current=await tx.pendingWoloClaim.findUnique({where:{id:claimId}});
      if(current?.status==="claimed"){
        if(current.claimedByUserId!==r.ownerUserId||current.payoutTxHash!==txHash)stop("claim_already_paid_differently");return;
      }
      await economics(tx,r,"pending");
      if(!authenticatedWarSatchelClaimReturnFreshAt(proof))stop("native_return_proof_expired_under_lock");
      // No raw HTTP hash is persisted before this opaque native-proof boundary.
      await tx.satchelClaimReturnAuthorization.create({data:{claimId,ownerUserId:r.ownerUserId,ownerUid:r.ownerUid,ticketId:Number(e.ticketId),marketId:Number(e.marketId),legId:Number(e.legId),entitlementId:e.entitlementId,
        operationId:e.operationId,fundingTxHash:e.fundingTxHash,fundedAmountUwolo:BigInt(e.fundedAmountUwolo),amountUwolo:BigInt(e.amountUwolo),principalUwolo:BigInt(e.principalUwolo),claimKind:e.claimKind,
        escrowAddress:cfg.escrow,vaultAddress:cfg.vault,returnTxHash:txHash,approvalJson:e.approval as Prisma.InputJsonValue,allocationDigest:r.allocationDigest,contextFingerprint:expected.contextFingerprint}});
      await tx.pendingWoloClaim.update({where:{id:claimId},data:{status:"claimed",claimedByUserId:r.ownerUserId,payoutTxHash:txHash,claimedAt:new Date(),payoutAttemptedAt:new Date(),errorState:null}});
      await tx.satchelClaimReturnExecutionObservation.create({data:{claimId,state:"confirmed",txHash}});
    });
    await creditVerifiedSatchelClaimReturn(prisma,{claimId,ownerUserId:r.ownerUserId,ownerUid:r.ownerUid});
    return {state:"credited" as const,txHash,ownerUserId:r.ownerUserId};
  }catch{return unknown(prisma,claimId);}
}
