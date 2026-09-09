import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/staking.ts", import.meta.url),
  "utf8",
);
const playerProfileSource = await readFile(
  new URL("../lib/playerProfile.ts", import.meta.url),
  "utf8",
);

function functionSlice(startNeedle: string, endNeedle: string) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  assert.ok(start >= 0, `missing start: ${startNeedle}`);
  assert.ok(end > start, `missing end: ${endNeedle}`);
  return source.slice(start, end);
}
test("new mainnet auto-compound allocations remain pending until custody", () => {
  const calculate = functionSlice(
    "export async function calculateDailyStakingRewardDistribution",
    "export async function finalizeChainBackedCompoundAllocation",
  );

  assert.match(calculate, /"COMPOUND_PENDING"/);
  assert.match(
    calculate,
    /if \(shouldCompound && rewardWolo > 0 && !isWoloMainnet\(\)\)/,
  );
  assert.match(
    calculate,
    /rewardSettlementPolicy: STAKING_REWARD_SETTLEMENT_POLICY_V2/,
  );
  assert.match(calculate, /compoundCustodyAddress/);
});
test("v2 reward settlement is escrow-authorized and versioned", () => {
  const execute = source.slice(
    source.indexOf("export async function executeDailyStakingRewardPayouts"),
  );

  assert.match(execute, /buildStakingRewardSettlementRunIdV2/);
  assert.match(execute, /staking-reward-v2-/);
  assert.match(execute, /validateWoloEscrowSettlementRun\(settlementInput\)/);
  assert.match(execute, /executeWoloEscrowSettlementRun\(settlementInput\)/);
  assert.match(execute, /validation\.signerRole !== "escrow"/);
  assert.match(execute, /validatedSignerAddress !== expectedEscrowAddress/);
  assert.match(execute, /execution\.signerRole !== "escrow"/);
  assert.match(
    execute,
    /normalizeWoloAddress\(execution\.signerAddress\) !== expectedEscrowAddress/,
  );
});
test("v2 dry-run and execution receipts must match recipient and amount", () => {
  const execute = source.slice(
    source.indexOf("export async function executeDailyStakingRewardPayouts"),
  );

  assert.match(
    execute,
    /normalizeWoloAddress\(payout\.toAddress\)[\s\S]*normalizeWoloAddress\(plan\.walletAddress\)/,
  );
  assert.match(
    execute,
    /payout\.amountUWolo !== toUwoLoAmount\(plan\.allocation\.rewardWolo\)/,
  );
  assert.match(execute, /dryRunMatchesPlan/);
});
test("compound liability uses real chain tx hash and never increments direct principal", () => {
  const finalize = functionSlice(
    "export async function finalizeChainBackedCompoundAllocation",
    "export async function finalizeChainBackedCashAllocation",
  );

  assert.match(finalize, /txHash: input\.payoutTxHash/);
  assert.match(finalize, /compoundedRewardsWolo: \{ increment: allocation\.rewardWolo \}/);
  assert.doesNotMatch(
    finalize,
    /currentStakedWolo:\s*\{\s*increment:/,
  );
  assert.match(finalize, /if \(allocation\.status === "COMPOUNDED"\) return true/);
  assert.match(finalize, /stakingRewardAllocation\.updateMany/);
});


test("player profile counts mainnet staking reward allocations exactly once", () => {
  const start = playerProfileSource.indexOf("const stakingRewardsWolo =");
  const end = playerProfileSource.indexOf("const claimedClaimWolo", start);
  assert.ok(start >= 0 && end > start, "missing staking reward profile calculation");
  const calculation = playerProfileSource.slice(start, end);

  assert.match(calculation, /allocations\.reduce\(/);
  assert.match(calculation, /isAtOrAfterWoloMainnetStart\(allocation\.createdAt\)/);
  assert.match(calculation, /allocation\.rewardWolo/);
  assert.doesNotMatch(calculation, /position\?\.pendingRewardsWolo/);
  assert.doesNotMatch(calculation, /position\?\.claimedRewardsWolo/);
});


test("mainnet reward read models do not require legacy null position ids", () => {
  const snapshot = functionSlice(
    "export async function loadMainnetRewardSnapshotForUser",
    "export async function loadStakingLeaderboard",
  );
  const leaderboardStart = source.indexOf("async function loadMainnetLeaderboardData");
  const leaderboardEnd = source.indexOf("function buildMainnetBoardRows", leaderboardStart);
  const leaderboard = source.slice(leaderboardStart, leaderboardEnd);
  const recentStart = source.indexOf("async function loadRecentRewardRows");
  const recentEnd = source.indexOf("export async function loadMainnetRewardSnapshotForUser", recentStart);
  const recent = source.slice(recentStart, recentEnd);

  assert.doesNotMatch(snapshot, /positionId:\s*null/);
  assert.doesNotMatch(leaderboard, /positionId:\s*null/);
  assert.doesNotMatch(recent, /positionId:\s*null/);
  assert.match(snapshot, /status:\s*"COMPOUND_PENDING"/);
});
