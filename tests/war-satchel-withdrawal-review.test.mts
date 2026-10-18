import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {makeSignDoc,pubkeyToAddress,serializeSignDoc} from "@cosmjs/amino";
import {withdrawalChallengeText,verifySatchelWithdrawalKeplrSignature,isVerifiedSatchelWithdrawal} from "../lib/warSatchelWithdrawalAuthorization.ts";
import {withdrawalReservationDigest,withdrawalOwnerMandateDigest,withdrawalHoldDigest,withdrawalApprovalSignBytes,verifyIndependentWithdrawalApproval,
 type WithdrawalOwnerMandate,type IndependentWithdrawalApproval} from "../lib/warSatchelWithdrawalReview.ts";
const f=JSON.parse(readFileSync(new URL("./fixtures/satchel-financial-bridge-v1.json",import.meta.url),"utf8"));
const keys=generateKeyPairSync("ec",{namedCurve:"secp256k1"});
const jwk=keys.publicKey.export({format:"jwk"}) as {x:string;y:string};
const y=Buffer.from(jwk.y,"base64url"),pub=Buffer.concat([Buffer.from([(y.at(-1)!&1)?3:2]),Buffer.from(jwk.x,"base64url")]).toString("base64");
const wallet=pubkeyToAddress({type:"tendermint/PubKeySecp256k1",value:pub},"wolo");
const now=Date.parse("2026-10-17T12:00:30.000Z");
const challenge={id:"fd000000-1111-4111-8111-000000000041",ownerUid:"owner-1",walletAddress:wallet,amountUwolo:"25000000",
 issuedAtUtc:"2026-10-17T12:00:00.000Z",expiresAtUtc:"2026-10-17T12:05:00.000Z",consumedAtUtc:null};
const text=withdrawalChallengeText(challenge),doc=makeSignDoc([{type:"sign/MsgSignData",value:{signer:wallet,data:Buffer.from(text).toString("base64")}}],{amount:[],gas:"0"},"","","0","0");
const signature={pub_key:{type:"tendermint/PubKeySecp256k1",value:pub},signature:sign("sha256",Buffer.from(serializeSignDoc(doc)),{key:keys.privateKey,dsaEncoding:"ieee-p1363"}).toString("base64")};
const verified=verifySatchelWithdrawalKeplrSignature({challenge,ownerUid:"owner-1",ownerWallet:wallet,signature,nowMs:now});
const base={withdrawalId:"fd000000-2222-4222-8222-000000000042",ownerUserId:1,ownerUid:"owner-1",wallet,vault:f.vault,
 amountUwolo:"25000000",memo:"aoe2war/satchel/withdraw/v1/fd000000-2222-4222-8222-000000000042",ownerMandate:verified.ownerMandate};
const economics={...base,reservationDigest:withdrawalReservationDigest(base)};
const reviewer=generateKeyPairSync("ed25519");
const reviewerKey=(reviewer.publicKey.export({format:"der",type:"spki"}) as Buffer).subarray(-32).toString("hex");
function approval():IndependentWithdrawalApproval{
 const a={withdrawal_id:base.withdrawalId,challenge_id:challenge.id,owner_id:base.ownerUid,recipient:wallet,amount_uwolo:base.amountUwolo,
  memo:base.memo,reservation_digest:economics.reservationDigest,hold_digest:withdrawalHoldDigest(economics.reservationDigest,verified.ownerMandate),
  issued_at:Math.floor(now/1000)-1,expires_at:Math.floor(now/1000)+60,signature:""};
 return {...a,signature:sign(null,withdrawalApprovalSignBytes(a,base.vault),reviewer.privateKey).toString("base64")};
}
test("cross-language original mandate and approval bytes match Wolo fixture exactly",()=>{
 assert.equal(withdrawalOwnerMandateDigest(f.withdrawal_request.owner_mandate),f.owner_mandate_digest);
 assert.equal(withdrawalApprovalSignBytes(f.withdrawal_request.approval,f.vault).toString(),f.withdrawal_approval_sign_bytes);
 // Go's public synthetic fixture uses an uppercase placeholder C*64
 // reservation digest; that is not an admissible canonical production hash.
 // Keep the byte-format interoperability assertion WITHOUT weakening the
 // real finance verifier's strict lowercase digest requirement.
 const fixtureDigest=f.withdrawal_request.approval.reservation_digest as string;
 assert.match(fixtureDigest,/^[A-F0-9]{64}$/);
 assert.throws(()=>withdrawalHoldDigest(fixtureDigest,f.withdrawal_request.owner_mandate),/reservation_digest/);
 const originalGoFixtureHold=createHash("sha256").update(JSON.stringify([
  "aoe2war/satchel/withdraw-hold/v1",fixtureDigest,
  withdrawalOwnerMandateDigest(f.withdrawal_request.owner_mandate)
 ])).digest("hex");
 assert.equal(originalGoFixtureHold,f.withdrawal_hold_digest);
});
test("original ADR36 and independent reviewer jointly authorize exact durable hold",()=>{
 assert(verifyIndependentWithdrawalApproval(approval(),economics,reviewerKey,now));
 assert(Object.isFrozen(verified.ownerMandate));assert(Object.isFrozen(verified.ownerMandate.challenge));
 assert(Object.isFrozen(verified.ownerMandate.pub_key));
 assert(!isVerifiedSatchelWithdrawal({...verified}));
});
test("changed hold, owner, wallet, amount, memo or original mandate cannot reuse approval",()=>{
 const a=approval();
 for(const change of [{ownerUserId:2},{ownerUid:"owner-2"},{amountUwolo:"26000000"},{wallet:f.vault},{memo:"other"},{reservationDigest:"a".repeat(64)}])
  assert.throws(()=>verifyIndependentWithdrawalApproval(a,{...economics,...change},reviewerKey,now));
 const forged=structuredClone(verified.ownerMandate);forged.signature="A".repeat(86)+"==";
 assert.throws(()=>verifyIndependentWithdrawalApproval(a,{...economics,ownerMandate:forged},reviewerKey,now));
});
test("expiry, substituted independent key, signature mutation and aliased approval fields refuse",()=>{
 const a=approval();
 assert.throws(()=>verifyIndependentWithdrawalApproval(a,economics,reviewerKey,now+61000),/expiry/);
 assert.throws(()=>verifyIndependentWithdrawalApproval(a,economics,"a".repeat(64),now),/signature/);
 assert.throws(()=>verifyIndependentWithdrawalApproval({...a,signature:"A".repeat(86)+"=="},economics,reviewerKey,now),/signature/);
 assert.throws(()=>verifyIndependentWithdrawalApproval({...a,ownerId:a.owner_id} as IndependentWithdrawalApproval,economics,reviewerKey,now),/noncanonical_fields/);
});
test("mandate digest preserves original signed timestamp and signature bytes",()=>{
 const m=f.withdrawal_request.owner_mandate as WithdrawalOwnerMandate;
 const different={...m,challenge:{...m.challenge,issued_at_utc:m.challenge.issued_at_utc.replace(".000Z","Z")}};
 assert.notEqual(withdrawalOwnerMandateDigest(m),withdrawalOwnerMandateDigest(different));
 assert.match(createHash("sha256").update(text).digest("hex"),/^[a-f0-9]{64}$/);
});
