/** The escrow return guard binds a current native check to an independently
 * authenticated bank proof. Imported review metadata cannot establish current
 * liabilities, paid-claim discharge, pending fees or spend authority.
 */
import {
  authenticatedWarSatchelBankFreshAt,
  authenticateWarSatchelEscrowBank,
  type AuthenticatedWarSatchelBank,
} from "./warSatchelAuthenticatedBank.ts";
import {readWarSatchelBoundedUtf8} from "./warSatchelBoundedBody.ts";
import {createHash} from "node:crypto";
import type {SatchelClaimReturnEconomics} from "./warSatchelClaimReturnAuthorization.ts";

const DIGEST=/^[a-f0-9]{64}$/;
const ORIGINAL_DIGEST=/^[A-F0-9]{64}$/;
const AMOUNT=/^[1-9][0-9]{0,18}$/;
function refuse(reason:string):never{throw Error("SATCHEL_CLAIM_RETURN_RESERVE_REFUSED:"+reason);}
function object(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))refuse("original_allocation_required");
  return value as Record<string,unknown>;
}

/** The native check reads its protected reviewer keys, enrollment, signed
 * execution inventory and current journal. This binding retains the original
 * reconciliation digest and identifies the separately verified bank state.
 */
export type SatchelReturnReserveNativeBinding=Readonly<{
  protocol:1;
  operationId:string;claimId:string;ownerId:string;ticketId:string;
  marketId:string;legId:string;entitlementId:string;claimKind:"bet_payout"|"bet_refund";
  amountUwolo:string;escrowAddress:string;vaultAddress:string;
  allocationDigest:string;originalBankEvidenceDigest:string;fundsBudgetId:string;
  currentBankHeight:string;currentBankCommitHeight:string;
  currentBankBlockHash:string;currentBankAppHash:string;
}>;

/** Rebuild only a nonauthorizing binding from the independently loaded claim
 * and the opaque Go-authenticated CURRENT escrow bank capability. In particular,
 * original allocation height/root need not equal the bank after a prior leg
 * paid. A bank balance is never converted into funds_available_uwolo here.
 */
export function satchelReturnReserveNativeBinding(
  economics:SatchelClaimReturnEconomics,
  bank:AuthenticatedWarSatchelBank,
):SatchelReturnReserveNativeBinding{
  if(!authenticatedWarSatchelBankFreshAt(bank)||bank.chainId!=="wolo-1"||bank.denom!=="uwolo"||
     bank.vaultAddress!==economics.escrowAddress||economics.escrowAddress===economics.vaultAddress||
     bank.height<BigInt(1)||bank.commitHeight!==bank.height+BigInt(1))refuse("current_authenticated_escrow_bank_required");
  const approval=object(economics.approval),allocation=object(approval.allocation);
  if(typeof approval.allocation_digest!=="string"||!DIGEST.test(approval.allocation_digest)||
     typeof allocation.bank_evidence_digest!=="string"||!ORIGINAL_DIGEST.test(allocation.bank_evidence_digest)||
     typeof allocation.funds_budget_id!=="string"||allocation.funds_budget_id.length<1||allocation.funds_budget_id.length>160||
     approval.version!==2||allocation.version!==2||approval.ticket_id!==economics.ticketId||approval.market_id!==economics.marketId||
     approval.leg_id!==economics.legId||approval.entitlement_id!==economics.entitlementId||approval.claim_kind!==economics.claimKind||approval.amount_uwolo!==economics.amountUwolo||
     approval.operation_id!==economics.operationId||approval.claim_id!==economics.claimId||approval.owner_id!==economics.ownerId||
     allocation.operation_id!==economics.operationId||allocation.ticket_id!==economics.ticketId||allocation.owner_id!==economics.ownerId||
     allocation.funding_tx_hash!==economics.fundingTxHash||!AMOUNT.test(economics.amountUwolo))
    refuse("original_allocation_identity_changed");
  return Object.freeze({protocol:1 as const,operationId:economics.operationId,claimId:economics.claimId,ownerId:economics.ownerId,
    ticketId:economics.ticketId,marketId:economics.marketId,legId:economics.legId,entitlementId:economics.entitlementId,
    claimKind:economics.claimKind,amountUwolo:economics.amountUwolo,escrowAddress:economics.escrowAddress,vaultAddress:economics.vaultAddress,
    allocationDigest:approval.allocation_digest,originalBankEvidenceDigest:allocation.bank_evidence_digest,fundsBudgetId:allocation.funds_budget_id,
    currentBankHeight:String(bank.height),currentBankCommitHeight:String(bank.commitHeight),
    currentBankBlockHash:bank.blockHash,currentBankAppHash:bank.appHash});
}

