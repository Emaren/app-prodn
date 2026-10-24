import {withHdFinancialLease} from "./hdFinancialMaintenanceFence.ts";
import {BET_MAX_STAKE_UWOLO} from "./betMoneyLimits.ts";
/**
 * War Satchel dedicated one-shot custody signer CLIENT PORT.
 *
 * This file contains NO mnemonic, keyring, chain CLI or signing key.
 * It can only contact a separate, independently controlled LOOPBACK service
 * after an operator explicitly certifies that service's vault and durable
 * one-shot request semantics. A settlement service or validator is NOT such
 * a signer and MUST NOT be reused.
 *
 * Deploying this file DOES NOT create a signer or authorize a transfer.
 */
import type { IsolatedSatchelSigner } from "./warSatchelAutoBetExecutor.ts";
import {verifyIndependentWagerReservation,type SatchelWagerReservation} from "./warSatchelWagerReservation.ts";
import {readWagerReviewerKey} from "./warSatchelWagerReviewerKey.ts";
import {readWarSatchelBoundedUtf8} from "./warSatchelBoundedBody.ts";

const ENDPOINT = "http://127.0.0.1:8094";
const ADDR = /^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const TX = /^[A-F0-9]{64}$/;
const EXACT_TICKET_MEMO = /^AoE2HDBets bet ticket v1 · ticket [1-9][0-9]{0,11}$/;
const MAX_BODY = 16384;
let activeRequests = 0;

function refuse(reason: string): never {
  throw Error("SATCHEL_DEDICATED_SIGNER_UNAVAILABLE:" + reason);
}
function strictRecord(x: unknown): Record<string, unknown> {
  if (!x || typeof x !== "object" || Array.isArray(x)) refuse("invalid_response");
  return x as Record<string, unknown>;
}
function config() {
  if (process.env.WAR_SATCHEL_SIGNER_CLIENT_ENABLED !== "true" ||
      process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED !== "true" ||
      process.env.WAR_SATCHEL_FINANCIAL_OPERATOR_ATTESTED !== "true") {
    refuse("operator_activation_not_certified");
  }
  const address = process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS?.trim() || "";
  const escrow = process.env.WOLO_BET_ESCROW_ADDRESS?.trim() || "";
  const build = process.env.WAR_SATCHEL_SIGNER_BUILD_SHA256?.trim() || "";
  const token = process.env.WAR_SATCHEL_SIGNER_AUTH_TOKEN || "";
  if (!ADDR.test(address) || !ADDR.test(escrow) ||
      escrow === address || !SHA256.test(build) ||
      token.length < 48 || token.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(token)) {
    refuse("signer_provisioning_incomplete");
  }
  return { address, escrow, build, token,
    reviewAuthority:process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE || "",
    wagerReviewAuthority:process.env.WAR_SATCHEL_WAGER_VERIFIER_AUTHORITY_FILE || "" };
}
function abortable<T>(pending:Promise<T>,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const aborted=()=>reject(signal.reason);
    signal.addEventListener("abort",aborted,{once:true});
    pending.then(value=>{signal.removeEventListener("abort",aborted);resolve(value);},
      error=>{signal.removeEventListener("abort",aborted);reject(error);});
    if(signal.aborted)aborted();
  });
}
async function request(
  path: "/satchel/v1/health" | "/satchel/v2/one-shot",
  token: string, body: unknown, reader: typeof fetch, canceled?:AbortSignal,
): Promise<Record<string, unknown>> {
  if(activeRequests>=4)refuse("signer_client_busy");
  activeRequests++;
  const signal=AbortSignal.any([AbortSignal.timeout(body===null?4000:8500),...(canceled?[canceled]:[])]);
  try{
    signal.throwIfAborted();
    const fetching=reader(ENDPOINT+path,{
      method:body===null?"GET":"POST",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json",Authorization:"Bearer "+token,
        ...(body===null?{}:{"Content-Type":"application/json"})},
      body:body===null?undefined:JSON.stringify(body),signal,
    });
    // Real fetch honors the signal; also cancel a late injected-reader reply.
    void fetching.then(reply=>{if(signal.aborted)void reply.body?.cancel().catch(()=>{});},()=>{});
    const result=await abortable(fetching,signal);
    const size=Number(result.headers.get("content-length")||"0");
    if(!result.ok||result.status!==200||!Number.isSafeInteger(size)||size<0||size>MAX_BODY){
      void result.body?.cancel().catch(()=>{});
      refuse("refused_or_missing_signer_response");
    }
    // pipeThrough propagates abort/cancel while the shared bounded reader owns
    // its lock, including a stalled body after successful HTTP headers.
    const stream=result.body?.pipeThrough(new TransformStream<Uint8Array,Uint8Array>(),{signal})??null;
    const raw=await abortable(readWarSatchelBoundedUtf8(stream,MAX_BODY),signal);
    if(!raw)refuse("oversized_or_invalid_signer_receipt");
    signal.throwIfAborted();
    return strictRecord(JSON.parse(raw) as unknown);
  }finally{activeRequests--;}
}
function healthIsExact(
  health: Record<string, unknown>, cfg: ReturnType<typeof config>,
) {
  // Source-level signing admission is not proof of actual funded custody.
  // The current Wolo service explicitly reports UNAVAILABLE, even with an
  // accepting test permit. Never POST money on the strength of "ok" alone.
  // AVAILABLE must only be issued by a separately certified, reserve-backed
  // custody service; no environment flag or app-side fallback can supply it.
  if (health.custody_capability !== "AVAILABLE" ||
      health.ok !== true || health.accepting !== true || health.execution_protocol !== 2 ||
      health.owner_bound_wager_reservation_required !== true || health.chain_id !== "wolo-1" ||
      health.signer_role !== "exclusive-war-satchel-v1" ||
      health.durable_one_shot !== true ||
      health.replay_after_restart_forbidden !== true ||
      health.refunds_require_chain_proof !== true ||
      health.vault_address !== cfg.address ||
      health.build_sha256 !== cfg.build ||
      health.custody_mnemonic_shared_with_other_roles !== false) {
    refuse("signer_is_not_exclusive_or_not_attested");
  }
}

