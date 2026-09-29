import assert from "node:assert/strict";
import test from "node:test";

import {
  executePendingTrophyPayouts,
  prepareManualTrophyHolderTransferPayouts,
  prepareTrophyCustodyExit,
} from "../lib/trophies/service.ts";

function trophy(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    trophyId: "usa_champion_belt",
    displayName: "United States Champion",
    family: "national",
    tier: "National",
    currentHolderUserId: 10,
    currentHolderDisplayName: "Old Holder",
    currentHolderWoloAddress: "wolo1old",
    guardianHolderUserId: null,
    guardianHolderDisplayName: null,
    guardianHolderWoloAddress: null,
    status: "held",
    eligibilityNote: null,
    eloBandMin: null,
    eloBandMax: null,
    currentBountyWolo: 5,
    tributeAmountWolo: 10,
    bountyGrowthWolo: 2,
    payoutFrequency: "daily",
    bountyAccrualFrequency: "daily",
    chainStatus: "app_only",
    chainOwnerAddress: null,
    nftClassId: null,
    nftId: null,
    nftMetadataUri: null,
    nftImageUri: null,
    holderSince: new Date("2026-09-27T00:00:00.000Z"),
    forfeitureNeeded: false,
    lastChainSyncAt: null,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-28T00:00:00.000Z"),
    ...overrides,
  };
}

test("manual holder change preserves tribute chain truth and freezes accrued bounty", async () => {
  const createdPayouts: Array<Record<string, unknown>> = [];
  const createdEvents: Array<Record<string, unknown>> = [];
  const superseded: Array<Record<string, unknown>> = [];

  const tx = {
    trophyPayout: {
      findMany: async () => [
        {
          id: 91,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1old",
          status: "dry_run",
          txHash: null,
          amountWolo: 10,
        },
      ],
      updateMany: async (input: Record<string, unknown>) => {
        superseded.push(input);
        return { count: 1 };
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdPayouts.push(data);
        return { id: 100 + createdPayouts.length, ...data };
      },
    },
    trophyEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdEvents.push(data);
        return { id: 200 + createdEvents.length, ...data };
      },
    },
  };

  const result = await prepareManualTrophyHolderTransferPayouts(tx as never, {
    trophy: trophy() as never,
    previousHolderUserId: 10,
    previousHolderDisplayName: "Old Holder",
    nextHolderUserId: 20,
    nextHolderDisplayName: "New Holder",
    nextHolderWoloAddress: "wolo1new",
    now: new Date("2026-09-29T12:00:00.000Z"),
  });

  assert.equal(result.accruedBountyWolo, 9);
  assert.deepEqual(result.supersededTributePayoutIds, [91]);
  assert.equal(result.tributeBlockedByChainTruth, false);
  assert.equal(superseded.length, 1);

  const tribute = createdPayouts.find((row) => row.payoutKind === "daily_tribute");
  const bounty = createdPayouts.find((row) => row.payoutKind === "dethrone_bounty");
  assert.equal(tribute?.status, "dry_run");
  assert.equal(tribute?.recipientUserId, 20);
  assert.equal(bounty?.status, "pending");
  assert.equal(bounty?.amountWolo, 9);
  assert.equal(bounty?.recipientUserId, 20);
  assert.ok(createdEvents.some((row) => row.eventType === "DAILY_TRIBUTE_PAYOUT_SUPERSEDED"));
  assert.ok(
    createdEvents.some(
      (row) =>
        row.eventType === "DETHRONE_BOUNTY_PAYOUT_QUEUED" &&
        row.status === "pending"
    )
  );
});

test("paid same-day tribute blocks replacement but not the real dethrone obligation", async () => {
  const createdPayouts: Array<Record<string, unknown>> = [];
  const tx = {
    trophyPayout: {
      findMany: async () => [
        {
          id: 92,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1old",
          status: "paid",
          txHash: "ABC123",
          amountWolo: 10,
        },
      ],
      updateMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdPayouts.push(data);
        return { id: 300 + createdPayouts.length, ...data };
      },
    },
    trophyEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 400, ...data }),
    },
  };

  const result = await prepareManualTrophyHolderTransferPayouts(tx as never, {
    trophy: trophy() as never,
    previousHolderUserId: 10,
    previousHolderDisplayName: "Old Holder",
    nextHolderUserId: 20,
    nextHolderDisplayName: "New Holder",
    nextHolderWoloAddress: "wolo1new",
    now: new Date("2026-09-29T12:00:00.000Z"),
  });

  assert.equal(result.tributeBlockedByChainTruth, true);
  assert.equal(createdPayouts.filter((row) => row.payoutKind === "daily_tribute").length, 0);
  assert.equal(createdPayouts.filter((row) => row.payoutKind === "dethrone_bounty").length, 1);
});

