/**
 * C02 forward-only HD App operation processor. Source-only until the
 * independent C03/C06/C07/C08/C09 acceptance and finance-owner activation.
 *
 * The original wager comes ONLY from the append-only funded Satchel journal,
 * never legacy pending_wolo_claims, historical transfer matches or 8092.
 *
 * First execution: validate signed review -> prepare on private 8094 ->
 * post-prepare native 8094 reserve/permit check backed by independent 8095 ->
 * commit one original-op attempt in PG -> POST native 8094 ONCE.
 * All future invocations: GET same original operation, never POST.
 *
 * A native hash is noncrediting UNKNOWN until the exact pinned offline Comet
 * financial-proof verifier validates the original signed v2 approval, source
 * escrow→vault payment, bank root, owner, amount and memo. The dedicated
 * finance-writer transaction then consumes the global tx and credits once.
 */
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { withHdFinancialLease } from "./hdFinancialMaintenanceFence.ts";
import { requireSatchelFinancialBridge } from "./warSatchelFinancialBridgeHold.ts";
import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";
import {
  authenticateSatchelClaimReturn, authenticatedWarSatchelClaimReturnFreshAt,
  type ExpectedWarSatchelClaimReturn,
} from "./warSatchelAuthenticatedClaimReturn.ts";
import {
  satchelReturnContextFingerprint,
  type SatchelClaimReturnEconomics,
} from "./warSatchelClaimReturnAuthorization.ts";
import { verifySatchelSignedV2Return } from "./warSatchelSignedV2Return.ts";
import {
  assertCurrentSatchelReturnReserve, inspectCurrentSatchelReturnReserve,
} from "./warSatchelClaimReturnReserve.ts";
import {
  freshSatchelClaimId, nativeReturnIdentity,
  recoverFreshNativeReturn, submitFreshNativeReturnOnce,
} from "./warSatchelNativeOnlyReturn.ts";
import { nativeC02AttemptJournal } from "./warSatchelNativeReturnJournal.ts";