/**
 * This connection is only an I/O adapter. The isolated signer MUST persist
 * requestId + exact economic payload to fsync'ed state BEFORE signing and
 * return UNKNOWN on crash, timeout or uncertain broadcast. A client promise
 * or source-code claim cannot certify those external properties.
 */
export async function connectCertifiedSatchelSigner(
  reader: typeof fetch = fetch, canceled?:AbortSignal,
): Promise<IsolatedSatchelSigner> {
  const cfg = config();
  const health = await request("/satchel/v1/health", cfg.token, null, reader,canceled);
  healthIsExact(health, cfg);
  function sameConfiguration(){
    const current=config();
    return current.address===cfg.address&&current.escrow===cfg.escrow&&
      current.build===cfg.build&&current.token===cfg.token&&
      current.reviewAuthority===cfg.reviewAuthority&&
      current.wagerReviewAuthority===cfg.wagerReviewAuthority;
  }
  return Object.freeze({
    custodyRole: "exclusive-war-satchel-v1" as const,
    attestedVaultAddress: cfg.address,
    async submitOneShot(input: Parameters<IsolatedSatchelSigner["submitOneShot"]>[0]) {
      try{
        canceled?.throwIfAborted();
        // Snapshot immutable primitive economics and the original approval
        // before any I/O. The ledger owns durable approval/attempt persistence.
        const p={requestId:input.requestId,ownerUid:input.ownerUid,chainId:input.chainId,
          senderAddress:input.senderAddress,recipientAddress:input.recipientAddress,
          denom:input.denom,amountUwolo:input.amountUwolo,memo:input.memo};
        const approval={...input.reservation} as SatchelWagerReservation;
        if (p.chainId!=="wolo-1"||p.senderAddress!==cfg.address||p.denom!=="uwolo"||
            p.recipientAddress!==cfg.escrow||p.recipientAddress===cfg.address||
            !/^satchel:ticket:[1-9][0-9]{0,11}$/.test(p.requestId)||
            !/^[a-zA-Z0-9_.:-]{1,100}$/.test(p.ownerUid)||
            !/^[1-9][0-9]{0,18}$/.test(p.amountUwolo)||
            BigInt(p.amountUwolo)>BET_MAX_STAKE_UWOLO||
            BigInt(p.amountUwolo)%BigInt(1000000)!==BigInt(0)||!EXACT_TICKET_MEMO.test(p.memo)){
          return {kind:"unknown" as const,reason:"invalid_or_ambiguous_signer_payload"};
        }
        if(!sameConfiguration())return {kind:"unknown" as const,reason:"signer_configuration_changed"};
        const publicKey=await readWagerReviewerKey();
        const expected={operationId:p.requestId,ownerUid:p.ownerUid,vault:p.senderAddress,
          recipient:p.recipientAddress,amountUwolo:p.amountUwolo,memo:p.memo,
          reservationDigest:approval.reservation_digest,ledgerRevision:approval.ledger_revision,
          consentDigest:approval.consent_digest,feeUwolo:approval.fee_uwolo,
          issuedAt:approval.issued_at,expiresAt:approval.expires_at};
        verifyIndependentWagerReservation(approval,expected,publicKey,Date.now());
        healthIsExact(await request("/satchel/v1/health",cfg.token,null,reader,canceled),cfg);
        // Neither slow health nor an authority read may outlive the exact
        // original grant or change the pinned service immediately before send.
        if(!sameConfiguration())return {kind:"unknown" as const,reason:"signer_configuration_changed"};
        canceled?.throwIfAborted();
        const reviewed=verifyIndependentWagerReservation(approval,expected,publicKey,Date.now());
        const receipt=await withHdFinancialLease({scope:"hd-satchel",producer:"satchel-wager",wallet:cfg.address},lease=>request("/satchel/v2/one-shot",cfg.token,{
          protocol:2,request_id:p.requestId,owner_id:p.ownerUid,chain_id:p.chainId,
          signer_role:"exclusive-war-satchel-v1",from_address:p.senderAddress,
          to_address:p.recipientAddress,amount:{denom:"uwolo",amount:p.amountUwolo},
          memo:p.memo,reservation:reviewed,
        },reader,AbortSignal.any([lease,...(canceled?[canceled]:[])])));
        const allowed=["operation_id","request_id","chain_id","signer_role","status",
          "durable_request_fenced","kind","reason","tx_hash","credit_authorized","confirmed"];
        const accepted=receipt.status==="ACCEPTED"&&receipt.kind==="broadcast_accepted"&&receipt.confirmed===false;
        const confirmed=receipt.status==="CONFIRMED"&&receipt.kind==="unknown"&&!("confirmed" in receipt);
        if(Object.keys(receipt).some(key=>!allowed.includes(key))||
            receipt.request_id!==p.requestId||receipt.operation_id!==p.requestId||
            receipt.chain_id!=="wolo-1"||receipt.signer_role!=="exclusive-war-satchel-v1"||
            (!accepted&&!confirmed)||receipt.durable_request_fenced!==true||receipt.credit_authorized!==false||
            typeof receipt.reason!=="string"||!/^[A-Za-z0-9_:-]{1,96}$/.test(receipt.reason)||
            typeof receipt.tx_hash!=="string"||!TX.test(receipt.tx_hash)||receipt.tx_hash==="0".repeat(64)){
          return {kind:"unknown" as const,reason:"signer_receipt_not_proven"};
        }
        // Even a service CONFIRMED string is only a candidate hash. The caller
        // must authenticate the original operation proof before ticket/ledger
        // effects. No network acknowledgment can issue financial finality.
        return {kind:"broadcast_accepted" as const,txHash:receipt.tx_hash};
      }catch{
        // Missing review, cancellation, refusal and lost responses never retry.
        return {kind:"unknown" as const,reason:"signer_transport_or_identity_unknown"};
      }
    },
  });
}
