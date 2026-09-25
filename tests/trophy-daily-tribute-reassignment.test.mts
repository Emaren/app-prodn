import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { reconcileDailyTrophyTribute } from "../lib/trophies/dailyTributePolicy.ts";

function payout(overrides: Partial<{
  id: number;
  recipientUserId: number | null;
  recipientWoloAddress: string | null;
  status: string;
  txHash: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 1,
    recipientUserId:
      overrides.recipientUserId === undefined ? 10 : overrides.recipientUserId,
    recipientWoloAddress:
      overrides.recipientWoloAddress === undefined
        ? "wolo1oldholder"
        : overrides.recipientWoloAddress,
    status: overrides.status ?? "dry_run",
    txHash: overrides.txHash === undefined ? null : overrides.txHash,
  };
}

const jim = {
  userId: 20,
  woloAddress: "wolo1jim",
};

test("queues a current-holder tribute when no payout exists for the UTC day", () => {
  assert.deepEqual(reconcileDailyTrophyTribute([], jim), {
    action: "queue_current",
    stalePayoutIds: [],
  });
});

test("supersedes an unpaid former-holder obligation before queueing the current holder", () => {
  assert.deepEqual(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 91,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1zodiac",
          status: "dry_run",
        }),
      ],
      jim
    ),
    {
      action: "queue_current",
      stalePayoutIds: [91],
    }
  );
});

test("a cancelled former-holder row does not strand the new champion", () => {
  assert.deepEqual(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 92,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1zodiac",
          status: "cancelled",
        }),
      ],
      jim
    ),
    {
      action: "queue_current",
      stalePayoutIds: [92],
    }
  );
});

test("operator cancellation for the current holder is preserved", () => {
  assert.deepEqual(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 93,
          recipientUserId: jim.userId,
          recipientWoloAddress: jim.woloAddress,
          status: "cancelled",
        }),
      ],
      jim
    ),
    {
      action: "keep_current",
      stalePayoutIds: [],
      currentPayoutId: 93,
    }
  );
});

test("paid or tx-backed money truth blocks a second same-day trophy payment", () => {
  assert.deepEqual(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 94,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1zodiac",
          status: "paid",
          txHash: "ABC123",
        }),
      ],
      jim
    ),
    {
      action: "blocked_by_chain_truth",
      stalePayoutIds: [],
      blockingPayoutId: 94,
    }
  );

  assert.deepEqual(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 95,
          recipientUserId: 10,
          recipientWoloAddress: "wolo1zodiac",
          status: "failed",
          txHash: "CHAIN-TRUTH-EXISTS",
        }),
      ],
      jim
    ),
    {
      action: "blocked_by_chain_truth",
      stalePayoutIds: [],
      blockingPayoutId: 95,
    }
  );
});

test("recipient identity prefers linked user id and falls back to WOLO address", () => {
  assert.equal(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 96,
          recipientUserId: jim.userId,
          recipientWoloAddress: "wolo1staleaddress",
        }),
      ],
      jim
    ).action,
    "keep_current"
  );

  assert.equal(
    reconcileDailyTrophyTribute(
      [
        payout({
          id: 97,
          recipientUserId: null,
          recipientWoloAddress: "WOLO1JIM",
        }),
      ],
      jim
    ).action,
    "keep_current"
  );
});

test("queue implementation serializes trophy/day and records supersession evidence", () => {
  const source = readFileSync(
    new URL("../lib/trophies/service.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /pg_advisory_xact_lock\(hashtextextended/);
  assert.match(source, /status: "superseded"/);
  assert.match(source, /DAILY_TRIBUTE_PAYOUT_SUPERSEDED/);
  assert.match(source, /title_holder_changed_before_chain_execution/);
  assert.match(source, /supersededPayoutIds: reconciliation\.stalePayoutIds/);
});


test("admin payout rail treats cancelled and superseded rows as terminal", () => {
  const source = readFileSync(
    new URL("../components/admin/trophies/TrophyCommandCenter.tsx", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /\["paid", "cancelled", "superseded"\]\.includes\(payout\.status\)/
  );
  assert.match(
    source,
    /disabled=\{busy \|\| trophyPayoutIsTerminal\(payout\) \|\| !payout\.recipientWoloAddress\}/
  );
});
