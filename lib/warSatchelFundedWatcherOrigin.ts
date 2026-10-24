/** Explicit, independently signed source admission for FUTURE funded Watcher books.
 * Not a financial release: production creation also requires the immutable
 * Satchel bridge, durable Watcher truth and serializable creation transaction.
 * Preview books are NEVER promoted or copied into funded identity.
 */
import {createHash,createPublicKey,verify} from "node:crypto";

export type SignedFundedWatcherOrigin=Readonly<{
  version:1;chain_id:"wolo-1";session_key:string;
  proposition_hash:string;roster_hash:string;source_game_stats_id:number;
  nonce:string;issued_at:number;expires_at:number;signature:string;
}>;
export type FundedWatcherOriginFacts=Readonly<{
  sessionKey:string;propositionHash:string;rosterHash:string;sourceGameStatsId:number;
}>;
const HEX=/^[a-f0-9]{64}$/, NONCE=/^[a-zA-Z0-9_-]{16,64}$/;
const FIELDS=["version","chain_id","session_key","proposition_hash","roster_hash",
  "source_game_stats_id","nonce","issued_at","expires_at","signature"] as const;
const PREFIX="302a300506032b6570032100";
function deny(reason:string):never{throw Error("FUNDED_WATCHER_ORIGIN_REFUSED:"+reason)}
function canonical(x:unknown):Record<string,unknown>{
  if(!x||typeof x!=="object"||Array.isArray(x)||
    ![Object.prototype,null].includes(Object.getPrototypeOf(x)))deny("malformed");
  const k=Reflect.ownKeys(x);if(k.length!==FIELDS.length||k.some(v=>typeof v!=="string"||!FIELDS.includes(v as typeof FIELDS[number])))deny("noncanonical_fields");
  const d=Object.getOwnPropertyDescriptors(x),out:Record<string,unknown>={};
  for(const field of FIELDS){if(!d[field]?.enumerable||!("value" in d[field]))deny("noncanonical_fields");out[field]=d[field].value}
  return out;
}
/** Stable JSON tuple; reviewer signs these exact UTF-8 bytes, never a client digest. */
export function fundedWatcherOriginSignBytes(x:SignedFundedWatcherOrigin):Buffer{
  return Buffer.from(JSON.stringify(["aoe2war/satchel/funded-watcher-origin/v1",
    x.version,x.chain_id,x.session_key,x.proposition_hash,x.roster_hash,
    x.source_game_stats_id,x.nonce,x.issued_at,x.expires_at]),"utf8");
}
export function verifyIndependentFundedWatcherOrigin(input:{
  signed:unknown;expected:FundedWatcherOriginFacts;publicKeyHex:string;nowMs:number;
}):Readonly<SignedFundedWatcherOrigin&{originKey:string}>{
  const x=canonical(input.signed);
  if(x.version!==1||x.chain_id!=="wolo-1"||
     typeof x.session_key!=="string"||x.session_key.length<4||x.session_key.length>255||
     !HEX.test(String(x.proposition_hash))||!HEX.test(String(x.roster_hash))||
     !Number.isSafeInteger(x.source_game_stats_id)||Number(x.source_game_stats_id)<=0||
     !NONCE.test(String(x.nonce))||
     !Number.isSafeInteger(x.issued_at)||!Number.isSafeInteger(x.expires_at)||
     Number(x.issued_at)<1||Number(x.expires_at)<=Number(x.issued_at)||
     Number(x.expires_at)-Number(x.issued_at)>60)deny("invalid_evidence");
  const e=input.expected;
  if(!e||x.session_key!==e.sessionKey||x.proposition_hash!==e.propositionHash||
     x.roster_hash!==e.rosterHash||x.source_game_stats_id!==e.sourceGameStatsId)
     deny("watcher_proposition_mismatch");
  if(!Number.isSafeInteger(input.nowMs)||input.nowMs<0||
     Number(x.issued_at)>Math.floor(input.nowMs/1000)||
     Number(x.expires_at)<=Math.floor(input.nowMs/1000))deny("expired_or_future");
  if(typeof input.publicKeyHex!=="string"||!HEX.test(input.publicKeyHex)||
     input.publicKeyHex==="0".repeat(64))deny("untrusted_reviewer");
  if(typeof x.signature!=="string"||! /^[A-Za-z0-9+/]{86}==$/.test(x.signature))deny("signature_encoding");
  const sig=Buffer.from(x.signature,"base64");
  if(sig.length!==64||sig.toString("base64")!==x.signature)deny("signature_encoding");
  const key=createPublicKey({format:"der",type:"spki",
    key:Buffer.from(PREFIX+input.publicKeyHex,"hex")});
  if(!verify(null,fundedWatcherOriginSignBytes(x as SignedFundedWatcherOrigin),key,sig))
     deny("independent_signature");
  // Game+proposition identity is stable across changes in uploader or proof row.
  // The signed source row is still checked independently by the database writer.
  const digest=createHash("sha256").update(JSON.stringify(
    ["aoe2war/funded-book/v1",x.chain_id,x.session_key,x.proposition_hash])).digest("hex");
  return Object.freeze({...x,originKey:digest}) as SignedFundedWatcherOrigin&{originKey:string};
}
export function fundedWatcherBookNames(origin:{originKey:string}):{
  winnerSlug:string;desyncSlug:string;winnerPhaseKey:string;desyncPhaseKey:string;
}{
  if(!HEX.test(origin.originKey))deny("invalid_origin_key");
  const prefix="funded-"+origin.originKey.slice(0,32);
  return Object.freeze({
    winnerSlug:prefix+"-winner",desyncSlug:prefix+"-desync",
    winnerPhaseKey:"funded:"+origin.originKey+":winner",
    desyncPhaseKey:"funded:"+origin.originKey+":desync",
  });
}
