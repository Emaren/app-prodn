import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyMainnetStakingBalanceChange,
  deriveMainnetStakingPositionsFromTransfers,
  resolvePublicCurrentStakedWolo,
} from "../lib/mainnetStakingDerivation.ts";

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

test("complete confirmed event ledger includes both custody-era unstakes and derives Emaren at 101", () => {
  const walletAddress =
    "wolo1wue7vyque2pssskgdrww0fcadlq9ps6mtn605e";
  const confirmedEventTransfers = [
    {
      txHash: "INITIAL100",
      timestamp: "2026-06-02T01:05:11.000Z",
      senderAddress: walletAddress,
      recipientAddress: stakingWalletAddress,
      amountWolo: 100,
      senderUserId: 2,
      senderLabel: "Emaren",
    },
    {
      txHash: "STAKE10-A",
      timestamp: "2026-06-05T00:11:44.000Z",
      senderAddress: walletAddress,
      recipientAddress: stakingWalletAddress,
      amountWolo: 10,
      senderUserId: 2,
      senderLabel: "Emaren",
    },
    {
      txHash: "UNSTAKE10-LEGACY-CUSTODY",
      timestamp: "2026-06-07T04:05:21.000Z",
      senderAddress: stakingWalletAddress,
      recipientAddress: walletAddress,
      amountWolo: 10,
      recipientUserId: 2,
      recipientLabel: "Emaren",
    },
    {
      txHash: "UNSTAKE10-CURRENT-CUSTODY",
      timestamp: "2026-06-07T04:06:45.000Z",
      senderAddress: stakingWalletAddress,
      recipientAddress: walletAddress,
      amountWolo: 10,
      recipientUserId: 2,
      recipientLabel: "Emaren",
    },
    {
      txHash: "STAKE10-B",
      timestamp: "2026-06-07T04:28:10.000Z",
      senderAddress: walletAddress,
      recipientAddress: stakingWalletAddress,
      amountWolo: 10,
      senderUserId: 2,
      senderLabel: "Emaren",
    },
    {
      txHash: "COMPOUND1",
      timestamp: "2026-06-09T00:00:00.000Z",
      senderAddress: walletAddress,
      recipientAddress: stakingWalletAddress,
      amountWolo: 1,
      senderUserId: 2,
      senderLabel: "Emaren",
    },
  ];
  const confirmed = deriveMainnetStakingPositionsFromTransfers(
    confirmedEventTransfers,
    {
      stakingWalletAddress,
      mainnetStartAt,
      asOf: new Date("2026-08-08T00:00:00.000Z"),
      weightStartAt: new Date("2026-08-07T00:00:00.000Z"),
      rewardWeightCapWolo: 10_000,
    },
  );
  const partialCurrentCustodyScan = deriveMainnetStakingPositionsFromTransfers(
    confirmedEventTransfers.filter(
      (transfer) => transfer.txHash !== "UNSTAKE10-LEGACY-CUSTODY",
    ),
    {
      stakingWalletAddress,
      mainnetStartAt,
      asOf: new Date("2026-08-08T00:00:00.000Z"),
      weightStartAt: new Date("2026-08-07T00:00:00.000Z"),
      rewardWeightCapWolo: 10_000,
    },
  );

  assert.equal(confirmed[0].currentStakedWolo, 101);
  assert.equal(confirmed[0].stakingWeight, "8726400");
  assert.equal(partialCurrentCustodyScan[0].currentStakedWolo, 111);
  assert.equal(partialCurrentCustodyScan[0].stakingWeight, "9590400");
  assert.equal(
    resolvePublicCurrentStakedWolo({
      currentStakedWolo: 100,
      compoundedRewardsWolo: 1,
    }),
    101,
  );
});

test("mainnet full unstake consumes the complete 101 WOLO canonical seat", () => {
  const result = applyMainnetStakingBalanceChange(
    { currentStakedWolo: 100, compoundedRewardsWolo: 1 },
    "UNSTAKE",
    101,
  );

  assert.deepEqual(result, {
    balanceBefore: 101,
    balanceAfter: 0,
    currentStakedWolo: 0,
    compoundedRewardsWolo: 0,
  });

  const stakingDomain = readFileSync(
    new URL("../lib/staking.ts", import.meta.url),
    "utf8",
  );
  assert.match(stakingDomain, /applyMainnetStakingBalanceChange\(/);
  assert.match(
    stakingDomain,
    /compoundedRewardsWolo:\s*mainnetBalance\.compoundedRewardsWolo/,
  );
});

test("mainnet partial unstake preserves compounded principal and an active remainder", () => {
  const result = applyMainnetStakingBalanceChange(
    { currentStakedWolo: 100, compoundedRewardsWolo: 1 },
    "UNSTAKE",
    100,
  );

  assert.deepEqual(result, {
    balanceBefore: 101,
    balanceAfter: 1,
    currentStakedWolo: 0,
    compoundedRewardsWolo: 1,
  });
});

test("staking activity rows keep their established fixed heights without intrinsic placeholder swaps", () => {
  const activityFeed = readFileSync(
    new URL("../app/staking/StakingActivityFeed.tsx", import.meta.url),
    "utf8",
  );

  assert.match(activityFeed, /h-\[5\.45rem\]/);
  assert.match(activityFeed, /h-\[10\.625rem\]/);
  assert.doesNotMatch(activityFeed, /contain-intrinsic-size/);
  assert.doesNotMatch(activityFeed, /content-visibility:auto/);
});

test("staking tiles share one coalesced viewer snapshot and force a fresh read after mutations", () => {
  const provider = readFileSync(
    new URL("../app/staking/StakingStateProvider.tsx", import.meta.url),
    "utf8",
  );
  const shell = readFileSync(
    new URL("../app/staking/StakingViewShell.tsx", import.meta.url),
    "utf8",
  );
  const action = readFileSync(
    new URL("../app/staking/StakingActionTile.tsx", import.meta.url),
    "utf8",
  );
  const liveRefresh = readFileSync(
    new URL("../app/staking/StakingLiveRefresh.tsx", import.meta.url),
    "utf8",
  );
  const consumers = [
    "../app/staking/StakingHeroStakeTiles.tsx",
    "../app/staking/StakingWalletPanel.tsx",
    "../app/staking/StakingActionTile.tsx",
  ].map((file) =>
    readFileSync(new URL(file, import.meta.url), "utf8"),
  );

  const stakingMeFetches = [provider, ...consumers]
    .join("\n")
    .match(/fetch\("\/api\/staking\/me"/g);
  assert.equal(stakingMeFetches?.length, 1);
  assert.match(shell, /<StakingStateProvider>/);
  for (const consumer of consumers) {
    assert.match(consumer, /useStakingState/);
    assert.doesNotMatch(consumer, /fetch\("\/api\/staking\/me"/);
  }
  assert.match(provider, /if \(inFlightRef\.current\) return inFlightRef\.current/);
  assert.match(provider, /if \(options\.force\)/);
  assert.match(action, /refreshStakingState\(\{ force: true \}\)/);
  assert.match(action, /updateStakingState/);
  assert.match(liveRefresh, /void refreshStakingState\(\)/);
});