/** A source-bound observation of the existing Go verifier. It grants no
 * execution/credit and does not reserve the native nonce. Every actual spend
 * repeats the native checks against current protected files and bank state. */
export type SatchelReturnExecutionCheck=Readonly<{
  protocol:1;kind:"escrow_return_execution_check";
  approvalFingerprint:string;operationPermitSha256:string;reserveReviewSha256:string;
  binding:SatchelReturnReserveNativeBinding;observedAtMs:number;expiresAtMs:number;
  executionAuthorized:false;creditAuthorized:false;
}>;
const issuedChecks=new WeakSet<object>();
const checkBanks=new WeakMap<object,AuthenticatedWarSatchelBank>();
function canonical(value:unknown):string{
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value&&typeof value==="object"){const o=value as Record<string,unknown>;return "{"+Object.keys(o).sort().map(k=>JSON.stringify(k)+":"+canonical(o[k])).join(",")+"}";}
  const text=JSON.stringify(value);if(text===undefined)refuse("non_json_approval");return text;
}
function approvalFingerprint(e:SatchelClaimReturnEconomics):string{return createHash("sha256").update(canonical(e.approval)).digest("hex");}
// Bounded duplicate/case-alias validation before JSON.parse can collapse keys.
// Used only on this private check reply, not as a new financial authority.
function checkJSON(raw:string):Record<string,unknown>{
  let i=0,nodes=0;
  const space=()=>{while(i<raw.length&&/[\x20\t\r\n]/.test(raw[i]))i++;};
  const string=()=>{const begin=i++;while(i<raw.length){const c=raw[i++];if(c==='"')return JSON.parse(raw.slice(begin,i)) as string;if(c==="\\")i++;}refuse("invalid_check_json");};
  const value=(depth:number):void=>{
    if(depth>32||++nodes>20000)refuse("check_json_limit");space();
    if(raw[i]==="{"){
      i++;space();const keys=new Set<string>();if(raw[i]==="}"){i++;return;}
      for(;;){space();if(raw[i]!=='"')refuse("invalid_check_json");const key=string().toLowerCase();if(keys.has(key))refuse("duplicate_check_json_key");keys.add(key);space();if(raw[i++]!==":")refuse("invalid_check_json");value(depth+1);space();const end=raw[i++];if(end==="}")return;if(end!==",")refuse("invalid_check_json");}
    }
    if(raw[i]==="["){i++;space();if(raw[i]==="]"){i++;return;}for(;;){value(depth+1);space();const end=raw[i++];if(end==="]")return;if(end!==",")refuse("invalid_check_json");}}
    if(raw[i]==='"'){string();return;}
    const token=/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(raw.slice(i));
    if(!token)refuse("invalid_check_json");i+=token[0].length;const v=JSON.parse(token[0]);if(typeof v==="number"&&!Number.isSafeInteger(v))refuse("unsafe_check_number");
  };
  try{value(0);space();if(i!==raw.length)refuse("invalid_check_json");return object(JSON.parse(raw));}catch{refuse("invalid_check_json");}
}

export function assertCurrentSatchelReturnReserve(
  economics:SatchelClaimReturnEconomics,value:unknown,nowMs=Date.now(),
):asserts value is SatchelReturnExecutionCheck{
  if(!value||typeof value!=="object"||!issuedChecks.has(value))refuse("native_post_prepare_check_required");
  const check=value as SatchelReturnExecutionCheck,bank=checkBanks.get(value);
  if(!Number.isSafeInteger(nowMs)||!bank||!authenticatedWarSatchelBankFreshAt(bank,nowMs)||
    check.approvalFingerprint!==approvalFingerprint(economics)||nowMs<check.observedAtMs||nowMs>=check.expiresAtMs||
    nowMs-check.observedAtMs>30000||canonical(check.binding)!==canonical(satchelReturnReserveNativeBinding(economics,bank)))
    refuse("post_prepare_check_expired_or_changed");
}