const ENDPOINT = "http://127.0.0.1:8094/satchel/v1/returns";
const HASH = /^[A-F0-9]{64}$/;
type DB = Prisma.TransactionClient;
type Original = {
  claim_id: bigint; owner_user_id: number; owner_uid: string;
  wager_operation_id: string; ticket_id: number; market_id: bigint;
  leg_id: string; entitlement_id: string; claim_kind: string;
  amount_uwolo: bigint; principal_uwolo: bigint; stake_uwolo: bigint;
  funded_amount_uwolo: bigint; escrow_address: string; vault_address: string;
  funding_tx_hash: string; funding_height: bigint; funding_bank_root: string;
  allocation_digest: string; independent_reserve_review_sha256: string;
  owner_permit_sha256: string;
};
type Attempt = {
  claim_id: bigint;operation_key: string;app_operation_id:string;
  approval_sha256: string;approval_json:unknown;
};
type Credit = {
  id: bigint; claim_id: bigint; owner_user_id: number;tx_hash:string;
  authenticated_proof_digest:string; amount_uwolo:bigint;
};
function hold(why:string):never{throw Error("C02_NATIVE_RUNTIME_HOLD:"+why);}
function expectedEconomics(original:Original,approval:unknown):SatchelClaimReturnEconomics {
  if(original.claim_kind!=="bet_payout"&&original.claim_kind!=="bet_refund")
    hold("unsupported_fresh_operation_kind");
  if(original.amount_uwolo<=BigInt(0)||original.principal_uwolo<=BigInt(0)||
    original.stake_uwolo<=BigInt(0)||original.funded_amount_uwolo<=BigInt(0)||
    original.claim_id<BigInt("900000000001")||
    !HASH.test(original.funding_tx_hash)||original.funding_tx_hash==="0".repeat(64))
    hold("original_wager_economics_unverifiable");
  return Object.freeze({
    ownerId:original.owner_uid,operationId:original.wager_operation_id,
    claimId:String(original.claim_id),ticketId:String(original.ticket_id),
    marketId:String(original.market_id),legId:original.leg_id,
    entitlementId:original.entitlement_id,
    claimKind:original.claim_kind,amountUwolo:String(original.amount_uwolo),
    principalUwolo:String(original.principal_uwolo),
    stakeUwolo:String(original.stake_uwolo),
    fundedAmountUwolo:String(original.funded_amount_uwolo),
    fundingTxHash:original.funding_tx_hash,
    escrowAddress:original.escrow_address,vaultAddress:original.vault_address,
    approval,
  });
}
function readIdentity(original:Original,attempt:Attempt) {
 const e=expectedEconomics(original,attempt.approval_json);
 const ident=nativeReturnIdentity(attempt.approval_json);
 if(attempt.claim_id!==original.claim_id||
    ident.operationKey!==attempt.operation_key||
    ident.appOperationId!==attempt.app_operation_id||
    ident.approvalSha256!==attempt.approval_sha256||
    ident.claimId!==e.claimId||
    (attempt.approval_json as Record<string,unknown>).allocation_digest!==original.allocation_digest)
   hold("immutable_signed_original_attempt_mismatch");
 verifySatchelSignedV2Return({
    approval:attempt.approval_json,expected:e,
    independentOperatorPublicKeyHex:
      process.env.WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX||"",
 });
 return e;
}
async function lookup(prisma:PrismaClient,claimId:bigint) {
 const [original]=await prisma.$queryRaw<Original[]>`
  SELECT claim_id,owner_user_id,owner_uid,wager_operation_id,ticket_id,market_id,
         leg_id,entitlement_id,claim_kind,amount_uwolo,principal_uwolo,
         stake_uwolo,funded_amount_uwolo,escrow_address,vault_address,
         funding_tx_hash,funding_height,funding_bank_root,allocation_digest,
         independent_reserve_review_sha256,owner_permit_sha256
  FROM public.war_satchel_native_return_operations
  WHERE claim_id=${claimId}`;
 if(!original)hold("new_native_operation_not_found");
 if(freshSatchelClaimId(String(original.claim_id))!==String(claimId))
   hold("historical_claim_fence");
 const [attempt]=await prisma.$queryRaw<Attempt[]>`
  SELECT claim_id,operation_key,app_operation_id,approval_sha256,approval_json
  FROM public.war_satchel_native_return_attempts WHERE claim_id=${claimId}`;
 return {original,attempt};
}
async function prepare(
 approval:unknown,e:SatchelClaimReturnEconomics,
 token:string,reader:typeof fetch,admitted:AbortSignal,
):Promise<void>{
 if(admitted.aborted)hold("financial_lease_ended");
 const signal=AbortSignal.any([admitted,AbortSignal.timeout(8500)]);
 const response=await reader(ENDPOINT+"/prepare",{
  method:"POST",cache:"no-store",redirect:"error",
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",
    Accept:"application/json","Accept-Encoding":"identity"},
  body:JSON.stringify(approval),signal,
 });
 if(response.status!==200||!response.ok)hold("native_preparation_unavailable");
 const raw=await readWarSatchelBoundedUtf8(response.body,65536);
 let reply:Record<string,unknown>;
 try{reply=JSON.parse(raw||"") as Record<string,unknown>;}
 catch{hold("native_preparation_response_unverifiable");}
 if(!reply||reply.kind!=="escrow_run_prepared"||
   reply.execution_authorized!==false||reply.credit_authorized!==false||
   !reply.run||typeof reply.run!=="object")
  hold("native_preparation_not_nonspending");
 const run=reply.run as Record<string,unknown>;
 const payout=Array.isArray(run.payouts)?run.payouts[0] as Record<string,unknown>:null;
 const operationKey="satchel:claim-return:"+e.claimId;
 if(Object.keys(run).length!==5||!Array.isArray(run.payouts)||
    run.payouts.length!==1||!payout||Object.keys(payout).length!==4||
    run.settlement_run_id!==operationKey||
    run.source_app!=="aoe2hdbets"||
    run.source_event_id!==e.operationId||run.signer_role!=="escrow"||
    payout.request_id!==operationKey||payout.to_address!==e.vaultAddress||
    payout.amount_uwolo!==e.amountUwolo||
    payout.memo!=="aoe2war/satchel/claim-return/v1/"+e.claimId)
  hold("native_preparation_source_or_destination_changed");
}
function expectedProof(e:SatchelClaimReturnEconomics,txHash:string):ExpectedWarSatchelClaimReturn{
 const input={...e,txHash};
 return Object.freeze({
  ...input,contextFingerprint:satchelReturnContextFingerprint(input),
 });
}
async function creditOnce(
 prisma:PrismaClient,original:Original,proof:Awaited<ReturnType<typeof authenticateSatchelClaimReturn>>,
):Promise<"credited"|"already_credited">{
 const id=original.claim_id;
 if(!authenticatedWarSatchelClaimReturnFreshAt(proof)||proof.amountUwolo!==original.amount_uwolo||
  proof.canonicalHeight<=original.funding_height||proof.txHash===original.funding_tx_hash||
  proof.expected.claimId!==String(id)||proof.expected.ownerId!==original.owner_uid||
  proof.expected.vaultAddress!==original.vault_address||
  proof.expected.escrowAddress!==original.escrow_address||
  !HASH.test(proof.blockHash)||!/^[a-f0-9]{64}$/.test(proof.contextDigest))
  hold("pinned_comet_return_proof_missing_or_expired");
 return prisma.$transaction(async(tx:DB)=>{
  const [prior]=await tx.$queryRaw<Credit[]>`
    SELECT id,claim_id,owner_user_id,tx_hash,authenticated_proof_digest,amount_uwolo
    FROM public.war_satchel_native_return_credits WHERE claim_id=${id} FOR SHARE`;
  if(prior){
    if(prior.claim_id!==id||prior.owner_user_id!==original.owner_user_id||
      prior.tx_hash!==proof.txHash||prior.authenticated_proof_digest!==proof.contextDigest||
      prior.amount_uwolo!==original.amount_uwolo)
      hold("existing_credit_conflicts_with_native_proof");
    return "already_credited" as const;
  }
  if(!authenticatedWarSatchelClaimReturnFreshAt(proof))
   hold("comet_proof_expired_under_financial_lock");
  const [response]=await tx.$queryRaw<{id:bigint}[]>`
    SELECT public.war_satchel_native_credit_once(
      ${id},${proof.txHash}::varchar,${proof.canonicalHeight},
      ${proof.blockHash}::varchar,${proof.contextDigest}::varchar,
      ${original.vault_address}::varchar) AS id`;
  if(!response||response.id<BigInt(1))
    hold("atomic_native_financial_credit_not_committed");
  if(!authenticatedWarSatchelClaimReturnFreshAt(proof))
    hold("comet_proof_expired_before_financial_commit");
  return "credited" as const;
 },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:9000});
}
/**
 * A's restricted C02 finance worker imports ONE independently signed v2
 * operation review. This never prepares, broadcasts, credits or touches old
 * pending_wolo_claims. A later post-prepare 8094 check must match the SAME
 * stored independent 8095 reserve review and owner permit digests.
 */
