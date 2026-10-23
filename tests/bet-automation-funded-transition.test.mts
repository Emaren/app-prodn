import assert from "node:assert/strict";
import test from "node:test";

import {
  runFundedMechaTransitionBatch,
  type FundedAutoReservedClaim,
  type FundedAutoTicketOutcome,
  type FundedAutoTicketPorts,
} from "../lib/betAutomationFundedTransition.ts";

function claim(executionId = 7): FundedAutoReservedClaim {
  return {
    kind: "atomically_reserved",
    executionId,
    ownerUid: "steam-123",
    gameIdentityKey: "watcher:game-88",
    reservationId: "reserve:7",
    ticketRequestId: "ticket:7",
    reserveUwolo: "250000000",
  };
}

function ports(outcome: FundedAutoTicketOutcome) {
  const seen = {
    reserved: [] as number[],
    submitted: [] as string[],
    committed: [] as number[],
    released: [] as string[],
    unknown: [] as string[],
  };
  const adapter: FundedAutoTicketPorts = {
    async claimAndReserve(id) {
      seen.reserved.push(id);
      return claim(id);
    },
    async submitReservedTicket(c) {
      seen.submitted.push(c.ticketRequestId);
      return outcome;
    },
    async commitAccepted(_c, receipt) {
      seen.committed.push(receipt.ticketId);
    },
    async releaseUnbroadcast(c, reason) {
      seen.released.push(c.reserveUwolo + ":" + reason);
    },
    async holdUnknown(_c, reason) {
      seen.unknown.push(reason);
    },
  };
  return {adapter,seen};
}

test("one proven accepted ticket commits exactly once without any release", async () => {
  const {adapter, seen} = ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  const result = await runFundedMechaTransitionBatch([7], adapter);
  assert.deepEqual(result,{
    examined:1,claimed:1,accepted:1,rejectedBeforeBroadcast:0,unknownHeld:0,skipped:0,
  });
  assert.deepEqual(seen.submitted,["ticket:7"]);
  assert.deepEqual(seen.committed,[81]);
  assert.deepEqual(seen.released,[]);
  assert.deepEqual(seen.unknown,[]);
  assert.equal(Object.isFrozen(result),true);
});

test("definitive prebroadcast rejection only releases the FULL reserved amount", async () => {
  const {adapter,seen} = ports({kind:"rejected_before_broadcast",reason:"market_closed"});
  const result=await runFundedMechaTransitionBatch([7],adapter);
  assert.equal(result.rejectedBeforeBroadcast,1);
  assert.deepEqual(seen.released,["250000000:market_closed"]);
  assert.deepEqual(seen.committed,[]);
  assert.deepEqual(seen.unknown,[]);
});

test("ambiguous broadcast cannot be retried, released, charged a fee or committed", async () => {
  const {adapter,seen} = ports({kind:"unknown_after_broadcast",reason:"network_timeout"});
  const result=await runFundedMechaTransitionBatch([7],adapter);
  assert.equal(result.unknownHeld,1);
  assert.deepEqual(seen.submitted,["ticket:7"]);
  assert.deepEqual(seen.unknown,["network_timeout"]);
  assert.deepEqual(seen.released,[]);
  assert.deepEqual(seen.committed,[]);
});

test("network or adapter transport exception becomes unknown, never an automatic retry", async () => {
  const {adapter,seen} = ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  adapter.submitReservedTicket=async c=>{
    seen.submitted.push(c.ticketRequestId);
    throw new Error("timeout-after-send");
  };
  const result=await runFundedMechaTransitionBatch([7],adapter);
  assert.equal(result.unknownHeld,1);
  assert.deepEqual(seen.submitted,["ticket:7"]);
  assert.deepEqual(seen.unknown,["transport_or_execution_unknown"]);
  assert.deepEqual(seen.released,[]);
});

test("ambiguous accepted receipt persistence is held, never broadcast a second time", async () => {
  const {adapter,seen}=ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  adapter.commitAccepted=async ()=>{throw new Error("DB ack lost after commit");};
  const result=await runFundedMechaTransitionBatch([7],adapter);
  assert.equal(result.accepted,0);
  assert.equal(result.unknownHeld,1);
  assert.deepEqual(seen.submitted,["ticket:7"]);
  assert.deepEqual(seen.unknown,["commit_receipt_unknown"]);
  assert.deepEqual(seen.released,[]);
});

test("false accepted proof cannot convert a reservation into an accepted bet", async ()=>{
  const {adapter,seen}=ports({kind:"accepted",ticketId:81,fundingTxHash:"NOT-A-CHAIN-HASH"});
  const result=await runFundedMechaTransitionBatch([7],adapter);
  assert.equal(result.accepted,0);
  assert.equal(result.unknownHeld,1);
  assert.deepEqual(seen.unknown,["invalid_accepted_ticket_proof"]);
  assert.deepEqual(seen.committed,[]);
});

test("malformed atomic claim stays on hold, no signing or funds released", async()=>{
  const {adapter,seen}=ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  adapter.claimAndReserve=async id=>({...claim(id),reserveUwolo:"-2"});
  const result=await runFundedMechaTransitionBatch([7],adapter);
  assert.equal(result.unknownHeld,1);
  assert.deepEqual(seen.submitted,[]);
  assert.deepEqual(seen.unknown,["invalid_atomic_reservation_identity"]);
});

test("ineligible and already-handled executions cannot call payout adapter", async()=>{
  const {adapter,seen}=ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  adapter.claimAndReserve=async id=>id===7?{kind:"ineligible"}:{kind:"already_handled"};
  const result=await runFundedMechaTransitionBatch([7,8],adapter);
  assert.equal(result.claimed,0);
  assert.equal(result.skipped,2);
  assert.deepEqual(seen.submitted,[]);
});

test("duplicate or malformed queue identities stop before any adapter is invoked",async()=>{
  const {adapter,seen}=ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  await assert.rejects(runFundedMechaTransitionBatch([7,7],adapter),/QUEUE_IDS_INVALID/);
  await assert.rejects(runFundedMechaTransitionBatch([0],adapter),/QUEUE_IDS_INVALID/);
  await assert.rejects(runFundedMechaTransitionBatch(Array.from({length:26},(_,i)=>i+1),adapter),/QUEUE_IDS_INVALID/);
  assert.deepEqual(seen.reserved,[]);
});

test("two concurrently polling workers produce one durable claim and one broadcast",async()=>{
  const {adapter,seen}=ports({kind:"accepted",ticketId:81,fundingTxHash:"A".repeat(64)});
  let grabbed=false;
  adapter.claimAndReserve=async id=>{
    if(grabbed)return {kind:"already_handled"};
    grabbed=true;return claim(id);
  };
  const [first,second]=await Promise.all([
    runFundedMechaTransitionBatch([7],adapter),
    runFundedMechaTransitionBatch([7],adapter),
  ]);
  assert.equal(first.accepted+second.accepted,1);
  assert.deepEqual(seen.submitted,["ticket:7"]);
});
