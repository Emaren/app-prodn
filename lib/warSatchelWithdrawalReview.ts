/** Independent Ed25519 review of an already durable owner withdrawal hold.
 * No signing key, browser approval boolean or exporter-selected authority. */
import {createHash,createPublicKey,verify} from "node:crypto";
import {constants} from "node:fs";
import {open,realpath} from "node:fs/promises";
import {isAbsolute} from "node:path";
import {
  withdrawalChallengeText,verifySatchelWithdrawalKeplrSignature,
  type SatchelWithdrawalChallengeProof,
} from "./warSatchelWithdrawalAuthorization.ts";

export type WithdrawalOwnerMandate=Readonly<{
  challenge:Readonly<{id:string;owner_uid:string;wallet_address:string;amount_uwolo:string;
    issued_at_utc:string;expires_at_utc:string}>;
  pub_key:Readonly<{type:string;value:string}>;signature:string;
}>;
export type IndependentWithdrawalApproval=Readonly<{
  withdrawal_id:string;challenge_id:string;owner_id:string;recipient:string;
  amount_uwolo:string;memo:string;hold_digest:string;reservation_digest:string;
  issued_at:number;expires_at:number;signature:string;
}>;
export type DurableWithdrawalEconomics=Readonly<{
  withdrawalId:string;ownerUserId:number;ownerUid:string;wallet:string;vault:string;
  amountUwolo:string;memo:string;reservationDigest:string;ownerMandate:WithdrawalOwnerMandate;
}>;
const sha=(x:unknown)=>createHash("sha256").update(JSON.stringify(x)).digest("hex");
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const DIGEST=/^[a-f0-9]{64}$/;
function stop(reason:string):never{throw Error("SATCHEL_WITHDRAWAL_REVIEW_REFUSED:"+reason);}
function exact(x:unknown,keys:string[]):Record<string,unknown>{
  if(!x||typeof x!=="object"||Array.isArray(x)||Object.keys(x).sort().join(",")!==keys.sort().join(","))stop("noncanonical_fields");
  return x as Record<string,unknown>;
}
export function ownerMandateChallenge(m:WithdrawalOwnerMandate):SatchelWithdrawalChallengeProof{
  exact(m,["challenge","pub_key","signature"]);
  exact(m.challenge,["id","owner_uid","wallet_address","amount_uwolo","issued_at_utc","expires_at_utc"]);
  exact(m.pub_key,["type","value"]);
  const c=m.challenge;
  const challenge={id:c.id,ownerUid:c.owner_uid,walletAddress:c.wallet_address,
    amountUwolo:c.amount_uwolo,issuedAtUtc:c.issued_at_utc,expiresAtUtc:c.expires_at_utc,consumedAtUtc:null};
  withdrawalChallengeText(challenge);return challenge;
}
export function withdrawalOwnerMandateDigest(m:WithdrawalOwnerMandate):string{
  const c=ownerMandateChallenge(m);
  return sha(["aoe2war/satchel/withdraw-owner-mandate/v1",c.id,c.ownerUid,c.walletAddress,c.amountUwolo,
    c.issuedAtUtc,c.expiresAtUtc,m.pub_key.type,m.pub_key.value,m.signature]);
}
/** Domain chosen by HD; the reviewer must inspect the actual immutable journal hold. */
export function withdrawalReservationDigest(x:Omit<DurableWithdrawalEconomics,"reservationDigest">):string{
  if(!UUID.test(x.withdrawalId)||!Number.isSafeInteger(x.ownerUserId)||x.ownerUserId<1||
     x.memo!=="aoe2war/satchel/withdraw/v1/"+x.withdrawalId)stop("reservation_identity");
  return sha(["aoe2war/satchel/hd-reservation/v1",x.withdrawalId,x.ownerUserId,x.ownerUid,x.wallet,x.vault,
    x.amountUwolo,x.memo,"satchel:withdraw:reserve:"+x.withdrawalId,withdrawalOwnerMandateDigest(x.ownerMandate)]);
}
export function withdrawalHoldDigest(reservationDigest:string,m:WithdrawalOwnerMandate):string{
  if(!DIGEST.test(reservationDigest))stop("reservation_digest");
  return sha(["aoe2war/satchel/withdraw-hold/v1",reservationDigest,withdrawalOwnerMandateDigest(m)]);
}
export function withdrawalApprovalSignBytes(a:IndependentWithdrawalApproval,vault:string):Buffer{
  return Buffer.from(JSON.stringify(["aoe2war/satchel/withdraw-approval/v1","wolo-1","uwolo",vault,
    a.withdrawal_id,a.challenge_id,a.owner_id,a.recipient,a.amount_uwolo,a.memo,a.hold_digest,a.issued_at,a.expires_at]));
}
export function verifyIndependentWithdrawalApproval(a:IndependentWithdrawalApproval,x:DurableWithdrawalEconomics,keyHex:string,nowMs:number){
  exact(a,["withdrawal_id","challenge_id","owner_id","recipient","amount_uwolo","memo","hold_digest","reservation_digest","issued_at","expires_at","signature"]);
  const c=ownerMandateChallenge(x.ownerMandate),issued=Date.parse(c.issuedAtUtc),expires=Date.parse(c.expiresAtUtc);
  if(!DIGEST.test(keyHex)||!Number.isSafeInteger(nowMs)||!Number.isSafeInteger(a.issued_at)||!Number.isSafeInteger(a.expires_at)||
    a.issued_at<Math.floor(issued/1000)||a.issued_at>Math.floor(nowMs/1000)||a.expires_at>Math.floor(expires/1000)||
    a.expires_at<=Math.floor(nowMs/1000)||a.expires_at<=a.issued_at||a.expires_at-a.issued_at>300||
    a.withdrawal_id!==x.withdrawalId||a.challenge_id!==c.id||a.owner_id!==x.ownerUid||a.recipient!==x.wallet||
    a.amount_uwolo!==x.amountUwolo||a.memo!==x.memo||a.reservation_digest!==x.reservationDigest||
    x.reservationDigest!==withdrawalReservationDigest(x)||a.hold_digest!==withdrawalHoldDigest(x.reservationDigest,x.ownerMandate))stop("approval_economics_or_expiry");
  verifySatchelWithdrawalKeplrSignature({challenge:c,ownerUid:x.ownerUid,ownerWallet:x.wallet,
    signature:{pub_key:x.ownerMandate.pub_key,signature:x.ownerMandate.signature},nowMs});
  if(typeof a.signature!=="string"||!/^[-A-Za-z0-9+/]+={0,2}$/.test(a.signature))stop("approval_signature");
  const sig=Buffer.from(a.signature,"base64");
  if(sig.length!==64||sig.toString("base64")!==a.signature)stop("approval_signature");
  const key=createPublicKey({format:"der",type:"spki",key:Buffer.concat([
    Buffer.from("302a300506032b6570032100","hex"),Buffer.from(keyHex,"hex")])});
  if(!verify(null,withdrawalApprovalSignBytes(a,x.vault),key,sig))stop("approval_signature");
  return true as const;
}
/** Public authority is independently provisioned on disk, never taken from a receipt. */
export async function readWithdrawalReviewerKey():Promise<string>{
  const path=process.env.WAR_SATCHEL_VERIFIER_AUTHORITY_FILE||"";
  if(!isAbsolute(path)||await realpath(path)!==path)stop("authority_path");
  const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const before=await f.stat();
    if(!before.isFile()||before.size<1||before.size>65536||(before.mode&0o022)!==0)stop("authority_file");
    const body=await f.readFile({encoding:"utf8"}),after=await f.stat();
    if(Buffer.byteLength(body)>65536||before.size!==after.size||before.mtimeMs!==after.mtimeMs)stop("authority_changed");
    const key=(JSON.parse(body) as {approval_public_key_hex?:unknown}).approval_public_key_hex;
    if(typeof key!=="string"||!DIGEST.test(key))stop("authority_key");
    return key;
  }finally{await f.close();}
}