test("custody exit freezes bounty and supersedes only executable Tribute", async () => {
  const updated: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const tx = {
    trophyPayout: {
      findMany: async () => [
        {
          id: 101,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1old",
          amountWolo: 10,
          status: "dry_run",
          txHash: null,
        },
        {
          id: 102,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1old",
          amountWolo: 10,
          status: "cancelled",
          txHash: null,
        },
      ],
      updateMany: async (input: Record<string, unknown>) => {
        updated.push(input);
        return { count: 1 };
      },
    },
    trophyEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: 500 + events.length, ...data };
      },
    },
  };

  const result = await prepareTrophyCustodyExit(tx as never, {
    trophy: trophy() as never,
    now: new Date("2026-09-29T12:00:00.000Z"),
    reason: "test_custody_exit",
    createdBy: "test",
  });

  assert.equal(result.frozenBountyWolo, 9);
  assert.equal(result.inFlightPayoutId, null);
  assert.deepEqual(result.supersededTributePayoutIds, [101]);
  assert.equal(updated.length, 1);
  assert.ok(
    events.some(
      (row) =>
        row.eventType === "DAILY_TRIBUTE_PAYOUT_SUPERSEDED" &&
        (row.rawRequest as Record<string, unknown>).reason === "test_custody_exit"
    )
  );
});

test("custody exit fails closed around an executing Tribute", async () => {
  let updates = 0;
  const tx = {
    trophyPayout: {
      findMany: async () => [
        {
          id: 103,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1old",
          amountWolo: 10,
          status: "executing",
          txHash: null,
        },
      ],
      updateMany: async () => {
        updates += 1;
        return { count: 1 };
      },
    },
    trophyEvent: {
      create: async () => {
        throw new Error("no event should be written while execution is in flight");
      },
    },
  };

  const result = await prepareTrophyCustodyExit(tx as never, {
    trophy: trophy() as never,
    now: new Date("2026-09-29T12:00:00.000Z"),
    reason: "test_custody_exit",
    createdBy: "test",
  });

  assert.equal(result.inFlightPayoutId, 103);
  assert.deepEqual(result.supersededTributePayoutIds, []);
  assert.equal(updates, 0);
});

test("executor supersedes a stale daily Tribute before any payout call", async () => {
  const payoutRow = {
    id: 104,
    trophyId: 7,
    recipientUserId: 10,
    recipientDisplayName: "Old Holder",
    recipientWoloAddress: "wolo1old",
    amountWolo: 10,
    payoutKind: "daily_tribute",
    status: "dry_run",
    scheduledFor: new Date("2026-09-29T00:00:00.000Z"),
    paidAt: null,
    txHash: null,
    errorState: null,
    rawRequest: null,
    rawResponse: null,
    retryCount: 0,
    createdAt: new Date("2026-09-29T00:00:00.000Z"),
    updatedAt: new Date("2026-09-29T00:00:00.000Z"),
    trophy: trophy({
      currentHolderUserId: 20,
      currentHolderDisplayName: "New Holder",
      currentHolderWoloAddress: "wolo1new",
    }),
  };
  const mutations: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const tx = {
    $queryRaw: async () => [],
    trophy: {
      findUnique: async () => payoutRow.trophy,
    },
    trophyPayout: {
      findUnique: async (input: Record<string, unknown>) =>
        "include" in input ? payoutRow : { id: 104, trophyId: 7 },
      updateMany: async (input: Record<string, unknown>) => {
        mutations.push(input);
        return { count: 1 };
      },
    },
    trophyEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        events.push(data);
        return { id: 700 + events.length, ...data };
      },
    },
  };
  const prisma = {
    trophyPayout: {
      findMany: async () => [
        {
          id: 104,
          amountWolo: 10,
          recipientDisplayName: "Old Holder",
          trophy: { trophyId: "usa_champion_belt" },
        },
      ],
    },
    $transaction: async (callback: (client: unknown) => unknown) => callback(tx),
  };

  const result = await executePendingTrophyPayouts(prisma as never, { limit: 1 });

  assert.equal(result.scanned, 1);
  assert.equal(result.paid, 0);
  assert.equal(result.skipped, 1);
  assert.match(result.results[0]?.detail || "", /no longer matches live Trophy custody/);
  assert.ok(
    mutations.some(
      (input) =>
        (input.data as Record<string, unknown>).status === "superseded"
    )
  );
  assert.ok(
    events.some((row) => row.eventType === "DAILY_TRIBUTE_PAYOUT_SUPERSEDED")
  );
});

test("generic payout executor never admits dry-run bounty previews", async () => {
  let where: unknown = null;
  const prisma = {
    trophyPayout: {
      findMany: async (input: { where: unknown }) => {
        where = input.where;
        return [];
      },
    },
  };

  const result = await executePendingTrophyPayouts(prisma as never, {
    includeBounties: true,
    limit: 1,
  });

  assert.equal(result.scanned, 0);
  const serialized = JSON.stringify(where);
  assert.ok(serialized.includes("dethrone_bounty"));
  assert.ok(serialized.includes('["pending","retrying","failed"]'));
  assert.ok(!serialized.includes('"payoutKind":"dethrone_bounty","status":{"in":["dry_run"'));
});
