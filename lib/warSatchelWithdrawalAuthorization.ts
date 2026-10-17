/**
 * Explicit one-use Keplr withdrawal approval. A Mecha auto-bet spending
 * mandate does NOT authorize withdrawals, and no source of chain keys is
 * available to this verifier. Approval is tied to a server-persisted challenge.
 */
import { createPublicKey, ECDH, verify as verifyEcdsa } from "node:crypto";
import { makeSignDoc, pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";

const MARK=Symbol("VerifiedSatchelWithdrawalOwner");
const ADDRESS=/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/;
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const I64=BigInt("9223372036854775807");
const MAX=BigInt(50000)*BigInt(1000000);
function fail(reason:string):never {throw Error("SATCHEL_WITHDRAW_SIGNATURE_REFUSED:"+reason);}
function validB64(value:unknown,length:number){
  if(typeof value!=="string"||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))fail("invalid_base64");
  const raw=Buffer.from(value,"base64");
  if(raw.length!==length||raw.toString("base64")!==value)fail("invalid_byte_length");
  return raw;
}
export type SatchelWithdrawalChallengeProof=Readonly<{
  id:string;ownerUid:string;walletAddress:string;amountUwolo:string;
  issuedAtUtc:string;expiresAtUtc:string;consumedAtUtc:string|null;
}>;
export type SatchelVerifiedWithdrawal=Readonly<{
  challengeId:string; ownerUid:string;walletAddress:string;
  amountUwolo:string;verifiedAtMs:number;
  [MARK]:true;
}>;
export function withdrawalChallengeText(c:SatchelWithdrawalChallengeProof){
  if(!UUID.test(c.id)|| !/^[a-zA-Z0-9_.:-]{1,100}$/.test(c.ownerUid) ||
      !ADDRESS.test(c.walletAddress)||!/^[1-9][0-9]{0,18}$/.test(c.amountUwolo) ||
      BigInt(c.amountUwolo)>I64||BigInt(c.amountUwolo)>MAX)fail("bad_challenge_identity");
  const start=Date.parse(c.issuedAtUtc),end=Date.parse(c.expiresAtUtc);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>300000)
    fail("bad_challenge_expiry");
  return [
    "AoE2WAR War Satchel WITHDRAWAL AUTHORIZATION",
    "Origin: aoe2war.com", "Chain: wolo-1","Denom: uwolo",
    "Owner UID: "+c.ownerUid,
    "Linked Keplr receiving wallet: "+c.walletAddress,
    "Exact withdrawal amount uwolo: "+c.amountUwolo,
    "One-use withdrawal challenge ID: "+c.id,
    "Issued: "+c.issuedAtUtc,
    "Expires: "+c.expiresAtUtc,
    "I authorize ONLY this one withdrawal from my War Satchel into my linked Keplr wallet.",
    "This does NOT authorize automated bets or permit any service to read Keplr private keys.",
  ].join("\n");
}
export function verifySatchelWithdrawalKeplrSignature(input:{
  challenge:SatchelWithdrawalChallengeProof;
  ownerUid:string;
  ownerWallet:string;
  signature:{pub_key:{type:string;value:string};signature:string};
  nowMs:number;
}):SatchelVerifiedWithdrawal{
  const c=input.challenge;
  const text=withdrawalChallengeText(c);
  const issue=Date.parse(c.issuedAtUtc),expire=Date.parse(c.expiresAtUtc);
  if(c.consumedAtUtc!==null||c.ownerUid!==input.ownerUid||
      c.walletAddress!==input.ownerWallet ||
      !Number.isFinite(input.nowMs)||input.nowMs<issue||input.nowMs>=expire)
    fail("owner_wallet_expiry_or_consumed");
  const sig=input.signature;
  if(sig?.pub_key?.type!=="tendermint/PubKeySecp256k1")fail("bad_key_type");
  const compressed=validB64(sig.pub_key.value,33);
  if(compressed[0]!==2&&compressed[0]!==3)fail("bad_compressed_pubkey");
  const rawSig=validB64(sig.signature,64);
  if(pubkeyToAddress({type:"tendermint/PubKeySecp256k1",value:sig.pub_key.value},"wolo")!==c.walletAddress)
    fail("wallet_does_not_own_signature");
  const doc=makeSignDoc([{
    type:"sign/MsgSignData",
    value:{signer:c.walletAddress,data:Buffer.from(text,"utf8").toString("base64")},
  }],{amount:[],gas:"0"},"","","0","0");
  const full=Buffer.from(ECDH.convertKey(compressed,"secp256k1",undefined,undefined,"uncompressed"));
  if(full.length!==65||full[0]!==4)fail("malformed_pubkey");
  const key=createPublicKey({format:"jwk",key:{
    kty:"EC",crv:"secp256k1",
    x:full.subarray(1,33).toString("base64url"),
    y:full.subarray(33,65).toString("base64url"),
  }});
  if(!verifyEcdsa("sha256",Buffer.from(serializeSignDoc(doc)),
    {key,dsaEncoding:"ieee-p1363"},rawSig))fail("invalid_adr36_signature");
  return Object.freeze({
    challengeId:c.id,ownerUid:c.ownerUid,walletAddress:c.walletAddress,
    amountUwolo:c.amountUwolo,verifiedAtMs:input.nowMs,[MARK]:true as const,
  });
}
export function isVerifiedSatchelWithdrawal(x:unknown):x is SatchelVerifiedWithdrawal{
  return !!x&&typeof x==="object"&&(x as SatchelVerifiedWithdrawal)[MARK]===true;
}
