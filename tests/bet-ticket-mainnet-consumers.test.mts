import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hasRecordedBetWagerFunding,
  isMainnetVisibleFundedBetWager,
  visibleMainnetFundedBetWagerWhere,
} from "../lib/betStakeFunding.ts";

const afterMainnetStart = new Date("2026-07-30T12:00:00.000Z");

test("mainnet wager visibility accepts only recorded legacy or ticket proof", () => {
  const legacy = {
    executionMode: "onchain_escrow",
    stakeTxHash: "LEGACY-TX",
    stakeLockedAt: afterMainnetStart,
    stakeIntent: { status: "recorded" },
  };
  const ticket = {
    executionMode: "onchain_escrow",
    stakeTxHash: null,
    stakeLockedAt: afterMainnetStart,
    stakeIntent: null,
    stakeLeg: {
      ticket: {
        status: "recorded",
        stakeTxHash: "TICKET-TX",
      },
    },
  };

  assert.equal(hasRecordedBetWagerFunding(legacy), true);
  assert.equal(hasRecordedBetWagerFunding(ticket), true);
  assert.equal(isMainnetVisibleFundedBetWager(legacy), true);
  assert.equal(isMainnetVisibleFundedBetWager(ticket), true);
  assert.equal(
    isMainnetVisibleFundedBetWager({
      ...legacy,
      stakeIntent: { status: "awaiting_signature" },
    }),
    false
  );
  assert.equal(
    isMainnetVisibleFundedBetWager({
      ...ticket,
      stakeLeg: {
        ticket: {
          status: "verified_unrecorded",
          stakeTxHash: "TICKET-TX",
        },
      },
    }),
    false
  );
  assert.equal(
    isMainnetVisibleFundedBetWager({
      ...ticket,
      executionMode: "app_only",
    }),
    false
  );
  assert.equal(
    isMainnetVisibleFundedBetWager({
      ...ticket,
      stakeLockedAt: new Date("2026-05-01T00:00:00.000Z"),
    }),
    false
  );
});

test("shared mainnet query keeps caller predicates and both recorded proof rails", () => {
  const extra = {
    settledAt: {
      gte: new Date("2026-07-30T00:00:00.000Z"),
      lt: new Date("2026-07-31T00:00:00.000Z"),
    },
  };
  const where = visibleMainnetFundedBetWagerWhere(extra);
  const serialized = JSON.stringify(where);

  assert.deepEqual(Array.isArray(where.AND) ? where.AND[0] : null, extra);
  assert.match(serialized, /"executionMode":"onchain_escrow"/);
  assert.match(serialized, /"stakeIntent":\{"is":\{"status":"recorded"\}\}/);
  assert.match(serialized, /"stakeLeg":\{"is":\{"ticket":\{"is":\{"status":"recorded","stakeTxHash":\{"not":null\}/);
});

test("daily staking distribution records volume returned through the shared ticket-aware fence", async () => {
  const stakingWalletEnv = "NEXT_PUBLIC_WOLO_STAKING_WALLET_ADDRESS";
  const previousStakingWallet = process.env[stakingWalletEnv];
  process.env[stakingWalletEnv] = "wolo1teststakingwallet";

  let aggregateWhere: unknown = null;
  let dailyStatUpsert: Record<string, unknown> | null = null;

  const tx = {
    stakingRewardDistribution: {
      create: async ({ data }: { data: { status: string } }) => ({
        id: 91,
        status: data.status,
      }),
    },
    stakingDailyStat: {
      upsert: async (args: Record<string, unknown>) => {
        dailyStatUpsert = args;
        return args;
      },
    },
  };
  const prisma = {
    stakingRewardDistribution: {
      findUnique: async () => null,
    },
    betWager: {
      aggregate: async ({ where }: { where: unknown }) => {
        aggregateWhere = where;
        // One 10 WOLO legacy stake plus one 20 WOLO ticket stake.
        return {
          _sum: { amountWolo: 30 },
          _count: { _all: 2 },
        };
      },
    },
    stakingPosition: {
      findMany: async () => [],
    },
    stakingEvent: {
      findMany: async () => [],
    },
    $transaction: async <T>(callback: (client: typeof tx) => Promise<T>) =>
      callback(tx),
  };

  try {
    const { calculateDailyStakingRewardDistribution } = await import(
      "../lib/staking.ts"
    );
    const result = await calculateDailyStakingRewardDistribution(
      prisma as never,
      new Date("2026-07-30T00:00:00.000Z")
    );
    const serializedWhere = JSON.stringify(aggregateWhere);
    const create = (dailyStatUpsert?.create ?? {}) as Record<string, unknown>;

    assert.deepEqual(result, {
      distributionId: 91,
      created: true,
      status: "FINALIZED",
    });
    assert.match(serializedWhere, /"stakeIntent":/);
    assert.match(serializedWhere, /"stakeLeg":/);
    assert.equal(create.betVolumeWolo, 30);
    assert.equal(create.betsPlaced, 2);
  } finally {
    if (previousStakingWallet === undefined) {
      delete process.env[stakingWalletEnv];
    } else {
      process.env[stakingWalletEnv] = previousStakingWallet;
    }
  }
});

test("user history and admin operator rails expose the shared ticket funding proof", async () => {
  const [userTransactions, adminUsers, adminRails] = await Promise.all([
    readFile("app/api/user/wolo-transactions/route.ts", "utf8"),
    readFile("app/api/admin/users/route.ts", "utf8"),
    readFile("app/api/admin/users/rails/route.ts", "utf8"),
  ]);

  assert.match(userTransactions, /visibleMainnetFundedBetWagerWhere\(\{ userId \}\)/);
  assert.match(userTransactions, /const stakeTxHash = effectiveBetWagerStakeTxHash\(wager\)/);

  for (const source of [userTransactions, adminUsers, adminRails]) {
    assert.match(source, /stakeLeg:\s*\{[\s\S]*?ticket:\s*\{[\s\S]*?stakeTxHash:\s*true/);
    assert.match(source, /effectiveBetWagerStakeTxHash\(/);
  }

  assert.match(adminUsers, /visibleMainnetFundedBetWagerWhere\(\{/);
  assert.match(adminUsers, /isMainnetVisibleFundedBetWager\(wager\)/);
  assert.match(adminRails, /isMainnetVisibleFundedBetWager\(wager\)/);
});

test("detail, staking, replay authority, and recovery surfaces retain ticket proof", async () => {
  const [marketDetail, stakingLedger, staking, replayAuthority, recovery] =
    await Promise.all([
      readFile("app/bets/[marketId]/page.tsx", "utf8"),
      readFile("app/api/staking/stakers/[slug]/ledger/route.ts", "utf8"),
      readFile("lib/staking.ts", "utf8"),
      readFile("lib/replayFinancialAuthority.ts", "utf8"),
      readFile("lib/woloTransactionRecovery.ts", "utf8"),
    ]);

  for (const source of [marketDetail, stakingLedger]) {
    assert.match(source, /left join bet_stake_legs/i);
    assert.match(source, /left join bet_stake_tickets/i);
    assert.match(source, /ticket\.status = 'recorded'/);
  }

  assert.match(staking, /prisma\.betStakeTicket\.findMany/);
  assert.match(staking, /ticket\.legs\.find\(\(leg\) => leg\.legRole === "winner"\)/);
  assert.match(replayAuthority, /effectiveBetWagerStakeTxHash\(wager\)/);
  assert.match(recovery, /source: "bet_stake_tickets"/);
  assert.match(recovery, /actionLabel: "One-transfer bet ticket"/);
});
