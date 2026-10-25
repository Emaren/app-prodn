/**
 * Prospective War Satchel epoch — independent review predicate, NEVER a live issuer.
 *
 * The protected release controller, not a request or this predicate, must pin
 * reviewer keys, authenticated wolo-1 H* evidence, account exclusivity,
 * legacy-liability ring fence, durable ledger and H* DB snapshot before any
 * actual credit. A REVIEW_ONLY result cannot enable the hard bridge.
 */
import {createPublicKey, verify} from "node:crypto";

const HEX64=/^[a-f0-9]{64}$/;
const GIT_SHA=/^[a-f0-9]{40}$/;
const HEXSIG=/^[a-f0-9]{128}$/;
const HEIGHT=/^[1-9][0-9]{0,18}$/;
const WOLO_ADDRESS=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const SPKI_PREFIX="302a300506032b6570032100";
export const PROSPECTIVE_EPOCH_MAINNET_AUTHORIZED=false as const;
export const PROSPECTIVE_EPOCH_REQUIRED_ROLES=[
  "owner","chain_custody","finance","withdrawal","recovery"
] as const;
export type EpochReviewerRole=typeof PROSPECTIVE_EPOCH_REQUIRED_ROLES[number];
export type ProspectiveEpochManifest=Readonly<{
  schema:"aoe2war.satchel.prospective-epoch.v1";chain_id:"wolo-1";
  epoch_id:string;start_height:string;start_app_hash:string;
  vault_address:string;source_commit:string;
  legacy_claims_digest:string;legacy_liability_containment_digest:string;
  custody_segregation_digest:string;hd_de_snapshot_digest:string;
  created_at_utc:string;expires_at_utc:string;
}>;
export type ProspectiveEpochSignature=Readonly<{
  role:EpochReviewerRole;signature_hex:string;
}>;
export type ProspectiveEpochReviewerKeys=Readonly<Record<EpochReviewerRole,string>>;

