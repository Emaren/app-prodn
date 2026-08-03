import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  canonicalizeNumberedBountyTransfers,
  circularWarriorOffset,
  isPublicBountyContract,
  isVerifiedCanonicalBountyPayout,
  moveWarriorIndex,
  OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES,
  parseBountyRewardWolo,
  parseWrittenBountyNumber,
  requiresBountyValuationReason,
  shouldRotateBountyCarousel,
  visibleWarriorIndexes,
} from "../lib/bountyHall.ts";

test("numbered bounty admission requires an official issuer and explicit number", () => {
  const issuer =
    OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES[0];

  const valid = {
    id: 1,
    txHash: "ABC123",
    transferIndex: 0,
    timestamp:
      new Date(
        "2026-06-07T03:15:15Z",
      ),
    senderAddress: issuer,
    recipientAddress:
      "wolo1recipient",
    amountWoloDisplay:
      "125000.000000",
    memo:
      "Bounty #1 — The First Scout.",
  };

  const rows =
    canonicalizeNumberedBountyTransfers([
      valid,
      {
        ...valid,
        id: 2,
        txHash: "WRONG-SENDER",
        senderAddress:
          "wolo1notanissuer",
      },
      {
        ...valid,
        id: 3,
        txHash: "NO-NUMBER",
        memo:
          "Winner bounty · automatic match bonus",
      },
      {
        ...valid,
        id: 4,
        txHash: "",
      },
      {
        ...valid,
        id: 5,
        txHash: "ZERO",
        amountWoloDisplay: "0",
      },
    ]);

  assert.deepEqual(
    rows.map(
      (row) => row.id,
    ),
    [1],
  );

  assert.equal(
    parseWrittenBountyNumber(
      "Founders Win bonus",
    ),
    null,
  );
});

test("canonical paid truth requires paid status and transaction proof", () => {
  assert.equal(
    isVerifiedCanonicalBountyPayout({
      status: "paid",
      txHash: "ABC123",
    }),
    true,
  );
  assert.equal(
    isVerifiedCanonicalBountyPayout({
      status: "pending",
      txHash: "ABC123",
    }),
    false,
  );
  assert.equal(
    isVerifiedCanonicalBountyPayout({
      status: "paid",
      txHash: null,
    }),
    false,
  );
});

test("numbered bounty chronology closes written gaps without changing chain evidence", () => {
  const issuer =
    OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES[1];

  const base = {
    senderAddress: issuer,
    recipientAddress:
      "wolo1recipient",
    amountWoloDisplay:
      "1000.000000",
    transferIndex: 0,
  };

  const rows =
    canonicalizeNumberedBountyTransfers([
      {
        ...base,
        id: 44,
        txHash: "TX44",
        timestamp:
          new Date(
            "2026-07-15T22:05:43Z",
          ),
        memo:
          "Bounty #44 — Jim's 2 Cents.",
      },
      {
        ...base,
        id: 5,
        txHash: "TX5",
        timestamp:
          new Date(
            "2026-06-08T23:03:40Z",
          ),
        memo:
          "Bounty #5 — The Tribe Grows.",
      },
      {
        ...base,
        id: 1,
        txHash: "TX1",
        timestamp:
          new Date(
            "2026-06-07T03:15:15Z",
          ),
        memo:
          "Bounty #1 — The First Scout.",
      },
      {
        ...base,
        id: 999,
        txHash: "TX1",
        timestamp:
          new Date(
            "2026-06-07T03:15:15Z",
          ),
        memo:
          "Bounty #1 — Duplicate index record.",
      },
    ]);

  assert.deepEqual(
    rows.map(
      (row) =>
        row.canonicalNumber,
    ),
    [1, 2, 3],
  );

  assert.deepEqual(
    rows.map(
      (row) =>
        row.writtenNumber,
    ),
    [1, 5, 44],
  );

  assert.deepEqual(
    rows.map(
      (row) =>
        row.canonicalMemo,
    ),
    [
      "Bounty #1 — The First Scout.",
      "Bounty #2 — The Tribe Grows.",
      "Bounty #3 — Jim's 2 Cents.",
    ],
  );

  assert.equal(
    rows[1].memo,
    "Bounty #5 — The Tribe Grows.",
  );
});

