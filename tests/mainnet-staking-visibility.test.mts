import assert from "node:assert/strict";
import test from "node:test";

import { deriveMainnetStakingPositionsFromTransfers } from "../lib/mainnetStakingDerivation.ts";

const stakingWalletAddress = "wolo1stakingwallet0000000000000000000000000000";
const mainnetStartAt = new Date("2026-05-25T00:00:00.000Z");
const asOf = new Date("2026-05-27T00:00:00.000Z");

test("mainnet staking derivation ignores pre-mainnet, app-only, and non-staking transfers", () => {
  const rows = deriveMainnetStakingPositionsFromTransfers(
    [
      {
        txHash: "OLDTESTNET",
        timestamp: "2026-05-07T12:00:00.000Z",
        senderAddress: "wolo1jimwallet",
        recipientAddress: stakingWalletAddress,
        amountWolo: 50_000,
        senderUserId: 1,
        senderLabel: "Jim",
      },
      {
        txHash: "DIRECTMAINNET",
        timestamp: "2026-05-25T08:11:32.000Z",
        senderAddress: "wolo1bank",
        recipientAddress: "wolo1jimwallet",
        amountWolo: 1_000,
        recipientUserId: 1,
        recipientLabel: "Jim",
      },
      {
        txHash: "STAKEMAINNET",
        timestamp: "2026-05-26T00:00:00.000Z",
        senderAddress: "wolo1emarenwallet",
        recipientAddress: stakingWalletAddress,
        amountWolo: 25,
        senderUserId: 2,
        senderLabel: "Emaren",
      },
    ],
    { stakingWalletAddress, mainnetStartAt, asOf }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].player, "Emaren");
  assert.equal(rows[0].currentStakedWolo, 25);
  assert.deepEqual(rows[0].txHashes, ["STAKEMAINNET"]);
});

test("mainnet staking derivation subtracts confirmed staking-wallet returns only", () => {
  const rows = deriveMainnetStakingPositionsFromTransfers(
    [
      {
        txHash: "STAKE",
        timestamp: "2026-05-25T10:00:00.000Z",
        senderAddress: "wolo1player",
        recipientAddress: stakingWalletAddress,
        amountWolo: 100,
        senderUserId: 3,
        senderLabel: "Player",
      },
      {
        txHash: "UNSTAKE",
        timestamp: "2026-05-26T10:00:00.000Z",
        senderAddress: stakingWalletAddress,
        recipientAddress: "wolo1player",
        amountWolo: 40,
        recipientUserId: 3,
        recipientLabel: "Player",
      },
    ],
    { stakingWalletAddress, mainnetStartAt, asOf }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].currentStakedWolo, 60);
  assert.equal(rows[0].totalStakedWolo, 100);
  assert.equal(rows[0].totalUnstakedWolo, 40);
});