export async function recordCertifiedFreshNativeReturnReview(
 prisma:PrismaClient,input:{claimId:string;ownerUserId:number;approval:unknown},
):Promise<"recorded"|"already_recorded"> {
 requireSatchelFinancialBridge();
 const id=BigInt(freshSatchelClaimId(input.claimId));
 const {original,attempt}=await lookup(prisma,id);
 if(attempt)hold("review_change_after_execution_attempt");
 if(!Number.isSafeInteger(input.ownerUserId)||input.ownerUserId!==original.owner_user_id)
  hold("independent_review_owner_not_authenticated");
 const e=expectedEconomics(original,input.approval);
 const approval=nativeReturnIdentity(input.approval);
 if(approval.claimId!==input.claimId||approval.appOperationId!==e.operationId||
    (input.approval as Record<string,unknown>).allocation_digest!==original.allocation_digest)
  hold("signed_review_not_original_ticket_or_allocation");
 verifySatchelSignedV2Return({
  approval:input.approval,expected:e,
  independentOperatorPublicKeyHex:process.env.WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX||"",
 });
 return withHdFinancialLease({
  scope:"hd-satchel",producer:"settlement-run",wallet:original.escrow_address,
 },async admitted=>{
  admitted.throwIfAborted();
  return prisma.$transaction(async(tx:DB)=>{
   const [o]=await tx.$queryRaw<Original[]>`
    SELECT claim_id,owner_user_id,owner_uid,wager_operation_id,ticket_id,market_id,
     leg_id,entitlement_id,claim_kind,amount_uwolo,principal_uwolo,
     stake_uwolo,funded_amount_uwolo,escrow_address,vault_address,
     funding_tx_hash,funding_height,funding_bank_root,allocation_digest,
     independent_reserve_review_sha256,owner_permit_sha256
    FROM public.war_satchel_native_return_operations
    WHERE claim_id=${id} FOR SHARE`;
   if(!o||o.owner_user_id!==original.owner_user_id||
      o.funding_tx_hash!==original.funding_tx_hash||
      o.allocation_digest!==original.allocation_digest||
      o.independent_reserve_review_sha256!==original.independent_reserve_review_sha256)
    hold("signed_review_original_operation_changed");
   const n=await tx.$executeRaw`
    INSERT INTO public.war_satchel_native_return_approvals
     (claim_id,approval_json,approval_sha256)
    VALUES(${id},${JSON.stringify(input.approval)}::jsonb,${approval.approvalSha256})
    ON CONFLICT DO NOTHING`;
   const [saved]=await tx.$queryRaw<{
    claim_id:bigint;approval_json:unknown;approval_sha256:string
   }[]>`
    SELECT claim_id,approval_json,approval_sha256
    FROM public.war_satchel_native_return_approvals
    WHERE claim_id=${id} FOR SHARE`;
   if(!saved||saved.claim_id!==id||
      saved.approval_sha256!==approval.approvalSha256||
      nativeReturnIdentity(saved.approval_json).approvalSha256!==approval.approvalSha256)
     hold("signed_review_immutable_conflict");
   const [recordedAttempt]=await tx.$queryRaw<{claim_id:bigint}[]>`
    SELECT claim_id FROM public.war_satchel_native_return_attempts WHERE claim_id=${id}`;
   if(recordedAttempt)hold("review_replayed_after_original_attempt");
   admitted.throwIfAborted();
   return n===1?"recorded" as const:"already_recorded" as const;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,maxWait:5000,timeout:9000});
 });
}
/**
 * This exported operation has intentionally no public API route. A dedicated,
 * A-approved restricted finance worker must call it; bridge HOLD is currently
 * a source constant and cannot be flipped by environment-only flags.
 */
