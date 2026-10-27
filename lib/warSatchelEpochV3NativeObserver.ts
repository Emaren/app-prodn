/**
 * HELD Phase-5 candidate native v3 OBSERVATION transport. No private executor
 * exists at this proposed loopback endpoint as of Wolo #111 (e547f244...).
 * GET-only, bounded and pinned. HTTP bodies are NEVER native proof or credit.
 * Wolo must separately implement/authenticate the future v3 wire.
 */
import { readWarSatchelBoundedUtf8 } from "./warSatchelBoundedBody.ts";

const LOOPBACK = "http://127.0.0.1:8095";
const CAP = 64 * 1024;
const HASH = /^[A-F0-9]{64}$/;
const EPOCH = /^[a-z][a-z0-9_-]{11,63}$/;
const OP = /^satchel:e3:[a-z][a-z0-9_-]{11,63}:[1-9][0-9]{0,14}$/;
const SOURCE = /^[a-f0-9]{40}$/;
type Fetcher = (input:string,init:RequestInit)=>Promise<Response>;
function hold(reason:string):never{throw Error("EPOCH_V3_NATIVE_OBSERVER_HOLD:"+reason);}
function requireIt(ok:unknown,reason:string):asserts ok{if(!ok)hold(reason);}
function object(x:unknown):Record<string,unknown>{
  requireIt(x!==null&&typeof x==="object"&&!Array.isArray(x),"not_object");
  return x as Record<string,unknown>;
}
export type V3NativeObservationContext=Readonly<{
  epochId:string; expectedWoloSourceCommit:string; expectedChainId:"wolo-1";
  operationId?:string;
}>;
export type V3NativeObservation=Readonly<{
  protocol:"aoe2war/escrow-epoch/v3"; kind:"operation"|"bank";
  source:"proposed_8095_loopback_readonly";
  payload:Readonly<Record<string,unknown>>;
  bankVerified:false; custodianVerified:false; moneyAuthorized:false;
}>;
/** A real native verifier must consume the independently authenticated
 * signed H/H+1/ICS23/physical MsgSend in a *separate security boundary*.
 */
export async function readHeldEpochV3Observation(
  kind:"operation"|"bank",context:V3NativeObservationContext,
  read:Fetcher=fetch,
):Promise<V3NativeObservation>{
  requireIt(context && EPOCH.test(context.epochId) &&
    SOURCE.test(context.expectedWoloSourceCommit) &&
    context.expectedChainId==="wolo-1", "invalid_source_or_epoch");
  let suffix="/epoch/v3/bank/"+encodeURIComponent(context.epochId);
  if(kind==="operation"){
    requireIt(typeof context.operationId==="string"&&OP.test(context.operationId) &&
      context.operationId.startsWith("satchel:e3:"+context.epochId+":"),"wrong_epoch_operation");
    suffix="/epoch/v3/operations/"+encodeURIComponent(context.operationId);
  }else requireIt(kind==="bank","unknown_observation");
  let response:Response;
  try {
    response=await read(LOOPBACK+suffix,{
      method:"GET",redirect:"error",cache:"no-store",credentials:"omit",
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(4000)
    });
  }catch{hold("native_observer_unavailable");}
  requireIt(response!.ok&&response!.status===200&&
    response!.headers.get("content-type")?.toLowerCase().startsWith("application/json"),
    "native_observer_not_installed");
  const length=response!.headers.get("content-length");
  requireIt(length===null||(/^[0-9]+$/.test(length)&&Number(length)<=CAP),
    "oversized_native_observation");
  const body=await readWarSatchelBoundedUtf8(response!.body,CAP);
  requireIt(body!==null,"native_observation_body_bounded");
  let payload:Record<string,unknown>;
  try{payload=object(JSON.parse(body));}catch{hold("native_observation_not_json");}
  requireIt(payload.protocol==="aoe2war/escrow-epoch/v3" &&
    payload.chain_id==="wolo-1" &&
    payload.epoch_id===context.epochId &&
    payload.source_commit===context.expectedWoloSourceCommit,
    "source_or_epoch_mismatch");
  if(kind==="operation")
    requireIt(payload.operation_id===context.operationId,"wrong_operation");
  // Deliberately never map remote "verified", "sent", "paid", "go" flags to a
  // trusted capability. This transport is not an ICS23/CometBFT verifier.
  return Object.freeze({
    protocol:"aoe2war/escrow-epoch/v3" as const,kind,
    source:"proposed_8095_loopback_readonly" as const,
    payload:Object.freeze(payload),bankVerified:false as const,
    custodianVerified:false as const,moneyAuthorized:false as const
  });
}
