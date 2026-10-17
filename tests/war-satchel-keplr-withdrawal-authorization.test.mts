import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { makeSignDoc, pubkeyToAddress, serializeSignDoc } from "@cosmjs/amino";
import {
  withdrawalChallengeText,
  verifySatchelWithdrawalKeplrSignature,
  isVerifiedSatchelWithdrawal,
} from "../lib/warSatchelWithdrawalAuthorization.ts";

const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"secp256k1"});
const jwk=publicKey.export({format:"jwk"}) as {x:string;y:string};
const x=Buffer.from(jwk.x,"base64url"),y=Buffer.from(jwk.y,"base64url");
const pub=Buffer.concat([Buffer.from([(y[y.length-1]&1)===1?3:2]),x]).toString("base64");
const wallet=pubkeyToAddress({type:"tendermint/PubKeySecp256k1",value:pub},"wolo");
const owner="steam:test-keplr";
const time="2026-10-17T01:00:00.000Z";
const challenge={
 id:"fd000000-2222-4222-8222-000000000042",ownerUid:owner,
 walletAddress:wallet,amountUwolo:"25000000",
 issuedAtUtc:time,expiresAtUtc:"2026-10-17T01:05:00.000Z",
 consumedAtUtc:null,
};
function signChallenge(c=challenge){
 const message=withdrawalChallengeText(c);
 const doc=makeSignDoc([{
   type:"sign/MsgSignData",
   value:{signer:c.walletAddress,data:Buffer.from(message).toString("base64")},
 }],{amount:[],gas:"0"},"","","0","0");
 return {pub_key:{type:"tendermint/PubKeySecp256k1",value:pub},
  signature:sign("sha256",Buffer.from(serializeSignDoc(doc)),
    {key:privateKey,dsaEncoding:"ieee-p1363"}).toString("base64")};
}
function check(c=challenge,signature=signChallenge()){
 return verifySatchelWithdrawalKeplrSignature({
   challenge:c,ownerUid:owner,ownerWallet:wallet,
   nowMs:Date.parse("2026-10-17T01:02:00.000Z"),signature,
 });
}
test("one true owner-signed Keplr ADR36 withdrawal proof is immutable and brand-verified",()=>{
 const r=check();assert.equal(r.ownerUid,owner);
 assert.equal(r.amountUwolo,"25000000");assert(isVerifiedSatchelWithdrawal(r));
 assert(Object.isFrozen(r));
 assert.equal(r.challengeId,challenge.id);
});
test("changed withdrawal amount cannot reuse a signed Keplr approval",()=>{
 assert.throws(()=>check({...challenge,amountUwolo:"26000000"}),/invalid_adr36_signature/);
});
test("signed withdrawal cannot be redirected to another player wallet",()=>{
 const other="wolo1"+"q".repeat(38);
 assert.throws(()=>check({...challenge,walletAddress:other}),/wallet_does_not_own_signature/);
});
test("expired or already-consumed challenge cannot be used twice",()=>{
 assert.throws(()=>check({...challenge,consumedAtUtc:"2026-10-17T01:01:00.000Z"}),/owner_wallet_expiry_or_consumed/);
 assert.throws(()=>verifySatchelWithdrawalKeplrSignature({
   challenge,ownerUid:owner,ownerWallet:wallet,
   nowMs:Date.parse("2026-10-17T01:05:00.000Z"),signature:signChallenge(),
 }),/owner_wallet_expiry_or_consumed/);
});
test("a raw object cannot impersonate the module-private verified wallet signature",()=>{
 assert.equal(isVerifiedSatchelWithdrawal({
   challengeId:challenge.id,ownerUid:owner,
   walletAddress:wallet,amountUwolo:"25000000",
   verifiedAtMs:Date.parse(time),
 }),false);
});
