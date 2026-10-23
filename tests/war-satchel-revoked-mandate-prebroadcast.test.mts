import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  runFundedMechaTransitionBatch,
  type FundedAutoTicketPorts,
} from "../lib/betAutomationFundedTransition.ts";

const source=readFileSync(new URL("../lib/warSatchelAutoBetExecutor.ts",import.meta.url),"utf8");
test("a deterministic Keplr revocation or closed Watcher market is a proven prebroadcast rejection",()=>{
 const i=source.indexOf("await markSatchelSubmissionAttempt");
 const j=source.indexOf("let txHash: string;",i);
 assert(i>=0&&j>i,"submission fence path");
 const guard=source.slice(i,j);
 assert.match(guard,/WAR_SATCHEL_FUNDED_REFUSED:/);
 assert.match(guard,/kind: "rejected_before_broadcast"/);
 assert.match(guard,/prebroadcast_mandate_or_market_refused/);
 assert.match(guard,/submission_fence_acknowledgement_unknown/);
 assert(!guard.includes("signer.submitOneShot("));
});
test("deterministic no-broadcast rejection gives 100% back, no ticket and no fee",async()=>{
 const release:string[]=[];
 let sendCount=0;
 const adapter:FundedAutoTicketPorts={
  claimAndReserve:async id=>({
    kind:"atomically_reserved",executionId:id,
    ownerUid:"steam:player",gameIdentityKey:"watcher:session",
    reservationId:"satchel:reserve:28",
    ticketRequestId:"satchel:ticket:28",reserveUwolo:"250000000",
  }),
  submitReservedTicket:async()=>{sendCount++;return {
    kind:"rejected_before_broadcast",reason:"prebroadcast_mandate_or_market_refused",
  }},
  commitAccepted:async()=>{throw Error("MUST_NOT_COMMIT")},
  releaseUnbroadcast:async(claim,reason)=>{release.push(claim.reserveUwolo+":"+reason)},
  holdUnknown:async()=>{throw Error("MUST_NOT_QUARANTINE_PROVEN_PREBROADCAST")},
 };
 const result=await runFundedMechaTransitionBatch([28],adapter);
 assert.equal(sendCount,1);
 assert.deepEqual(release,["250000000:prebroadcast_mandate_or_market_refused"]);
 assert.equal(result.rejectedBeforeBroadcast,1);
 assert.equal(result.unknownHeld,0);
 assert.equal(result.accepted,0);
});
test("lost signing-fence database acknowledgment is never auto-refunded or rebroadcast",async()=>{
 let attempts=0;let releases=0;let holds=0;
 const adapter:FundedAutoTicketPorts={
  claimAndReserve:async id=>({
    kind:"atomically_reserved",executionId:id,
    ownerUid:"steam:player",gameIdentityKey:"watcher:session",
    reservationId:"satchel:reserve:29",
    ticketRequestId:"satchel:ticket:29",reserveUwolo:"250000000",
  }),
  submitReservedTicket:async()=>{
    attempts++;
    return {kind:"unknown_after_broadcast",reason:"submission_fence_acknowledgement_unknown"};
  },
  commitAccepted:async()=>{throw Error("MUST_NOT_COMMIT")},
  releaseUnbroadcast:async()=>{releases++},
  holdUnknown:async()=>{holds++},
 };
 const result=await runFundedMechaTransitionBatch([29],adapter);
 assert.equal(attempts,1);
 assert.equal(releases,0);
 assert.equal(holds,1);
 assert.equal(result.unknownHeld,1);
 assert.equal(result.accepted,0);
});
