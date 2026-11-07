import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { toBech32 } from "@cosmjs/encoding";
import { buildSatchelWagerAuthorization } from "../lib/warSatchelWagerAuthorization.ts";
import { wagerReservationSignBytes, type SatchelWagerReservation } from "../lib/warSatchelWagerReservation.ts";
import {
  verifySatchelReviewerReply, requestCertifiedIndependentSatchelReview,
} from "../lib/warSatchelIndependentReviewerPickup.ts";

const wallet = (n:number)=>toBech32("wolo",new Uint8Array(20).fill(n));
function signedReview(){
  const proposal="3".repeat(64);
  const original=buildSatchelWagerAuthorization({
    executionId:7,ownerUserId:77,ownerUid:"steam-77",ownerWallet:wallet(4),
    reservationId:"satchel:reserve:7",operationId:"satchel:ticket:7",ticketId:7,
    vault:wallet(1),recipient:wallet(2),amountUwolo:"12000000",
    memo:"AoE2HDBets bet ticket v1 · ticket 7",
    gameIdentityKey:"watcher:game-7",propositionHash:proposal,presetId:9,presetVersion:2,
    consentId:"mandate-7",challengeText:"owner signed bounded ADR-36 mandate",
    ownerSignatureJson:{pub_key:"synthetic-fixture",signature:"synthetic-fixture"},
    ledgerVersion:"9",availableUwolo:"88000000",reservedUwolo:"12000000",
    journalId:"71",legs:[{id:71,marketId:74,side:"left",amountWolo:12,propositionHash:proposal}],
  });
  const keys=generateKeyPairSync("ed25519");
  const publicKey=keys.publicKey.export({format:"der",type:"spki"}).subarray(-32).toString("hex");
  const now=Math.floor(Date.now()/1000);
  const raw:SatchelWagerReservation={
    version:1,operation_id:original.operationId,owner_id:original.snapshot.ownerUid,
    vault:original.snapshot.vault,recipient:original.snapshot.recipient,
    amount_uwolo:original.snapshot.amountUwolo,memo:original.snapshot.memo,
    reservation_digest:original.reservationDigest,ledger_revision:original.ledgerRevision,
    consent_digest:original.consentDigest,fee_uwolo:"2500",
    issued_at:now,expires_at:now+60,signature:Buffer.alloc(64).toString("base64"),
  };
  const approval={...raw,signature:sign(null,wagerReservationSignBytes(raw),keys.privateKey).toString("base64")};
  return {original,publicKey,approval,nowMs:now*1000+100};
}
test("separately signed exact operation and original immutable context are admitted only as a receipt",()=>{
  const x=signedReview();
  const v=verifySatchelReviewerReply({protocol:1,status:"SIGNED",operation_id:x.original.operationId,approval:x.approval},
    x.original,x.publicKey,x.nowMs);
  assert.equal(v.kind,"reviewed");
  if(v.kind==="reviewed")assert.equal(v.approval.signature,x.approval.signature);
  assert.ok(Object.isFrozen(v));
  assert.equal("spendingAuthorized" in v,false);
});
test("PENDING cannot carry approval, change owner or cause a spend",()=>{
  const x=signedReview();
  const base={protocol:1,status:"PENDING",operation_id:x.original.operationId};
  assert.deepEqual(verifySatchelReviewerReply(base,x.original,x.publicKey,x.nowMs),{kind:"pending"});
  assert.throws(()=>verifySatchelReviewerReply({...base,approval:x.approval},x.original,x.publicKey,x.nowMs),/noncanonical_reply/);
  assert.throws(()=>verifySatchelReviewerReply({...base,operation_id:"satchel:ticket:8"},x.original,x.publicKey,x.nowMs),/wrong_operation/);
});
test("signed body cannot replace original owner economics, escrow or source digest",()=>{
  const x=signedReview();
  for(const [k,v] of [["owner_id","different"],["amount_uwolo","13000000"],
    ["recipient",wallet(6)],["consent_digest","a".repeat(64)],
    ["ledger_revision","b".repeat(64)],["reservation_digest","c".repeat(64)],
    ["fee_uwolo","500000"]] as const){
      const forged={...x.approval,[k]:v};
      assert.throws(()=>verifySatchelReviewerReply({
        protocol:1,status:"SIGNED",operation_id:x.original.operationId,approval:forged,
      },x.original,x.publicKey,x.nowMs),/SATCHEL_WAGER_RESERVATION_REFUSED/,String(k));
  }
});
test("forged independent reviewer signature and wrong authority always refuse",()=>{
  const x=signedReview();
  const y=signedReview();
  const envelope={protocol:1,status:"SIGNED",operation_id:x.original.operationId,approval:x.approval};
  assert.throws(()=>verifySatchelReviewerReply(envelope,x.original,y.publicKey,x.nowMs),/independent_signature_invalid/);
  assert.throws(()=>verifySatchelReviewerReply({...envelope,
    approval:{...x.approval,signature:Buffer.alloc(64).toString("base64")}},
    x.original,x.publicKey,x.nowMs),/independent_signature_invalid/);
});
test("expired and overly broad reviewer grant is never admitted",()=>{
  const x=signedReview();
  const envelope={protocol:1,status:"SIGNED",operation_id:x.original.operationId,approval:x.approval};
  assert.throws(()=>verifySatchelReviewerReply(envelope,x.original,x.publicKey,
    x.approval.expires_at*1000+100),/expired_or_future_review/);
  assert.throws(()=>verifySatchelReviewerReply({...envelope,
    approval:{...x.approval,expires_at:x.approval.issued_at+301}},x.original,x.publicKey,x.nowMs),
    /invalid_time_window/);
});
test("unknown protocol, response fields and status fail closed",()=>{
  const x=signedReview();
  for(const response of [
    {protocol:2,status:"PENDING",operation_id:x.original.operationId},
    {protocol:1,status:"APPROVED",operation_id:x.original.operationId},
    {protocol:1,status:"SIGNED",operation_id:x.original.operationId},
    {protocol:1,status:"SIGNED",operation_id:x.original.operationId,approval:x.approval,success:true},
  ])assert.throws(()=>verifySatchelReviewerReply(response,x.original,x.publicKey,x.nowMs));
});
test("the source HOLD refuses review pickup before database or HTTP I/O",async()=>{
  let touched=false;
  await assert.rejects(requestCertifiedIndependentSatchelReview({} as never,{
    operationId:"satchel:ticket:7",ownerUserId:77,
  }, (async()=>{touched=true;throw Error("mock HTTP must not be reached")}) as typeof fetch),
    /SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD/);
  assert.equal(touched,false);
});
