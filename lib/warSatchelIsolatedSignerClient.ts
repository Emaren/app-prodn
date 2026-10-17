/**
 * HD-only, loopback-bound adapter for an independently operated, one-shot
 * War Satchel custody sidecar. Does NOT contain keys or sign chain bytes.
 *
 * This implements the port used by the Watcher funded ticket executor.
 * It cannot be enabled by the website alone: a separately certified,
 * operator-managed sidecar must durably fence each transfer ID BEFORE signing,
 * enforce the exact vault+escrow+amount+memo itself, and attest the key role.
 *
 * Fail-closed: any HTTP timeout, unreadable response, or missing proof is
 * UNKNOWN (not a definitive rejection) and MUST NOT release reserved WOLO.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getWoloBetEscrowRuntime } from "./woloChain.ts";
import { buildBetStakeTicketMemo } from "./betStakeMemo.ts";
import type { IsolatedSatchelSigner } from "./warSatchelAutoBetExecutor.ts";

const URL="http://127.0.0.1:8194/v1/one-shot";
const HEALTH="http://127.0.0.1:8194/v1/health";
const W=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const REQUEST=/^satchel:ticket:[1-9][0-9]{0,14}$/;
const HASH=/^[A-F0-9]{64}$/;
const AMOUNT=/^[1-9][0-9]{0,18}$/;
const MAX_BODY=4096;
const TOKEN=/^(?:[a-f0-9]{64}|[a-f0-9]{128})$/i;
const PORT=8194;
const MAX_GAME=BigInt(1000)*BigInt(1000000);

function stop(reason:string):never {throw Error("SATCHEL_ISOLATED_SIGNER_CLIENT_REFUSED:"+reason);}
function digest(secret:Buffer,data:Buffer):string {
  return createHmac("sha256",secret).update(data).digest("hex");
}
function assertSetup(){
  if(process.env.WAR_SATCHEL_SIGNER_SIDECAR_READY!=="true"||
      process.env.WAR_SATCHEL_VAULT_CUSTODY_ROLE_VERIFIED!=="true"||
      process.env.WAR_SATCHEL_LIVE_EXECUTOR_ENABLED!=="true")stop("signer_not_enabled");
  const addr=(process.env.WAR_SATCHEL_CERTIFIED_VAULT_ADDRESS||"").trim();
  const secret=(process.env.WAR_SATCHEL_SIGNER_SIDECAR_SHARED_SECRET||"").trim();
  if(!W.test(addr)||!TOKEN.test(secret))stop("missing_isolated_signer_certificate");
  const escrow=getWoloBetEscrowRuntime();
  if(!escrow.onchainAllowed||!escrow.escrowAddress||!W.test(escrow.escrowAddress)||
      escrow.escrowAddress===addr)stop("missing_distinct_escrow");
  return {addr,escrow:escrow.escrowAddress,secret:Buffer.from(secret,"hex")};
}
async function boundedResponse(res:Response){
  if(!res.ok||res.status!==200)throw Error("isolated_signer_non_success_unknown");
  const declared=Number(res.headers.get("content-length")||"0");
  if(!Number.isSafeInteger(declared)||declared>MAX_BODY)throw Error("oversize_reply_unknown");
  const raw=await res.text();
  if(Buffer.byteLength(raw,"utf8")>MAX_BODY)throw Error("oversize_reply_unknown");
  const val:unknown=JSON.parse(raw);
  if(!val||typeof val!=="object"||Array.isArray(val))throw Error("invalid_reply_unknown");
  return val as Record<string,unknown>;
}
function signedEnvelope(body:Record<string,unknown>,secret:Buffer){
  const raw=Buffer.from(JSON.stringify(body),"utf8");
  const tag=digest(secret,raw);
  return {raw,tag};
}
export type SatchelCustodySidecarConfiguration=Readonly<{
  signingPort:typeof PORT;
  signerRole:"exclusive-war-satchel-v1";
  loopbackOnly:true;
  noBrowserCredentials:true;
  noAutomaticBroadcastRetry:true;
}>;
export const SATCHEL_SIDECAR_CONTRACT:SatchelCustodySidecarConfiguration=
  Object.freeze({
    signingPort:PORT,signerRole:"exclusive-war-satchel-v1",
    loopbackOnly:true,noBrowserCredentials:true,noAutomaticBroadcastRetry:true,
  });

/**
 * Challenge-response health proof authenticates the loopback sidecar process,
 * not its hardware/key control. The latter REQUIRES independent operator
 * attestation, signer runtime read-only inspection and actual chain canary.
 * Both sides must verify HMAC in constant time; the sidecar protocol is
 * intentionally NOT backward compatible with any other Wolo signer service.
 */