test("every published reward change or withdrawal requires an operator reason", () => {
  assert.equal(
    requiresBountyValuationReason({
      existing: false,
      previousRewardWolo: null,
      nextRewardWolo: null,
    }),
    false,
  );

  assert.equal(
    requiresBountyValuationReason({
      existing: false,
      previousRewardWolo: null,
      nextRewardWolo: 25_000,
    }),
    true,
  );

  assert.equal(
    requiresBountyValuationReason({
      existing: true,
      previousRewardWolo: 25_000,
      nextRewardWolo: 25_000,
    }),
    false,
  );

  assert.equal(
    requiresBountyValuationReason({
      existing: true,
      previousRewardWolo: 25_000,
      nextRewardWolo: 30_000,
    }),
    true,
  );

  assert.equal(
    requiresBountyValuationReason({
      existing: true,
      previousRewardWolo: 25_000,
      nextRewardWolo: null,
    }),
    true,
  );
});

test("personal warrior bounties stay out of the open contract wall", () => {
  assert.equal(
    isPublicBountyContract({ bountyKind: "open_contract" }),
    true,
  );
  assert.equal(
    isPublicBountyContract({ bountyKind: "kingdom_commission" }),
    true,
  );
  assert.equal(
    isPublicBountyContract({ bountyKind: "personal" }),
    false,
  );
});

test("published reward parsing rejects ambiguous or lossy values", () => {
  assert.deepEqual(parseBountyRewardWolo(null), {
    ok: true,
    value: null,
  });
  assert.deepEqual(parseBountyRewardWolo(""), {
    ok: true,
    value: null,
  });
  assert.deepEqual(parseBountyRewardWolo(25_000), {
    ok: true,
    value: 25_000,
  });
  assert.equal(parseBountyRewardWolo("25,000").ok, false);
  assert.equal(parseBountyRewardWolo("1e3").ok, false);
  assert.equal(parseBountyRewardWolo("1.0").ok, false);
  assert.equal(parseBountyRewardWolo(false).ok, false);
  assert.equal(parseBountyRewardWolo([]).ok, false);
  assert.equal(parseBountyRewardWolo(1.5).ok, false);
  assert.equal(parseBountyRewardWolo(-1).ok, false);
  assert.equal(
    parseBountyRewardWolo(Number.MAX_SAFE_INTEGER + 1).ok,
    false,
  );
});

test("the carousel renders only the circular five-warrior window", () => {
  assert.deepEqual(visibleWarriorIndexes(19, 0), [17, 18, 0, 1, 2]);
  assert.deepEqual(visibleWarriorIndexes(4, 1), [3, 0, 1, 2]);
  assert.equal(circularWarriorOffset(18, 0, 19), -1);
  assert.equal(circularWarriorOffset(1, 18, 19), 2);
  assert.equal(moveWarriorIndex(18, 1, 19), 0);
  assert.equal(moveWarriorIndex(0, -1, 19), 18);
});

test("automatic movement pauses for every interaction and accessibility gate", () => {
  const base = {
    documentVisible: true,
    focused: false,
    hovered: false,
    manualPauseUntil: 0,
    now: 100,
    reducedMotion: false,
    touching: false,
  };

  assert.equal(shouldRotateBountyCarousel(base), true);
  assert.equal(shouldRotateBountyCarousel({ ...base, hovered: true }), false);
  assert.equal(shouldRotateBountyCarousel({ ...base, focused: true }), false);
  assert.equal(shouldRotateBountyCarousel({ ...base, touching: true }), false);
  assert.equal(shouldRotateBountyCarousel({ ...base, reducedMotion: true }), false);
  assert.equal(shouldRotateBountyCarousel({ ...base, documentVisible: false }), false);
  assert.equal(shouldRotateBountyCarousel({ ...base, manualPauseUntil: 101 }), false);
});

