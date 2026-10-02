import test from "node:test";
import assert from "node:assert/strict";

import { buildScheduledMatchSettlementPlan } from "../lib/scheduledMatchSettlements.ts";
import { CHAMPIONSHIP_PROTOCOL_VERSION } from "../lib/challengeChampionshipProtocol.ts";

function participant(id:number,uid:string,name:string,wallet:string) {
  return { id, uid, inGameName:name, steamPersonaName:null, walletAddress:wallet };
}

function completedRow(input:{leftFunded:boolean;rightFunded:boolean;winner:"challenger"|"challenged";leftFundedOffsetMs?:number;rightFundedOffsetMs?:number}) {
  const now=new Date("2026-10-02T12:00:00.000Z");
  const liveConfirmedAt=new Date(now.getTime()-30_000);
  return {
    id: 99001,
    status: "completed",
    scheduledAt: now,
    challengeNote: null,
    wagerAmountWolo: 25,
    guaranteeAmountWolo: 0,
    cancelledAt: null,
    resultAt: now,
    settlementReadyAt: now,
    liveConfirmedAt,
    linkedSessionKey: "platform:honor-system-test",
    challengerFundingTxHash: input.leftFunded ? "LEFT_CHAIN_PROOF" : null,
    challengerFundingWalletAddress: input.leftFunded ? "wolo-left" : null,
    challengerFundedAt: input.leftFunded ? new Date(now.getTime()+(input.leftFundedOffsetMs??-60_000)) : null,
    challengedFundingTxHash: input.rightFunded ? "RIGHT_CHAIN_PROOF" : null,
    challengedFundingWalletAddress: input.rightFunded ? "wolo-right" : null,
    challengedFundedAt: input.rightFunded ? new Date(now.getTime()+(input.rightFundedOffsetMs??-60_000)) : null,
    challengerCheckedInAt: null,
    challengedCheckedInAt: null,
    linkedWinner: input.winner==="challenger" ? "Tony" : "Tekki",
    protocolVersion: CHAMPIONSHIP_PROTOCOL_VERSION,
    resultWinnerSide: input.winner,
    updatedAt: now,
    challenger: participant(1,"tony-uid","Tony","wolo-left"),
    challenged: participant(2,"tekki-uid","Tekki","wolo-right"),
    settlements: [],
  } as const;
}

test("played championship with only creator funding returns unmatched principal whole even when opponent wins",()=>{
  const plan=buildScheduledMatchSettlementPlan(completedRow({
    leftFunded:true,
    rightFunded:false,
    winner:"challenged",
  }) as never);

  assert.equal(plan.transfers.length,1);
  const transfer=plan.transfers[0]!;
  assert.equal(transfer.action,"left_full_refund");
  assert.equal(transfer.reason,"refund");
  assert.equal(transfer.recipientAddress,"wolo-left");
  assert.equal(transfer.amountWolo,25);
  assert.deepEqual(transfer.sourceAllocations,[{side:"left",bucket:"wager",amountWolo:25}]);
  assert.equal(plan.liability.refundWolo,25);
  assert.equal(plan.liability.treasuryWolo,0);
  assert.equal(plan.liability.plannedTransferWolo,25);
  assert.equal(plan.liability.conservationOk,true);
});

test("played championship with both wagers funded before Watcher start remains winner-take-pool",()=>{
  const plan=buildScheduledMatchSettlementPlan(completedRow({
    leftFunded:true,
    rightFunded:true,
    winner:"challenged",
  }) as never);

  assert.equal(plan.transfers.length,1);
  const transfer=plan.transfers[0]!;
  assert.equal(transfer.action,"right_winner_wager_award");
  assert.equal(transfer.reason,"award");
  assert.equal(transfer.recipientAddress,"wolo-right");
  assert.equal(transfer.amountWolo,50);
  assert.equal(plan.liability.refundWolo,0);
  assert.equal(plan.liability.plannedTransferWolo,50);
  assert.equal(plan.liability.conservationOk,true);
});

test("a deposit after authenticated Watcher start cannot retroactively match the championship wager",()=>{
  const plan=buildScheduledMatchSettlementPlan(completedRow({
    leftFunded:true,
    rightFunded:true,
    winner:"challenged",
    leftFundedOffsetMs:-60_000,
    rightFundedOffsetMs:-25_000,
  }) as never);

  assert.equal(plan.transfers.length,2);
  assert.deepEqual(
    plan.transfers.map(transfer=>({
      action:transfer.action,
      reason:transfer.reason,
      recipientAddress:transfer.recipientAddress,
      amountWolo:transfer.amountWolo,
    })),
    [
      {action:"left_full_refund",reason:"refund",recipientAddress:"wolo-left",amountWolo:25},
      {action:"right_full_refund",reason:"refund",recipientAddress:"wolo-right",amountWolo:25},
    ],
  );
  assert.equal(plan.liability.refundWolo,50);
  assert.equal(plan.liability.treasuryWolo,0);
  assert.equal(plan.liability.plannedTransferWolo,50);
  assert.equal(plan.liability.conservationOk,true);
});