/** Read-only and fixed-target. The signed review/owner permit come from native
 * protected enrollment, never caller JSON or a pre-prepare imported review.
 * The separate bank is verified by the existing pinned Go proof reader. */
export async function inspectCurrentSatchelReturnReserve(
  economics:SatchelClaimReturnEconomics,reader:typeof fetch=fetch,canceled?:AbortSignal,
):Promise<SatchelReturnExecutionCheck>{
  const token=process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN||"",body=JSON.stringify(economics.approval);
  if(!/^[A-Za-z0-9_-]{48,512}$/.test(token)||Buffer.byteLength(body,"utf8")>16384)refuse("protected_check_configuration_required");
  const signal=AbortSignal.any([AbortSignal.timeout(8500),...(canceled?[canceled]:[])]);
  signal.throwIfAborted();
  const response=await reader("http://127.0.0.1:8094/satchel/v1/returns/check-execution",{method:"POST",redirect:"error",cache:"no-store",
    headers:{Authorization:"Bearer "+token,"Content-Type":"application/json",Accept:"application/json","Accept-Encoding":"identity"},body,signal});
  const media = response.headers.get("Content-Type") || "";
  const encoding = response.headers.get("Content-Encoding");
  if (response.status !== 200 || !response.ok || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(media) ||
      (encoding && encoding !== "identity")) {
    void response.body?.cancel().catch(() => {});
    refuse("native_post_prepare_check_unavailable");
  }
  const raw=await readWarSatchelBoundedUtf8(response.body,65536);if(!raw)refuse("invalid_bounded_check");const r=checkJSON(raw);
  const names=["protocol","kind","approval","operation_permit_sha256","reserve_review_sha256","state_height","commit_height","commit_block_hash","expires_at","execution_authorized","credit_authorized"];
  if(Object.keys(r).length!==names.length||Object.keys(r).some(k=>!names.includes(k))||r.protocol!==1||r.kind!=="escrow_return_execution_check"||
    r.execution_authorized!==false||r.credit_authorized!==false||canonical(r.approval)!==canonical(economics.approval)||
    typeof r.operation_permit_sha256!=="string"||!DIGEST.test(r.operation_permit_sha256)||r.operation_permit_sha256==="0".repeat(64)||
    typeof r.reserve_review_sha256!=="string"||!DIGEST.test(r.reserve_review_sha256)||r.reserve_review_sha256==="0".repeat(64)||
    !Number.isSafeInteger(r.state_height)||(r.state_height as number)<1||!Number.isSafeInteger(r.commit_height)||
    (r.commit_height as number)-(r.state_height as number)!==1||!Number.isSafeInteger(r.expires_at)||
    typeof r.commit_block_hash!=="string"||! /^[A-Fa-f0-9]{64}$/.test(r.commit_block_hash)||/^0+$/.test(r.commit_block_hash))refuse("native_check_identity_invalid");
  const bank=await authenticateWarSatchelEscrowBank(economics.escrowAddress,reader,signal);
  const binding=satchelReturnReserveNativeBinding(economics,bank),completed=Date.now(),expiresAtMs=(r.expires_at as number)*1000;
  signal.throwIfAborted();
  if(BigInt(r.state_height as number)!==bank.height||BigInt(r.commit_height as number)!==bank.commitHeight||
    (r.commit_block_hash as string).toUpperCase()!==bank.blockHash.toUpperCase()||!Number.isSafeInteger(expiresAtMs)||
    expiresAtMs<=completed||expiresAtMs>completed+120000||expiresAtMs>bank.authenticatedHeadExpiresAtMs)refuse("native_check_bank_or_expiry_changed");
  const result=Object.freeze({protocol:1 as const,kind:"escrow_return_execution_check" as const,
    approvalFingerprint:approvalFingerprint(economics),operationPermitSha256:r.operation_permit_sha256 as string,reserveReviewSha256:r.reserve_review_sha256 as string,
    binding,observedAtMs:completed,expiresAtMs,executionAuthorized:false as const,creditAuthorized:false as const});
  checkBanks.set(result,bank);issuedChecks.add(result);assertCurrentSatchelReturnReserve(economics,result);return result;
}