export async function processCertifiedFreshNativeSatchelReturn(
 prisma:PrismaClient,input:{claimId:string;ownerUserId:number},
 reader:typeof fetch=fetch,
):Promise<Readonly<{state:"unknown_hold"|"credited"|"already_credited";
  candidateTxHash:string|null;creditAuthorized:boolean;}>>{
 requireSatchelFinancialBridge();
 const id=BigInt(freshSatchelClaimId(input.claimId));
 const {original,attempt}=await lookup(prisma,id);
 if(!Number.isSafeInteger(input.ownerUserId)||input.ownerUserId<1||
    input.ownerUserId!==original.owner_user_id)
  hold("new_owner_not_authenticated");
 const token=process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN||"";
 if(!/^[A-Za-z0-9_-]{48,512}$/.test(token))
  hold("native_private_transport_not_enrolled");
 if(attempt)readIdentity(original,attempt);
 const status=await withHdFinancialLease({
  scope:"hd-satchel",producer:"settlement-run",wallet:original.escrow_address,
 },async admitted=>{
  if(attempt){
   // Never prepare/check/POST on any subsequent attempt, regardless of
   // UNKNOWN/timeout, lost ACK or expired permit.
   return recoverFreshNativeReturn(input.claimId,token,reader,admitted);
  }
  // No first execution without a signed source-bound and unexpired v2
  // approval previously independently imported by the restricted writer.
  const [approved]=await prisma.$queryRaw<{
    approval_json:unknown; approval_sha256:string
  }[]>`
    SELECT approval_json,approval_sha256
    FROM public.war_satchel_native_return_approvals
    WHERE claim_id=${id}`;
  if(!approved)hold("independent_signed_review_not_recorded");
  const e=expectedEconomics(original,approved.approval_json);
  const signed=nativeReturnIdentity(approved.approval_json);
  if(signed.approvalSha256!==approved.approval_sha256||
     signed.appOperationId!==original.wager_operation_id||
     signed.claimId!==input.claimId)
    hold("independent_review_wrong_original_operation");
  verifySatchelSignedV2Return({approval:approved.approval_json,expected:e,
    independentOperatorPublicKeyHex:process.env.WAR_SATCHEL_RETURN_APPROVAL_PUBLIC_KEY_HEX||""});
  await prepare(approved.approval_json,e,token,reader,admitted);
  const check=await inspectCurrentSatchelReturnReserve(e,reader,admitted);
  assertCurrentSatchelReturnReserve(e,check);
  if(check.operationPermitSha256!==original.owner_permit_sha256||
     check.reserveReviewSha256!==original.independent_reserve_review_sha256)
    hold("original_8095_reserve_review_or_permit_changed");
  const journal=nativeC02AttemptJournal(prisma,{
    claimId:input.claimId,ownerUserId:original.owner_user_id,
    ownerUid:original.owner_uid,fundingTxHash:original.funding_tx_hash,
    fundingBankRoot:original.funding_bank_root,
    independentReserveReviewSha256:check.reserveReviewSha256,
    ownerPermitSha256:check.operationPermitSha256,
  },approved.approval_json);
  return submitFreshNativeReturnOnce(approved.approval_json,token,journal,reader,admitted);
 });
 if(!status.candidateTxHash)
  return {state:"unknown_hold",candidateTxHash:null,creditAuthorized:false};
 const {original:now,attempt:locked}=await lookup(prisma,id);
 if(!locked||locked.operation_key!=="satchel:claim-return:"+input.claimId||
   now.funding_tx_hash!==original.funding_tx_hash||
   now.independent_reserve_review_sha256!==original.independent_reserve_review_sha256)
  hold("post_transport_original_or_attempt_changed");
 const economics=readIdentity(now,locked);
 const proof=await authenticateSatchelClaimReturn(
  expectedProof(economics,status.candidateTxHash),reader);
 if(!authenticatedWarSatchelClaimReturnFreshAt(proof))
  hold("authentic_native_proof_absent");
 const settled=await creditOnce(prisma,now,proof);
 return {state:settled,candidateTxHash:proof.txHash,creditAuthorized:true};
}