test("public loader admits only official numbered on-chain bounty transfers", () => {
  const source = readFileSync(
    new URL(
      "../lib/bounties.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const publicLoader =
    source.slice(
      source.indexOf(
        "export async function loadBountyBoard",
      ),
      source.indexOf(
        "export async function loadBountyAdminSnapshot",
      ),
    );

  assert.match(
    publicLoader,
    /woloIndexedTransfer\.findMany/,
  );
  assert.match(
    publicLoader,
    /OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES/,
  );
  assert.match(
    publicLoader,
    /canonicalizeNumberedBountyTransfers/,
  );
  assert.match(
    publicLoader,
    /recipientAddress/,
  );
  assert.match(
    publicLoader,
    /walletAddress/,
  );
  assert.match(
    publicLoader,
    /nextNumber/,
  );
  assert.match(
    publicLoader,
    /entry\.hasFeaturedAvatar/,
  );
  assert.match(
    publicLoader,
    /featuredAvatarCardUrlForUser/,
  );
  assert.match(
    publicLoader,
    /isVerifiedCanonicalBountyPayout/,
  );
  assert.match(
    publicLoader,
    /isPublicBountyContract/,
  );

  assert.doesNotMatch(
    publicLoader,
    /pendingWoloClaim/,
  );
  assert.doesNotMatch(
    publicLoader,
    /winner_bounty/,
  );
  assert.doesNotMatch(
    publicLoader,
    /founders_bonus/,
  );
  assert.doesNotMatch(
    publicLoader,
    /founders_win/,
  );
  assert.doesNotMatch(
    publicLoader,
    /prisma\.trophyPayout/,
  );
  assert.doesNotMatch(
    publicLoader,
    /userGift/,
  );
});

test("staking bounty history shares the official numbered memo rule", () => {
  const route = readFileSync(
    new URL(
      "../app/api/staking/activity/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  const feed = readFileSync(
    new URL(
      "../app/staking/StakingActivityFeed.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    route,
    /canonicalizeNumberedBountyTransfers/,
  );
  assert.match(
    route,
    /OFFICIAL_NUMBERED_BOUNTY_ISSUER_ADDRESSES/,
  );
  assert.match(
    route,
    /public-numbered-bounty/,
  );
  assert.doesNotMatch(
    route,
    /user_gifts/,
  );
  assert.doesNotMatch(
    route,
    /like '%bounty%'/,
  );

  assert.match(
    feed,
    /parseWrittenBountyNumber/,
  );
  assert.match(
    feed,
    /Next bounty/,
  );
  assert.match(
    feed,
    /canonical sequence/,
  );
  assert.doesNotMatch(
    feed,
    /reserved gifts/,
  );
});

test("the public contract wall excludes personal warrior bounties", () => {
  const source = readFileSync(
    new URL("../components/bounties/BountyBoardViews.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /isPublicBountyContract/);
  assert.match(source, /const contracts = board\.opportunities\.filter/);
  assert.match(source, /contracts\.map/);
  assert.match(source, /Reward not published/);
});

test("the public carousel uses stable uid attribution and database next bounties", () => {
  const source = readFileSync(
    new URL("../components/bounties/BountyWarriorCarousel.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /entry\.actorUid === warrior\.uid/);
  assert.match(source, /activeWarrior\.nextBounty/);
  assert.match(source, /visibleWarriorIndexes/);
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /onTouchStart/);
  assert.match(source, /onTouchCancel/);
  assert.doesNotMatch(source, /NEXT_MISSIONS/);
  assert.doesNotMatch(source, /memo\.includes/);
  assert.doesNotMatch(source, /sessionStorage/);
});

test("the admin cannot manufacture paid or locked opportunity status", () => {
  const route = readFileSync(
    new URL("../app/api/admin/bounties/route.ts", import.meta.url),
    "utf8",
  );
  const admin = readFileSync(
    new URL("../components/admin/bounties/BountyCommandCenter.tsx", import.meta.url),
    "utf8",
  );

  assert.match(route, /"available",\s*"in_progress",\s*"historical"/s);
  assert.match(route, /valuationReason/);
  assert.match(route, /requiresBountyValuationReason/);
  assert.match(route, /parseBountyRewardWolo/);
  assert.match(route, /randomUUID\(\)\.slice\(0, 8\)/);
  assert.match(route, /`\/players\/\$\{encodeURIComponent/);
  assert.match(route, /effectiveTo: now/);
  assert.match(route, /bountyValuation\.create/);
  assert.match(admin, /parsed\.toISOString\(\)/);
  assert.match(admin, /type="number"/);
  assert.doesNotMatch(admin, /const STATUSES = \[[^\]]*"paid"/s);
  assert.doesNotMatch(admin, /const STATUSES = \[[^\]]*"locked"/s);
});

test("the migration adds personal assignment without rewriting existing rows", () => {
  const migration = readFileSync(
    new URL(
      "../prisma/migrations/20260803150000_bounty_hall_v2_foundation/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /ADD COLUMN "assigned_user_id" INTEGER/);
  assert.match(migration, /ADD COLUMN "is_next_for_warrior" BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /uq_bounty_opportunities_one_next_per_warrior/);
  assert.match(migration, /FOREIGN KEY \("assigned_user_id"\)/);
  assert.match(migration, /ck_bounty_opportunities_next_requires_personal_kind/);
  assert.match(migration, /ck_bounty_opportunities_next_requires_active_status/);
  assert.match(migration, /ck_bounty_payouts_paid_requires_proof/);
  assert.doesNotMatch(migration, /DELETE FROM|TRUNCATE|UPDATE "bounty_opportunities"/i);
});
