import assert from "node:assert/strict";
import test from "node:test";

import { deriveMainnetStakingPositionsFromTransfers } from "../lib/mainnetStakingDerivation.ts";
import {
  calculateStakingReservePolicy,
  resolveStakingReserveTargetUWolo,
} from "../lib/stakingReservePolicy.ts";
import {
  classifyStakingTransferMemo,
  stakingTransferLedgerPresentation,
} from "../lib/stakingTransferClassification.ts";

const stakingWalletAddress =
  "wolo1stakingwallet0000000000000000000000000000";
const userWalletAddress = "wolo1userwallet000000000000000000000000000000";
const mainnetStartAt = new Date("2026-05-25T00:00:00.000Z");
const asOf = new Date("2026-06-28T04:00:00.000Z");

function derive(
  transfers: Parameters<typeof deriveMainnetStakingPositionsFromTransfers>[0],
  operationalReserveSourceAddresses?: readonly string[]
) {
  return deriveMainnetStakingPositionsFromTransfers(transfers, {
    stakingWalletAddress,
    mainnetStartAt,
    asOf,
    operationalReserveSourceAddresses,
  });
}

function inboundTransfer(input: {
  txHash: string;
  amountWolo: number;
  memo?: string | null;
  timestamp?: string;
}) {
  return {
    txHash: input.txHash,
    timestamp: input.timestamp || "2026-06-28T01:00:00.000Z",
    senderAddress: userWalletAddress,
    recipientAddress: stakingWalletAddress,
    amountWolo: input.amountWolo,
    senderUserId: 7,
    senderLabel: "Operator-linked player",
    memo: input.memo ?? null,
  };
}

test("normal and site-button transfers remain confirmed stake", () => {
  const rows = derive([
    inboundTransfer({ txHash: "NORMAL", amountWolo: 25 }),
    inboundTransfer({
      txHash: "SITEBUTTON",
      amountWolo: 1_009,
      memo: "AoE2HDBets staking deposit",
      timestamp: "2026-06-28T01:05:00.000Z",
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].currentStakedWolo, 1_034);
  assert.equal(rows[0].totalStakedWolo, 1_034);
});

test("canonical reserve top-up memos never become staking liability", () => {
  const rows = derive([
    inboundTransfer({
      txHash: "RESERVE1009",
      amountWolo: 1_009,
      memo: "staking-wallet-reserve-top-up:1009wolo:20260627",
    }),
    inboundTransfer({
      txHash: "RESERVE10000",
      amountWolo: 10_000,
      memo: "staking-wallet-operating-reserve-top-up:10000wolo:20260627",
      timestamp: "2026-06-28T01:10:00.000Z",
    }),
  ]);

  assert.deepEqual(rows, []);
});

test("reserve top-ups remain visible as admin operational funding", () => {
  const classification = classifyStakingTransferMemo(
    "staking-wallet-operating-reserve-top-up:10000wolo:20260627"
  );
  const presentation = stakingTransferLedgerPresentation(
    classification,
    "10,000 WOLO"
  );

  assert.equal(classification, "operational_reserve");
  assert.equal(presentation.eventType, "RESERVE");
  assert.equal(presentation.label, "10,000 WOLO operating reserve funding");
  assert.equal(presentation.detailPrefix, "Admin operational funding");
});

test("an unrecognized user cannot evade stake liability with a reserve memo", () => {
  const rows = derive(
    [
      inboundTransfer({
        txHash: "UNAUTHORIZEDRESERVEMEMO",
        amountWolo: 500,
        memo: "staking-wallet-reserve-top-up:500wolo:20260627",
      }),
    ],
    ["wolo1knownoperator000000000000000000000000000"]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].currentStakedWolo, 500);
});

test("reserve policy uses chain balance minus liability and enforces 10,000 WOLO", () => {
  const configuredTenWolo = "10000000";
  const reserveTargetUWolo =
    resolveStakingReserveTargetUWolo(configuredTenWolo);
  const policy = calculateStakingReservePolicy({
    stakingWalletBalanceUWolo: BigInt("323848985000"),
    totalConfirmedStakedWolo: 312_819,
    reserveTargetUWolo,
  });

  assert.equal(reserveTargetUWolo, BigInt("10000000000"));
  assert.equal(policy.confirmedLiabilityUWolo, BigInt("312819000000"));
  assert.equal(policy.operatingReserveUWolo, BigInt("11029985000"));
  assert.equal(policy.requiredBalanceUWolo, BigInt("322819000000"));
  assert.equal(policy.reserveSurplusUWolo, BigInt("1029985000"));
  assert.equal(policy.operatorTopUpNeededUWolo, BigInt(0));
  assert.equal(policy.operationalReserveHealthy, true);
});

test("repeated scans stay idempotent and do not flip reserve funding into stake", () => {
  const reserve = inboundTransfer({
    txHash: "IDEMPOTENTRESERVE",
    amountWolo: 10_000,
    memo: "staking-wallet-operating-reserve-top-up:10000wolo:20260627",
  });
  const stake = inboundTransfer({
    txHash: "IDEMPOTENTSTAKE",
    amountWolo: 100,
    memo: "AoE2HDBets staking deposit",
    timestamp: "2026-06-28T01:10:00.000Z",
  });
  const rows = derive([reserve, reserve, stake, stake]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].currentStakedWolo, 100);
  assert.deepEqual(rows[0].txHashes, ["IDEMPOTENTSTAKE"]);
});

test("reserve transfers do not affect staking weight or leaderboard principal", () => {
  const stake = inboundTransfer({
    txHash: "WEIGHTSTAKE",
    amountWolo: 100,
    memo: "AoE2HDBets staking deposit",
    timestamp: "2026-06-28T01:00:00.000Z",
  });
  const reserve = inboundTransfer({
    txHash: "WEIGHTRESERVE",
    amountWolo: 10_000,
    memo: "staking-wallet-operating-reserve-top-up:10000wolo:20260627",
    timestamp: "2026-06-28T02:00:00.000Z",
  });

  const baseline = derive([stake]);
  const withReserve = derive([stake, reserve]);

  assert.equal(withReserve[0].currentStakedWolo, 100);
  assert.equal(withReserve[0].stakingWeight, baseline[0].stakingWeight);
  assert.deepEqual(withReserve[0].txHashes, ["WEIGHTSTAKE"]);
});
