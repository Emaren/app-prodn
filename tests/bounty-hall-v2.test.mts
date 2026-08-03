import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  circularWarriorOffset,
  dedupeVerifiedLegacyWinnerBounties,
  isPublicBountyContract,
  isVerifiedCanonicalBountyPayout,
  isVerifiedLegacyWinnerBounty,
  moveWarriorIndex,
  parseBountyRewardWolo,
  requiresBountyValuationReason,
  shouldRotateBountyCarousel,
  visibleWarriorIndexes,
} from "../lib/bountyHall.ts";

test("public legacy admission requires an identified paid winner bounty", () => {
  assert.equal(
    isVerifiedLegacyWinnerBounty({
      claimKind: "winner_bounty",
      claimedByUserId: 18168,
      payoutTxHash: "ABC123",
      rescindedAt: null,
      status: "claimed",
    }),
    true,
  );
  assert.equal(
    isVerifiedLegacyWinnerBounty({
      claimKind: "founders_bonus",
      claimedByUserId: 18168,
      payoutTxHash: "ABC123",
      rescindedAt: null,
      status: "claimed",
    }),
    false,
  );
  assert.equal(
    isVerifiedLegacyWinnerBounty({
      claimKind: "winner_bounty",
      claimedByUserId: null,
      payoutTxHash: "ABC123",
      rescindedAt: null,
    }),
    false,
  );
  assert.equal(
    isVerifiedLegacyWinnerBounty({
      claimKind: "winner_bounty",
      claimedByUserId: 18168,
      payoutTxHash: null,
      rescindedAt: null,
      status: "claimed",
    }),
    false,
  );
  assert.equal(
    isVerifiedLegacyWinnerBounty({
      claimKind: "winner_bounty",
      claimedByUserId: 18168,
      payoutTxHash: "ABC123",
      rescindedAt: null,
      status: "pending",
    }),
    false,
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

test("verified legacy winner rows deduplicate exact payout identities only", () => {
  const shared = {
    amountWolo: 25,
    claimGroupKey: "market",
    claimKind: "winner_bounty",
    claimedByUserId: 63,
    payoutTxHash: "ABC123",
    rescindedAt: null,
    status: "claimed",
    sourceGameStatsId: 9001,
    sourceMarketId: 7001,
  };

  const rows =
    dedupeVerifiedLegacyWinnerBounties([
      { id: 10, ...shared },
      { id: 11, ...shared },
      {
        id: 15,
        ...shared,
        sourceGameStatsId: null,
      },
      {
        id: 12,
        ...shared,
        sourceMarketId: 7002,
      },
      {
        id: 13,
        ...shared,
        claimedByUserId: 105,
      },
      {
        id: 14,
        ...shared,
        payoutTxHash: null,
      },
    ]);

  assert.deepEqual(
    rows.map((row) => row.id),
    [10, 12, 13],
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

test("public loader excludes founder, tribute, and generic memo rails", () => {
  const source = readFileSync(new URL("../lib/bounties.ts", import.meta.url), "utf8");
  const publicLoader = source.slice(
    source.indexOf("export async function loadBountyBoard"),
    source.indexOf("export async function loadBountyAdminSnapshot"),
  );

  assert.match(publicLoader, /claimKind: "winner_bounty"/);
  assert.match(publicLoader, /status: "claimed"/);
  assert.match(publicLoader, /claimedByUserId: \{ not: null \}/);
  assert.match(publicLoader, /payoutTxHash: \{ not: null \}/);
  assert.match(publicLoader, /entry\.hasFeaturedAvatar/);
  assert.match(publicLoader, /featuredAvatarCardUrlForUser/);
  assert.match(publicLoader, /dedupeVerifiedLegacyWinnerBounties/);
  assert.match(publicLoader, /isVerifiedCanonicalBountyPayout/);
  assert.match(publicLoader, /isPublicBountyContract/);
  assert.doesNotMatch(publicLoader, /events:\s*\{/);
  assert.doesNotMatch(publicLoader, /valuations:\s*\{/);
  assert.doesNotMatch(publicLoader, /take: 300/);
  assert.doesNotMatch(publicLoader, /\.slice\(0, 300\)/);
  assert.doesNotMatch(publicLoader, /prisma\.trophyPayout/);
  assert.doesNotMatch(publicLoader, /prisma\.woloIndexedTransfer/);
  assert.doesNotMatch(publicLoader, /founders_bonus/);
  assert.doesNotMatch(publicLoader, /daily_tribute/);
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