export async function makeSatchelLoopbackSigner(
  reader:typeof fetch=fetch,
):Promise<IsolatedSatchelSigner>{
  const cfg=assertSetup();
  const nonce=randomBytes(16).toString("hex");
  const timestamp=Date.now();
  const probe={protocol:"satchel-custody-v1",challenge:nonce,atMs:timestamp,
    chainId:"wolo-1",vaultAddress:cfg.addr};
  const {raw,tag}=signedEnvelope(probe,cfg.secret);
  let health:Record<string,unknown>;
  try{
    const res=await reader(HEALTH,{
      method:"POST",redirect:"error",cache:"no-store",
      headers:{"Content-Type":"application/json",
        "X-Satchel-Hmac":tag},
      body:raw.toString("utf8"),signal:AbortSignal.timeout(3000),
    });
    health=await boundedResponse(res);
  }catch{stop("sidecar_health_not_authenticated")}
  const result={
    protocol:health.protocol,challenge:health.challenge,
    role:health.role,chainId:health.chainId,
    vaultAddress:health.vaultAddress,escrowAddress:health.escrowAddress,
    ready:health.ready,loopbackOnly:health.loopbackOnly,
  };
  if(result.protocol!=="satchel-custody-v1"||
      result.challenge!==nonce||
      result.role!=="exclusive-war-satchel-v1"||
      result.chainId!=="wolo-1"||
      result.vaultAddress!==cfg.addr||result.escrowAddress!==cfg.escrow||
      result.ready!==true||result.loopbackOnly!==true||
      typeof health.proof!=="string"||!HASH.test(health.proof.toUpperCase())){
    stop("sidecar_health_identity_mismatch");
  }
  const expected=digest(cfg.secret,Buffer.from(JSON.stringify(result),"utf8"));
  const received=Buffer.from(health.proof,"hex");
  if(received.length!==32 || !timingSafeEqual(received,Buffer.from(expected,"hex"))){
    stop("sidecar_health_hmac_mismatch");
  }

  const attempted=new Set<string>();
  return Object.freeze({
    attestedVaultAddress:cfg.addr,
    custodyRole:"exclusive-war-satchel-v1" as const,
    async submitOneShot(input: Parameters<IsolatedSatchelSigner["submitOneShot"]>[0]){
      // A client object is one-use as an extra line of defense. The REAL
      // signer MUST persist durable global ID uniqueness across restarts.
      if(attempted.has(input.requestId))
        return {kind:"unknown" as const,reason:"same_payment_id_never_retried"};
      // Mark attempted before even evaluating the payload. This does not
      // substitute for durable sidecar dedupe across process restarts.
      attempted.add(input.requestId);
      const ticketMemo=typeof input.memo==="string"
        ? /^AoE2HDBets bet ticket v1 · ticket ([1-9][0-9]{0,14})$/.exec(input.memo)
        : null;
      const parsedTicketId=ticketMemo?Number(ticketMemo[1]):0;
      if(!REQUEST.test(input.requestId)||
          input.chainId!=="wolo-1"||input.denom!=="uwolo"||
          input.senderAddress!==cfg.addr||
          input.recipientAddress!==cfg.escrow||
          !AMOUNT.test(input.amountUwolo)||
          BigInt(input.amountUwolo)>MAX_GAME||
          typeof input.memo!=="string"||input.memo.length>240||
          !Number.isSafeInteger(parsedTicketId)||parsedTicketId<=0||
          input.memo!==buildBetStakeTicketMemo(parsedTicketId)){
        return {kind:"unknown" as const,reason:"custody_send_did_not_match_fenced_wager"};
      }
      const payload={
        protocol:"satchel-custody-v1",
        requestId:input.requestId,
        chainId:"wolo-1",denom:"uwolo",
        senderAddress:cfg.addr,recipientAddress:cfg.escrow,
        amountUwolo:input.amountUwolo,memo:input.memo,
      };
      const {raw:bytes,tag:mac}=signedEnvelope(payload,cfg.secret);
      try{
        const res=await reader(URL,{
          method:"POST",redirect:"error",cache:"no-store",
          headers:{"Content-Type":"application/json","X-Satchel-Hmac":mac},
          body:bytes.toString("utf8"),signal:AbortSignal.timeout(8000),
        });
        const parsed=await boundedResponse(res);
        if(parsed.protocol!=="satchel-custody-v1"||
            parsed.requestId!==input.requestId||
            parsed.status!=="broadcast_confirmed"||
            typeof parsed.txHash!=="string"||
            !HASH.test(parsed.txHash.toUpperCase()))
          return {kind:"unknown" as const,reason:"sidecar_acknowledgement_unproven"};
        return {kind:"broadcast_confirmed" as const,
          txHash:parsed.txHash.toUpperCase()};
      }catch{
        return {kind:"unknown" as const,reason:"sidecar_http_or_transport_unknown"};
      }
    },
  });
}