const issuedReviews=new WeakSet<object>();
const KEYS=[
 "schema","chain_id","epoch_id","start_height","start_app_hash","vault_address",
 "source_commit","legacy_claims_digest","legacy_liability_containment_digest",
 "custody_segregation_digest","hd_de_snapshot_digest","created_at_utc","expires_at_utc",
] as const;
function refuse(reason:string):never{throw Error("PROSPECTIVE_EPOCH_REVIEW_REFUSED:"+reason);}
function ordinaryObject(value:unknown):value is Record<string,unknown>{
 return !!value && typeof value==="object" && !Array.isArray(value) &&
  (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
}
function fields(obj:unknown,expected:readonly string[]):Record<string,unknown>{
 if(!ordinaryObject(obj)||Reflect.ownKeys(obj).length!==expected.length ||
  Reflect.ownKeys(obj).some(key=>typeof key!=="string"||!expected.includes(key)))refuse("noncanonical_fields");
 const desc=Object.getOwnPropertyDescriptors(obj);
 if(expected.some(k=>!desc[k]?.enumerable||!("value" in desc[k])))refuse("accessor_or_hidden_fields");
 return obj;
}
export function prospectiveEpochSignBytes(x:ProspectiveEpochManifest):Buffer{
 return Buffer.from(JSON.stringify(["aoe2war/satchel/prospective-epoch/v1",...KEYS.map(k=>x[k])]),"utf8");
}
export function reviewProspectiveEpoch(input:{
 manifest:unknown;signatures:unknown;trustedReviewerPublicKeys:unknown;
 expectedSourceCommit:string;expectedVault:string;nowMs?:number;
}):Readonly<{status:"REVIEW_ONLY";epochId:string;startHeight:bigint;vault:string}> {
 const x=fields(input.manifest,KEYS) as unknown as ProspectiveEpochManifest;
 if(x.schema!=="aoe2war.satchel.prospective-epoch.v1"||x.chain_id!=="wolo-1" ||
  !/^[a-zA-Z0-9_-]{12,80}$/.test(x.epoch_id) || !HEIGHT.test(x.start_height) ||
  !WOLO_ADDRESS.test(x.vault_address) ||
  !GIT_SHA.test(x.source_commit) || x.source_commit==="0".repeat(40) ||
  ![x.start_app_hash,x.legacy_claims_digest,
    x.legacy_liability_containment_digest,x.custody_segregation_digest,
    x.hd_de_snapshot_digest].every(v=>typeof v==="string"&&HEX64.test(v)) ||
  x.source_commit!==input.expectedSourceCommit ||
  x.vault_address!==input.expectedVault)refuse("untrusted_epoch_or_vault");
 const now=input.nowMs??Date.now(),start=Date.parse(x.created_at_utc),end=Date.parse(x.expires_at_utc);
 if(!Number.isSafeInteger(now)||!Number.isFinite(start)||!Number.isFinite(end)||
  end<=start||end-start>120_000||start>now||now>=end)refuse("expired_or_future_review");
 if(!ordinaryObject(input.trustedReviewerPublicKeys))refuse("no_protected_authorities");
 const trusted=fields(input.trustedReviewerPublicKeys,PROSPECTIVE_EPOCH_REQUIRED_ROLES);
 const signers=input.signatures;
 if(!Array.isArray(signers)||signers.length!==PROSPECTIVE_EPOCH_REQUIRED_ROLES.length)
  refuse("five_distinct_reviews_required");
 const seenKeys=new Set<string>(),seenRoles=new Set<string>(),message=prospectiveEpochSignBytes(x);
 for(const raw of signers){
  const sig=fields(raw,["role","signature_hex"]);
  const role=sig.role as EpochReviewerRole;
  if(!PROSPECTIVE_EPOCH_REQUIRED_ROLES.includes(role)||seenRoles.has(role))
   refuse("duplicate_or_unknown_role");
  seenRoles.add(role);
  const keyHex=trusted[role],sigHex=sig.signature_hex;
  if(typeof keyHex!=="string"||!HEX64.test(keyHex)||keyHex==="0".repeat(64)||
     seenKeys.has(keyHex)||typeof sigHex!=="string"||!HEXSIG.test(sigHex))
   refuse("duplicate_or_untrusted_review_key");
  seenKeys.add(keyHex);
  const key=createPublicKey({key:Buffer.from(SPKI_PREFIX+keyHex,"hex"),
    format:"der",type:"spki"});
  if(!verify(null,message,key,Buffer.from(sigHex,"hex")))refuse("signature");
 }
 if(seenRoles.size!==PROSPECTIVE_EPOCH_REQUIRED_ROLES.length)refuse("missing_role");
 // Cryptographically reviewed DATA, not chain finality, human identity,
 // actual account control, approved financial migration, or funding permission.
 const reviewed=Object.freeze({status:"REVIEW_ONLY" as const,epochId:x.epoch_id,
   startHeight:BigInt(x.start_height),vault:x.vault_address});
 issuedReviews.add(reviewed);
 return reviewed;
}
export function prospectiveDepositBoundaryIssue(input:{
 reviewed:Readonly<{status:"REVIEW_ONLY";startHeight:bigint;vault:string}>;
 txHeight:bigint;txVault:string;bankHeight:bigint;bankVault:string;
}):string|null{
 const x=input;
 if(!x.reviewed||typeof x.reviewed!=="object"||!issuedReviews.has(x.reviewed)||
    x.reviewed.status!=="REVIEW_ONLY"||typeof x.reviewed.startHeight!=="bigint")
  return "missing_epoch_review";
 if(!PROSPECTIVE_EPOCH_MAINNET_AUTHORIZED)return "live_financial_epoch_hold";
 if(x.txHeight<=x.reviewed.startHeight)return "historical_or_boundary_height";
 if(x.txVault!==x.reviewed.vault||x.bankVault!==x.reviewed.vault)
  return "segregated_vault_mismatch";
 if(x.bankHeight<x.txHeight+BigInt(2))return "insufficient_authenticated_confirmations";
 return null;
}
