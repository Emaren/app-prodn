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

test("mainnet staking derivation maps an operating wallet deposit into custody stake", () => {
  const operatingWallet = "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e";
  const custodyWallet = "wolo1rmr39nd5gnnv5y5f66qtq367xfwvx9jt5w7ucr";

  const rows = deriveMainnetStakingPositionsFromTransfers(
    [
      {
        txHash: "5D4824B1BA911604CD41A53F4C391B1D8B55A696B60DB844039969D0BFD33E05",
        timestamp: "2026-06-02T01:05:11.000Z",
        senderAddress: operatingWallet,
        recipientAddress: custodyWallet,
        amountWolo: 100,
        senderUserId: 2,
        senderLabel: "Emaren",
      },
    ],
    {
      stakingWalletAddress: custodyWallet,
      mainnetStartAt,
      asOf: new Date("2026-06-02T04:00:00.000Z"),
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].player, "Emaren");
  assert.equal(rows[0].walletAddress, operatingWallet);
  assert.equal(rows[0].currentStakedWolo, 100);
  assert.equal(rows[0].totalStakedWolo, 100);
  assert.notEqual(rows[0].walletAddress, custodyWallet);
});

test("mainnet staking derivation dedupes indexed and app-verified rows for the same tx", () => {
  const rows = deriveMainnetStakingPositionsFromTransfers(
    [
      {
        txHash: "DUPLICATESTAKE",
        timestamp: "2026-06-02T01:05:11.000Z",
        senderAddress: "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e",
        recipientAddress: stakingWalletAddress,
        amountWolo: 100,
      },
      {
        txHash: "duplicateStake",
        timestamp: "2026-06-02T01:05:12.000Z",
        senderAddress: "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e",
        recipientAddress: stakingWalletAddress,
        amountWolo: 100,
        senderUserId: 2,
        senderLabel: "Emaren",
      },
    ],
    {
      stakingWalletAddress,
      mainnetStartAt,
      asOf: new Date("2026-06-02T04:00:00.000Z"),
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].player, "Emaren");
  assert.equal(rows[0].currentStakedWolo, 100);
  assert.deepEqual(rows[0].txHashes, ["duplicateStake"]);
});
