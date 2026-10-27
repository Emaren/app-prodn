/**
 * HELD HD -> Wolo epochescrow.RequestMessage adapter, SOURCE PIN PR #115.
 * Mirrors Go Request struct JSON-tag order at dd45bc95579e..., strictly
 * ASCII-only to avoid Go encoding/json HTML/U+2028 escaping differences.
 *
 * It builds UNSIGNED bytes only. Secp256k1 owner signature and Ed25519 reviewer
 * approval are distinct Wolo-side responsibilities. It cannot sign or execute.
 */
import {createHash} from "node:crypto";
export const EPOCH_V3_GO_WIRE_EXECUTION_ENABLED = false as const;
const PROTOCOL="aoe2war/escrow-epoch/v3";
const REQUEST_KEYS=[
 "bank_state_height","bank_commit_height","bank_commit_hash","bank_app_hash",
 "protocol","command","chain_id","denom","epoch_id","operation_id",
 "original_operation_id","entitlement_id","owner_uid","owner_wallet",
 "owner_public_key_hex","original_mandate_sha256","wager_id","ticket_id",
 "market_id","leg_id","funding_tx_hash","funding_message_index","sender",
 "recipient","amount_uwolo","memo","policy_sha256","source_commit",
 "binary_sha256","config_sha256","plan","resolution_evidence_sha256",
 "vault_reserve","escrow_reserve","nonce","reviewer_permit_id",
 "issued_at","expires_at","owner_signature","reviewer_signature"
] as const;
const PLAN_KEYS=["epoch_id","market_id","resolution","wagers"] as const;
const WAGER_KEYS=["wager_id","market_id","ticket_id","leg_id","owner_uid",
 "side","principal_uwolo","funding_tx_hash","funding_message_index"] as const;
const RESERVE_KEYS=["account","liabilities_uwolo","maximum_unknown_outflow_uwolo",
 "gas_reserve_uwolo","operating_floor_uwolo","inventory_sha256","nonoverlap_sha256"] as const;
const INT_FIELDS=new Set(["bank_state_height","bank_commit_height",
 "wager_id","ticket_id","market_id","leg_id","funding_message_index",
 "issued_at","expires_at"]);
function refuse(msg:string):never{throw Error("EPOCH_V3_GO_WIRE_HOLD:"+msg);}
function rec(v:unknown):Record<string,unknown>{
 if(!v||typeof v!=="object"||Array.isArray(v))refuse("not_object");
 return v as Record<string,unknown>;
}
function ascii(v:unknown):boolean{
 return typeof v==="string" && /^[\x20-\x7E]*$/.test(v) &&
   !/[<>&\\]/.test(v); // Go/JS escaping differences; reject, do not approximate.
}
function ordered(v:unknown,keys:readonly string[],name:string) {
 const p=rec(v);
 if(Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k)))
   refuse("missing_or_extra_"+name);
 const out:Record<string,unknown>={};
 for(const key of keys) {
   const value=p[key];
   if(name==="request" && key==="plan"){out[key]=goPlan(value);continue;}
   if(name==="request" && (key==="vault_reserve"||key==="escrow_reserve")){
     out[key]=ordered(value,RESERVE_KEYS,"reserve");continue;
   }
   if(name==="plan" && key==="wagers"){
     if(!Array.isArray(value)||value.length<1||value.length>1000)refuse("wager_count");
     out[key]=value.map(w=>ordered(w,WAGER_KEYS,"wager"));continue;
   }
   if(typeof value==="number"){
     if(!Number.isSafeInteger(value)||value<0)refuse("unsafe_go_integer_"+key);
     // The Go source emits JSON numbers for int64/uint64, never quoted strings.
     if(!INT_FIELDS.has(key))refuse("numeric_field_"+key);
   }else if(!ascii(value))refuse("noncanonical_go_string_"+key);
   out[key]=value;
 }
 return out;
}
function goPlan(p:unknown){return ordered(p,PLAN_KEYS,"plan");}
/** Go uses json.Marshal([]any{Protocol, Request{... signatures blank ...}}).
 * This excludes both signatures from their own signed message.
 */
export function buildHeldWoloV3RequestMessage(request:unknown) {
 const r=rec(request);
 if(r.protocol!==PROTOCOL||r.chain_id!=="wolo-1"||r.denom!=="uwolo"||
   (r.command!=="epoch.escrow.return.execute.v3"&&
    r.command!=="epoch.escrow.fee.execute.v3"))refuse("invalid_protocol_or_command");
 const x=ordered(r,REQUEST_KEYS,"request");
 x.owner_signature="";x.reviewer_signature="";
 const preimage=JSON.stringify([PROTOCOL,x]);
 return Object.freeze({protocol:PROTOCOL,preimageUtf8:preimage,
   sha256OfPreimage:createHash("sha256").update(preimage,"utf8").digest("hex"),
   status:"UNSIGNED_NONAUTHORIZING" as const,
   secpOwnerSignatureRequired:true as const,
   independentEd25519ReviewerRequired:true as const,
   executionAuthorized:false as const});
}
/** Go Fingerprint(r)=SHA256(json.Marshal([]any{Protocol, string(RequestMessage(r))})).
 * Cross-language test vector still required from Codex; source-only candidate.
 */
export function heldWoloV3Fingerprint(request:unknown) {
 const message=buildHeldWoloV3RequestMessage(request).preimageUtf8;
 return createHash("sha256").update(JSON.stringify([PROTOCOL,message]),"utf8").digest("hex");
}
